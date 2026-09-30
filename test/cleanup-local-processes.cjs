'use strict';
// Linux-only recovery for registered leaders, not a SIGKILL recovery certificate.
const fs = require('node:fs');
const path = require('node:path');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function exists(pid) {
  try { process.kill(pid, 0); return true; }
  catch (error) { if (error.code === 'ESRCH') return false; throw error; }
}
function validateRegistry(registry, owner) {
  if (process.platform !== 'linux' || !/^ken-framework-db-e2e-[a-f0-9]{24}$/.test(owner)) {
    throw new Error('Linux and valid owner required');
  }
  const stat = fs.lstatSync(registry);
  if (!stat.isFile() || stat.uid !== process.getuid() || (stat.mode & 0o777) !== 0o600 || stat.size > 1024 * 1024) {
    throw new Error('Unsafe process registry');
  }
}
function identity(record, owner) {
  const directory = `/proc/${record.pid}`;
  if (fs.statSync(directory).uid !== process.getuid()) throw new Error('Process user mismatch');
  const args = fs.readFileSync(`${directory}/cmdline`, 'utf8').split('\0');
  if (args[0] !== process.execPath || !args.includes(record.bundle) ||
      !args.includes(`--ken-e2e-owner=${owner}`)) throw new Error('Process identity mismatch; no signal sent');
}
async function cleanup(registry, owner) {
  validateRegistry(registry, owner);
  const records = new Map();
  for (const line of fs.readFileSync(registry, 'utf8').split('\n').filter(Boolean)) {
    const item = JSON.parse(line);
    if (item.owner !== owner || !Number.isSafeInteger(item.pid) || item.pid <= 1 ||
        !['auth', 'users', 'admin'].includes(item.api) ||
        item.bundle !== path.resolve(process.cwd(), `dist/apps/${item.api}/main.js`) ||
        !['started', 'closed'].includes(item.state)) throw new Error('Invalid process record');
    const previous = records.get(item.pid);
    if (item.state === 'closed' && (!previous || previous.state !== 'started')) {
      throw new Error('Unmatched process tombstone');
    }
    records.set(item.pid, item);
  }
  let failed = false;
  for (const record of records.values()) {
    // A closed tombstone follows observed child close and absent process group.
    // Ignore its PID entirely: a later unrelated process may reuse that number.
    if (record.state === 'closed') continue;
    try {
      if (!exists(record.pid)) {
        if (exists(-record.pid)) throw new Error('Dead leader with unproven remaining group');
        continue;
      }
      identity(record, owner);
      process.kill(-record.pid, 'SIGTERM');
      let deadline = Date.now() + 5000;
      while (exists(record.pid) && Date.now() < deadline) await delay(50);
      if (exists(record.pid)) {
        // Revalidate immediately before every signal, including escalation.
        identity(record, owner);
        process.kill(-record.pid, 'SIGKILL');
        deadline = Date.now() + 3000;
        while (exists(record.pid) && Date.now() < deadline) await delay(50);
      }
      if (exists(record.pid) || exists(-record.pid)) throw new Error('Process group absence unproven');
    } catch {
      failed = true;
      console.error('PROCESS_CLEANUP_FAILED: owned record could not be safely cleared');
    }
  }
  if (failed) throw new Error('Process cleanup incomplete');
  console.log('PROCESS_CLEANUP_OK');
}
module.exports = { cleanup, identity, exists, validateRegistry };
if (require.main === module) {
  const [registry, owner, ...extra] = process.argv.slice(2);
  Promise.resolve().then(() => {
    if (!registry || !owner || extra.length) throw new Error('Registry and owner required');
    return cleanup(registry, owner);
  }).catch(() => { console.error('PROCESS_CLEANUP_FAILED'); process.exitCode = 1; });
}
