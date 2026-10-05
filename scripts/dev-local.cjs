'use strict';
// Foreground, build-once local session. No install, generation, pull or watcher.
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { execFile, spawn } = require('node:child_process');
const root = fs.realpathSync(path.resolve(__dirname, '..'));
const script = path.join(root, 'scripts/dev-local.cjs');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const clean = { PATH: process.env.PATH, HOME: process.env.HOME, CI: '1', CHECKPOINT_DISABLE: '1',
  PRISMA_HIDE_UPDATE_MESSAGE: '1', PRISMA_SKIP_POSTINSTALL_GENERATE: '1', COREPACK_ENABLE_NETWORK: '0' };
const ownerPattern = /^ken-framework-db-e2e-[a-f0-9]{24}$/;
let session, metadata, stopping = false, interrupted = false, failure;
process.umask(0o077);
function check(ok, message) { if (!ok) throw new Error(message); }
function privatePath(file, directory = false) {
  const stat = fs.lstatSync(file);
  check((directory ? stat.isDirectory() : stat.isFile()) && stat.uid === process.getuid() &&
    (stat.mode & 0o777) === (directory ? 0o700 : 0o600), 'Unsafe session metadata');
}
function present(file) {
  try { fs.lstatSync(file); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}
function localDirectory() {
  const stat = fs.lstatSync(path.join(root, '.local'));
  check(stat.isDirectory() && stat.uid === process.getuid() && !(stat.mode & 0o022), 'Unsafe .local directory');
}
function json(file, value) {
  if (present(file)) privatePath(file);
  const fd = fs.openSync(file, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_TRUNC | fs.constants.O_NOFOLLOW, 0o600);
  try { fs.writeFileSync(fd, JSON.stringify(value, null, 2) + '\n'); } finally { fs.closeSync(fd); }
}
function save() { json(path.join(session, 'session.json'), metadata); }
function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { cwd: root, env: clean, timeout: 15000, maxBuffer: 8 * 1024 * 1024,
      ...options }, (error, stdout, stderr) => {
      if (options.log) fs.writeFileSync(options.log, stdout + stderr, { mode: 0o600 });
      if (error) reject(new Error(`Command failed: ${path.basename(command)}; inspect private session logs`));
      else resolve(stdout.trim());
    });
  });
}
function socket(host) {
  check(typeof host === 'string' && /^unix:\/\/\/[^\n\r]+$/.test(host) &&
    fs.statSync(host.slice(7)).isSocket(), 'Existing local Unix Docker socket required');
}
function docker(...args) { return run('docker', ['--host', metadata.dockerhost, ...args]); }
function stopRequested() {
  const file = path.join(session, 'stop-request.json');
  if (!present(file)) return false;
  privatePath(file);
  check(JSON.parse(fs.readFileSync(file, 'utf8')).owner === metadata.owner, 'Invalid stop request');
  return true;
}
function active() { check(!interrupted && !failure && !stopRequested(), failure || 'Session interrupted'); }
async function until(predicate, timeout) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { active(); if (await predicate()) return; await sleep(100); }
  throw new Error('Owned resource readiness timed out');
}
async function cleanup() {
  stopping = true;
  let failed = false;
  try {
    await run(process.execPath, [path.join(root, 'test/cleanup-local-processes.cjs'), metadata.registry, metadata.owner], { timeout: 40000 });
  } catch { failed = true; }
  // CID file covers Docker creation before the command callback saves metadata.
  try {
    const cidfile = path.join(session, 'container.cid');
    let cid = metadata.cid;
    if (present(cidfile)) {
      privatePath(cidfile);
      const stored = fs.readFileSync(cidfile, 'utf8').trim();
      check(!cid || cid === stored, 'Container identity mismatch'); cid = stored;
    }
    if (cid) {
      check(/^[a-f0-9]{64}$/.test(cid), 'Invalid container identity');
      const remaining = await docker('ps', '-aq', '--no-trunc', '--filter', `id=${cid}`);
      if (remaining) {
        check(remaining === cid, 'Unknown container identity');
        check(await docker('inspect', '--format', '{{ index .Config.Labels "ken.e2e.owner" }}', cid) === metadata.owner,
          'Container owner mismatch');
        const state = await docker('inspect', '--format', '{{.State.Status}}', cid);
        if (state === 'created') await docker('rm', cid);
        else await docker('stop', '--time', '5', cid);
        const deadline = Date.now() + 20000;
        while (await docker('ps', '-aq', '--no-trunc', '--filter', `id=${cid}`)) {
          check(Date.now() < deadline, 'Container removal unconfirmed'); await sleep(250);
        }
      }
    } else check(!(await docker('ps', '-aq', '--filter', `name=^/${metadata.owner}$`)), 'Container identity unavailable');
  } catch { failed = true; }
  metadata.state = failed ? 'cleanup-failed' : 'stopped'; save();
  check(!failed, `Cleanup incomplete; inspect private metadata: ${session}`);
}
async function stopExisting(argument) {
  session = path.resolve(argument);
  check(path.dirname(session) === path.join(root, '.local') && /^session-[a-f0-9]{24}$/.test(path.basename(session)), 'Invalid session path');
  localDirectory(); privatePath(session, true);
  privatePath(path.join(session, 'session.json'));
  metadata = JSON.parse(fs.readFileSync(path.join(session, 'session.json'), 'utf8'));
  check(metadata.root === root && metadata.node === process.execPath && ownerPattern.test(metadata.owner) &&
    metadata.owner.endsWith(path.basename(session).slice(8)) &&
    metadata.registry === path.join(session, 'processes.jsonl') &&
    (metadata.cid === null || /^[a-f0-9]{64}$/.test(metadata.cid)), 'Invalid session ownership');
  privatePath(metadata.registry); socket(metadata.dockerhost);
  check(Number.isSafeInteger(metadata.supervisor) && metadata.supervisor > 1, 'Invalid supervisor');
  const proc = `/proc/${metadata.supervisor}`;
  if (fs.existsSync(proc) && !['stopped', 'cleanup-failed'].includes(metadata.state)) {
    const args = fs.readFileSync(`${proc}/cmdline`, 'utf8').split('\0');
    check(fs.statSync(proc).uid === process.getuid() && args[0] === process.execPath &&
      args[1] && path.resolve(fs.readlinkSync(`${proc}/cwd`), args[1]) === script && !args.includes('--stop'),
      'Unknown supervisor identity; no cleanup attempted');
    json(path.join(session, 'stop-request.json'), { owner: metadata.owner });
    const deadline = Date.now() + 240000;
    while (fs.existsSync(proc)) {
      privatePath(path.join(session, 'session.json'));
      const current = JSON.parse(fs.readFileSync(path.join(session, 'session.json'), 'utf8'));
      if (current.state === 'stopped') { console.log(`Stopped owned session: ${session}`); return; }
      check(current.state !== 'cleanup-failed', 'Supervisor cleanup failed; retry stop after exit');
      check(Date.now() < deadline, 'Supervisor stop timed out; inspect private metadata');
      await sleep(250);
    }
  }
  await cleanup();
  console.log(`Stopped owned session: ${session}`);
}
const prerequisiteCode = `
const {createRequire}=require('node:module'), fs=require('node:fs'), path=require('node:path');
(async()=>{
 const fromRoot=createRequire(process.argv[1]);
 const prisma=fromRoot.resolve('prisma/package.json');
 const engines=createRequire(prisma).resolve('@prisma/engines/package.json');
 const platform=await createRequire(engines)('@prisma/get-platform').getBinaryTargetForCurrentPlatform();
 const engine=path.join(path.dirname(engines),'schema-engine-'+platform);
 fs.accessSync(engine,fs.constants.X_OK);
 const client=new (fromRoot('@prisma/client').PrismaClient)(); await client.$disconnect();
 await fromRoot('bcrypt').hash('Native.Check1',4); process.stdout.write(engine);
})().catch(()=>process.exitCode=1);`;
const seedCode = `
const {createRequire}=require('node:module'), fs=require('node:fs'), crypto=require('node:crypto');
const local=createRequire(process.argv[1]), db=new (local('@prisma/client').PrismaClient)();
(async()=>{
 const counts=await Promise.all([db.user.count(),db.userInfo.count(),db.emailCode.count(),db.twoFactorCode.count()]);
 if(counts.some(n=>n!==0)) throw Error('Nonempty fixture');
 const password='Aa1!'+crypto.randomBytes(8).toString('hex');
 const email='local-admin@example.invalid';
 fs.writeFileSync(process.argv[2],JSON.stringify({email,username:'localadmin',password}),{mode:0o600,flag:'wx'});
 await db.user.create({data:{email,username:'localadmin',password:await local('bcrypt').hash(password,10),role:3,userStatus:1,email_verified:new Date()}});
})().catch(()=>process.exitCode=1).finally(()=>db.$disconnect());`;
function launch(api, env) {
  const bundle = path.join(root, `dist/apps/${api}/main.js`);
  const stdout = path.join(session, `${api}.stdout.log`), stderr = path.join(session, `${api}.stderr.log`);
  const out = fs.openSync(stdout, 'wx', 0o600), err = fs.openSync(stderr, 'wx', 0o600);
  let child;
  try { child = spawn(process.execPath, ['--require', path.join(root, 'test/local-network-guard.cjs'), bundle,
    `--ken-e2e-owner=${metadata.owner}`], { cwd: root, detached: true, env, stdio: ['ignore', out, err] }); }
  finally { fs.closeSync(out); fs.closeSync(err); }
  const record = { pid: child.pid, owner: metadata.owner, api, bundle, state: 'started' };
  const running = { child, stdout, api, closed: false, url: null };
  // Observe immediately so the parent reaps leaders while the helper waits.
  child.once('error', () => { failure = `Owned ${api} spawn failed`; });
  child.once('exit', () => { running.closed = true; if (!stopping) failure = `Owned ${api} exited unexpectedly`; });
  check(child.pid, 'API spawn failed');
  fs.appendFileSync(metadata.registry, JSON.stringify(record) + '\n');
  return running;
}
function readReady(running) {
  check(!running.closed, 'API exited before readiness');
  check(fs.statSync(running.stdout).size < 1024 * 1024, 'Startup log too large');
  const lines = fs.readFileSync(running.stdout, 'utf8').split('\n'); lines.pop();
  const ready = lines.filter(line => line.startsWith('LOCAL_READY '));
  if (!ready.length) return false;
  check(ready.length === 1, 'Duplicate readiness');
  const value = JSON.parse(ready[0].slice(12)), url = new URL(value.url);
  check(value.api === running.api && value.pid === running.child.pid && url.protocol === 'http:' &&
    url.hostname === '127.0.0.1' && Number(url.port) > 0 && !url.username && !url.password &&
    url.pathname === '/' && !url.search && !url.hash, 'Invalid owned readiness');
  running.url = url.origin; return true;
}
async function start() {
  check(!Object.hasOwn(process.env, 'DATABASE_URL') && process.env.PROD !== 'true' &&
    process.env.NODE_ENV !== 'production', 'Unset DATABASE_URL and production flags first');
  for (const name of ['.env', 'prisma/.env']) {
    let present = true;
    try { fs.lstatSync(path.join(root, name)); } catch (error) { if (error.code === 'ENOENT') present = false; else throw error; }
    check(!present, 'Environment-file-free project required');
  }
  await run('pnpm', ['--version']);
  const dockerhost = process.env.DOCKER_HOST ?? await run('docker', ['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}']);
  socket(dockerhost);
  const engine = await run(process.execPath, ['-e', prerequisiteCode, path.join(root, 'package.json')]);
  const nonce = randomBytes(12).toString('hex'), owner = `ken-framework-db-e2e-${nonce}`;
  const local = path.join(root, '.local');
  if (!present(local)) fs.mkdirSync(local, { mode: 0o700 });
  localDirectory();
  session = path.join(local, `session-${nonce}`); fs.mkdirSync(session, { mode: 0o700 });
  for (const file of ['processes.jsonl', 'network.jsonl']) fs.writeFileSync(path.join(session, file), '', { mode: 0o600, flag: 'wx' });
  fs.mkdirSync(path.join(session, 'outbox'), { mode: 0o700 });
  metadata = { root, node: process.execPath, supervisor: process.pid, dockerhost, owner, cid: null, registry: path.join(session, 'processes.jsonl'), state: 'starting', urls: {} }; save();
  const quote = text => `'${text.replaceAll("'", "'\\''")}'`;
  console.log(`Private session: ${session}\nStop: ${quote(process.execPath)} ${quote(script)} --stop ${quote(session)}`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { interrupted = true; });
  try {
    const db = `ken_e2e_${nonce}`;
    active();
    await docker('create', '--pull=never', '--rm', '--name', owner, '--cidfile', path.join(session, 'container.cid'),
      '--label', `ken.e2e.owner=${owner}`, '--tmpfs', '/var/lib/postgresql/data', '-e', 'POSTGRES_USER=ken_e2e',
      '-e', 'POSTGRES_PASSWORD=e2e_dummy', '-e', `POSTGRES_DB=${db}`, '-p', '127.0.0.1::5432', 'postgres:16');
    metadata.cid = fs.readFileSync(path.join(session, 'container.cid'), 'utf8').trim();
    check(/^[a-f0-9]{64}$/.test(metadata.cid), 'Invalid created CID'); save(); active();
    check(await docker('inspect', '--format', '{{ index .Config.Labels "ken.e2e.owner" }}', metadata.cid) === owner, 'Created DB ownership mismatch');
    await docker('start', metadata.cid);
    await until(async () => { try { return await docker('exec', '--env', 'PGPASSWORD=e2e_dummy', metadata.cid, 'psql', '-h', '127.0.0.1', '-U', 'ken_e2e', '-d', db, '-Atc', 'SELECT 1') === '1'; } catch { return false; } }, 60000);
    const binding = await docker('inspect', '--format', '{{range (index .NetworkSettings.Ports "5432/tcp")}}{{.HostIp}}:{{.HostPort}}{{end}}', metadata.cid);
    check(/^127\.0\.0\.1:[1-9][0-9]*$/.test(binding), 'Invalid owned DB binding');
    const tables = await docker('exec', '--env', 'PGPASSWORD=e2e_dummy', metadata.cid, 'psql', '-h', '127.0.0.1', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'ken_e2e', '-d', db, '-Atc',
      "SELECT count(*) FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema')");
    check(tables === '0', 'Fresh DB is not empty'); active();
    const database = `postgresql://ken_e2e:e2e_dummy@${binding}/${db}`;
    fs.copyFileSync(path.join(root, 'prisma/schema.prisma'), path.join(session, 'schema.prisma'));
    fs.cpSync(path.join(root, 'prisma/migrations'), path.join(session, 'migrations'), { recursive: true });
    const dbEnv = { ...clean, DATABASE_URL: database, PRISMA_SCHEMA_ENGINE_BINARY: engine };
    await run(process.execPath, [path.join(root, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy', '--schema', path.join(session, 'schema.prisma')],
      { cwd: session, env: dbEnv, timeout: 120000, log: path.join(session, 'migrate.log') }); active();
    await run(process.execPath, ['-e', seedCode, path.join(root, 'package.json'), path.join(session, 'admin-credentials.json')], { cwd: session, env: dbEnv });
    for (const api of ['auth', 'users', 'admin']) {
      active(); await run('pnpm', ['exec', 'nest', 'build', api], { timeout: 180000, log: path.join(session, `build-${api}.log`) });
    }
    const jwt = randomBytes(32).toString('hex');
    const env = { PATH: clean.PATH, HOME: clean.HOME, DATABASE_URL: database, JWT_SECRET: jwt, JWT_KEY: jwt,
      LOCAL_MODE: 'true', PROD: 'false', NODE_ENV: 'development',
      AUTH_PORT: process.env.AUTH_PORT ?? '3011', USERS_PORT: process.env.USERS_PORT ?? '3012', ADMIN_PORT: process.env.ADMIN_PORT ?? '3013',
      LOCAL_MAIL_DIR: path.join(session, 'outbox'), KEN_E2E_OWNER: owner, KEN_E2E_NETWORK_AUDIT: path.join(session, 'network.jsonl') };
    for (const api of ['auth', 'users', 'admin']) {
      active(); const child = launch(api, env);
      await until(() => readReady(child), 20000);
      metadata.urls[api] = `${child.url}/documentation`;
    }
    active(); metadata.state = 'ready'; save();
    for (const [api, url] of Object.entries(metadata.urls)) console.log(`${api} Swagger: ${url}`);
    console.log(`Admin credentials: ${path.join(session, 'admin-credentials.json')}\nMail JSON: ${env.LOCAL_MAIL_DIR}\nBuilt once; Ctrl+C stops owned APIs and discards only this fresh DB.`);
    while (!interrupted && !failure && !stopRequested()) await sleep(200);
    if (failure) throw new Error(failure);
  } finally { await cleanup(); }
}
(async () => {
  check(process.platform === 'linux', 'Linux with /proc required');
  const args = process.argv.slice(2);
  if (args.length === 2 && args[0] === '--stop') await stopExisting(args[1]);
  else { check(args.length === 0, 'Usage: dev-local.cjs [--stop <session-directory>]'); await start(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
