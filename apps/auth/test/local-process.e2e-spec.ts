import { spawn, ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { appendFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as request from 'supertest';

type Api = 'auth' | 'users' | 'admin';
type Running = {
  child: ChildProcess; pid: number; api: Api; bundle: string; log: string;
  overflow: boolean; ready?: string; invalidReady: boolean; closed: boolean;
  exit: Promise<void>; code?: number | null; signal?: string | null;
};
const root = process.cwd();
const recovery = require(resolve(root, 'test/cleanup-local-processes.cjs'));
const enabled = process.env.KEN_E2E_PROCESS === '1';
const sleep = (ms: number) => new Promise(done => setTimeout(done, ms));

(enabled ? describe : describe.skip)('Compiled local processes (requires KEN_E2E_PROCESS=1 via test:local; Linux)', () => {
  const children: Running[] = [];
  const emails = new Set<string>();
  const ids = new Set<number>();
  const secrets = new Set<string>();
  const password = 'Process.1234';
  const jwtSecret = 'ken-process-only-not-a-production-secret';
  const owner = process.env.KEN_E2E_OWNER!;
  const registry = process.env.KEN_E2E_PROCESS_REGISTRY!;
  let prisma: PrismaClient;
  let directory: string;
  let outbox: string;
  let audit: string;
  let database: string;
  let auth: Running;
  let users: Running;
  let admin: Running;
  let adminEmail: string;
  let adminId: number;

  function record(child: Running, state: 'started' | 'closed') {
    appendFileSync(registry, JSON.stringify({ pid: child.pid, owner, api: child.api, bundle: child.bundle, state }) + '\n');
  }

  function launch(api: Api, overrides: { port?: string; database?: string } = {}) {
    const bundle = resolve(root, `dist/apps/${api}/main.js`);
    const child = spawn(process.execPath, [
      '--require', resolve(root, 'test/local-network-guard.cjs'), bundle, `--ken-e2e-owner=${owner}`,
    ], {
      cwd: root, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        PATH: process.env.PATH, HOME: process.env.HOME,
        DATABASE_URL: overrides.database || database,
        JWT_SECRET: jwtSecret, JWT_KEY: jwtSecret, LOCAL_MODE: 'true', PROD: 'false', NODE_ENV: 'test',
        AUTH_PORT: '0', USERS_PORT: '0', ADMIN_PORT: '0', [`${api.toUpperCase()}_PORT`]: overrides.port || '0',
        LOCAL_MAIL_DIR: outbox, KEN_E2E_OWNER: owner, KEN_E2E_NETWORK_AUDIT: audit,
      },
    });
    const running: Running = {
      child, pid: child.pid!, api, bundle, log: '', overflow: false,
      invalidReady: false, closed: false, exit: undefined!,
    };
    // Install exit/error observation immediately; register before the first await.
    running.exit = new Promise<void>(done => {
      child.once('error', () => { running.invalidReady = true; });
      child.once('close', (code, signal) => {
        running.closed = true; running.code = code; running.signal = signal;
        done();
      });
    });
    if (!child.pid) throw new Error('Owned process spawn failed');
    children.push(running);
    record(running, 'started');
    let pending = '';
    function capture(chunk: Buffer, stdout: boolean) {
      const text = chunk.toString();
      if (running.log.length + text.length > 128 * 1024) running.overflow = true;
      running.log = (running.log + text).slice(0, 128 * 1024);
      if (!stdout) return;
      pending += text;
      if (pending.length > 128 * 1024) { running.overflow = true; pending = ''; return; }
      const lines = pending.split('\n');
      pending = lines.pop()!;
      for (const line of lines) {
        if (!line.startsWith('LOCAL_READY ')) continue;
        try {
          const value = JSON.parse(line.slice('LOCAL_READY '.length));
          const url = new URL(value.url);
          if (running.ready || value.api !== api || value.pid !== child.pid ||
              url.protocol !== 'http:' || url.hostname !== '127.0.0.1' ||
              !url.port || Number(url.port) < 1 || url.username || url.password ||
              url.pathname !== '/' || url.search || url.hash) throw new Error('Invalid readiness');
          running.ready = url.origin;
        } catch { running.invalidReady = true; }
      }
    }
    child.stdout!.on('data', data => capture(data, true));
    child.stderr!.on('data', data => capture(data, false));
    return running;
  }

  async function ready(child: Running) {
    const deadline = Date.now() + 15000;
    while (!child.ready && !child.closed && !child.invalidReady && !child.overflow && Date.now() < deadline) await sleep(25);
    if (!child.ready || child.closed || child.invalidReady || child.overflow) throw new Error('Owned API readiness failed');
    return child;
  }

  async function closed(child: Running, timeout = 7000) {
    const deadline = Date.now() + timeout;
    while (!child.closed && Date.now() < deadline) await sleep(25);
    if (!child.closed) throw new Error('Owned process exit deadline exceeded');
    await child.exit;
    if (recovery.exists(-child.pid)) throw new Error('Owned process group still present');
  }

  const tombstones = new Set<Running>();
  function tombstone(child: Running) {
    if (!tombstones.has(child)) { record(child, 'closed'); tombstones.add(child); }
  }
  async function stop(child: Running) {
    if (!child.closed) {
      recovery.identity(child, owner);
      process.kill(-child.pid, 'SIGTERM');
    }
    await closed(child);
    tombstone(child);
  }
  function call(child: Running, route: string, token?: string, body?: object) {
    if (!child.ready || child.closed || !route.startsWith('/') || route.startsWith('//')) throw new Error('Unowned HTTP target');
    const req = body ? request(child.ready).post(route).send(body) : request(child.ready).get(route);
    if (token) req.set('Authorization', `Bearer ${token}`);
    return req.timeout({ response: 3000, deadline: 5000 });
  }
  function messages() {
    return readdirSync(outbox).filter(name => name.endsWith('.json')).map(name => {
      const file = join(outbox, name);
      expect(lstatSync(file).isFile()).toBe(true);
      expect(lstatSync(file).mode & 0o777).toBe(0o600);
      return { name, body: JSON.parse(readFileSync(file, 'utf8')) };
    });
  }
  async function login(email: string) {
    const result = await call(auth, '/auth/login', undefined, { identifier: email, password });
    expect(result.status).toBe(201);
    const token = result.body.token;
    expect(typeof token === 'string' && token.length > 0).toBe(true);
    secrets.add(token);
    return token as string;
  }
  function privateLogs() {
    for (const child of children) {
      expect(child.overflow).toBe(false);
      expect(child.invalidReady).toBe(false);
      // Boolean checks deliberately keep credential values out of assertion diffs.
      expect([...secrets].some(secret => child.log.includes(secret))).toBe(false);
      expect(/postgres(?:ql)?:\/\//i.test(child.log)).toBe(false);
    }
  }

  beforeAll(async () => {
    recovery.validateRegistry(registry, owner);
    if (process.platform !== 'linux') throw new Error('Process fixtures require Linux /proc');
    const raw = process.env.KEN_E2E_DATABASE_URL!;
    const url = new URL(raw);
    if (process.env.KEN_E2E_DISPOSABLE !== '1' || url.protocol !== 'postgresql:' ||
        url.hostname !== '127.0.0.1' || !url.port || url.username !== 'ken_e2e' ||
        url.password !== 'e2e_dummy' || url.pathname !== `/ken_e2e_${owner.slice('ken-framework-db-e2e-'.length)}` ||
        url.search || url.hash) throw new Error('Owned synthetic database required');
    database = url.href;
    secrets.add(password); secrets.add(jwtSecret); secrets.add(url.password);
    directory = mkdtempSync(join(dirname(registry), 'process-suite-'));
    outbox = join(directory, 'outbox');
    mkdirSync(outbox, { mode: 0o700 });
    audit = join(directory, 'network.jsonl');
    writeFileSync(audit, '', { mode: 0o600, flag: 'wx' });
    prisma = new PrismaClient({ datasources: { db: { url: database } } });
    const counts = await Promise.all([prisma.user.count(), prisma.userInfo.count(), prisma.emailCode.count(), prisma.twoFactorCode.count()]);
    expect(counts).toEqual([0, 0, 0, 0]);
    // Private test fixture only, NOT a production first-admin bootstrap or public signup.
    adminEmail = `process-admin-${randomBytes(5).toString('hex')}@example.invalid`;
    emails.add(adminEmail); secrets.add(adminEmail);
    const seeded = await prisma.user.create({ data: {
      email: adminEmail, username: `pa${randomBytes(5).toString('hex')}`,
      password: await bcrypt.hash(password, 10), role: 3, userStatus: 1, email_verified: new Date(),
    } });
    adminId = seeded.id; ids.add(adminId);
    auth = await ready(launch('auth'));
    users = await ready(launch('users'));
    admin = await ready(launch('admin'));
  }, 60000);

  afterAll(async () => {
    let failure = false;
    // Iterate every registered child, including children from a failed beforeAll.
    for (const child of children) {
      try { await stop(child); } catch { failure = true; }
    }
    try { if (registry && owner) await recovery.cleanup(registry, owner); } catch { failure = true; }
    const absent = children.every(child => child.closed && !recovery.exists(-child.pid));
    if (prisma) {
      try {
        if (!absent) throw new Error('Refusing database cleanup while children remain');
        const ownedEmails = [...emails];
        // Email ownership was recorded BEFORE writes/API calls, covering partial failures.
        const owned = await prisma.user.findMany({ where: { email: { in: ownedEmails } }, select: { id: true } });
        owned.forEach(user => ids.add(user.id));
        await prisma.$transaction([
          prisma.twoFactorCode.deleteMany({ where: { email: { in: ownedEmails } } }),
          prisma.emailCode.deleteMany({ where: { email: { in: ownedEmails } } }),
          prisma.userInfo.deleteMany({ where: { userId: { in: [...ids] } } }),
          prisma.user.deleteMany({ where: { id: { in: [...ids] }, email: { in: ownedEmails } } }),
        ]);
      } catch { failure = true; }
      finally { await prisma.$disconnect(); }
    }
    if (failure) throw new Error('Process fixture cleanup required fallback or failed');
  }, 120000);

  it('blocks external JS transports using preinstalled wire-free stubs', () => {
    // Stubs are installed before loading the guard: even a broken guard cannot reach a wire.
    const http = require('node:http');
    const https = require('node:https');
    const savedFetch = globalThis.fetch;
    const original = [http.request, http.get, https.request, https.get];
    const savedAudit = process.env.KEN_E2E_NETWORK_AUDIT;
    const selfAudit = join(directory, 'guard-selftest.jsonl');
    writeFileSync(selfAudit, '', { mode: 0o600, flag: 'wx' });
    let wires = 0;
    const stub = () => { wires++; return {}; };
    try {
      http.request = http.get = https.request = https.get = stub;
      globalThis.fetch = stub as any;
      process.env.KEN_E2E_NETWORK_AUDIT = selfAudit;
      jest.isolateModules(() => require(resolve(root, 'test/local-network-guard.cjs')));
      const attempts = [
        () => http.request('http://secret:password@example.invalid/private?q=secret'),
        () => http.get(new URL('http://example.invalid')),
        () => https.request({ hostname: 'example.invalid', headers: { authorization: 'secret' } }),
        () => https.get('https://127.0.0.1', { hostname: 'example.invalid' }),
        () => globalThis.fetch('https://example.invalid'),
        () => globalThis.fetch(new URL('https://example.invalid')),
        () => globalThis.fetch(new Request('https://example.invalid')),
      ];
      for (const attempt of attempts) expect(attempt).toThrow('External network blocked');
      expect(wires).toBe(0);
      http.get('http://127.0.0.1:1');
      expect(wires).toBe(1);
      const rows = readFileSync(selfAudit, 'utf8').trim().split('\n').map(line => JSON.parse(line));
      expect(rows).toHaveLength(attempts.length);
      expect(rows.every(row => Object.keys(row).sort().join(',') === 'host,operation' && row.host === 'example.invalid')).toBe(true);
    } finally {
      [http.request, http.get, https.request, https.get] = original;
      globalThis.fetch = savedFetch;
      if (savedAudit === undefined) delete process.env.KEN_E2E_NETWORK_AUDIT;
      else process.env.KEN_E2E_NETWORK_AUDIT = savedAudit;
    }
  });

  it.each(['auth', 'users', 'admin'] as Api[])('serves real %s Swagger UI, local JS/CSS and OpenAPI 3', async api => {
    const child = { auth, users, admin }[api];
    const html = await call(child, '/documentation');
    expect(html.status).toBe(200);
    expect(html.headers['content-type']).toContain('text/html');
    const assets = [...html.text.matchAll(/(?:src|href)=["']([^"']+\.(?:js|css)(?:\?[^"']*)?)["']/g)].map(match => match[1]);
    expect(assets.some(asset => asset.includes('.js'))).toBe(true);
    expect(assets.some(asset => asset.includes('.css'))).toBe(true);
    for (const asset of assets) {
      const url = new URL(asset, `${child.ready}/documentation/`);
      // Validate before fetching: never follow external Swagger asset URLs.
      expect(url.origin === child.ready && !url.username && !url.password).toBe(true);
      const response = await call(child, url.pathname + url.search);
      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toMatch(url.pathname.endsWith('.css') ? /text\/css/ : /(?:java|ecma)script/);
    }
    const schema = await call(child, '/documentation-json');
    expect(schema.status).toBe(200);
    expect(schema.body.openapi).toMatch(/^3\./);
  });

  it('captures signup and support privately; verification unlocks the SAME JWT across APIs', async () => {
    const email = `process-${randomBytes(5).toString('hex')}@example.invalid`;
    emails.add(email); secrets.add(email); secrets.add('support@example.invalid');
    expect(messages()).toHaveLength(0);
    const signup = await call(auth, '/auth/signup', undefined, { email, username: `pu${randomBytes(5).toString('hex')}`, password });
    expect(signup.status).toBe(201);
    const captured = messages();
    expect(captured).toHaveLength(1);
    expect(lstatSync(outbox).mode & 0o777).toBe(0o700);
    expect(captured[0].body.to === email).toBe(true);
    const links = captured[0].body.text.match(/http:\/\/[^\s<>"']+/g) || [];
    expect(links).toHaveLength(1);
    const link = new URL(links[0]);
    expect(link.origin === auth.ready && link.pathname === '/auth/verify').toBe(true);
    const code = link.searchParams.get('token')!;
    expect(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(code)).toBe(true);
    secrets.add(code);
    const token = await login(email);
    expect((await call(auth, '/auth/user', token)).status).toBe(403);
    expect((await call(users, '/user/me', token)).status).toBe(403);
    expect((await call(auth, link.pathname + link.search)).status).toBe(200);
    expect((await call(auth, '/auth/user', token)).status).toBe(200);
    expect((await call(users, '/user/me', token)).status).toBe(200);
    expect((await call(admin, '/', token)).status).toBe(403);
    const support = await call(users, '/support', token, { subject: 'Local test', type: 'question', description: 'Owned process support capture' });
    expect(support.status).toBe(201);
    expect(support.body.status).toBe(202);
    const mail = messages();
    expect(mail).toHaveLength(2);
    expect(mail.filter(item => item.body.to === 'support@example.invalid')).toHaveLength(1);
    for (const child of [auth, users, admin]) {
      for (const item of mail) {
        for (const prefix of ['/.local/mail/', '/uploads/']) {
          const response = await call(child, prefix + item.name);
          expect(response.status).toBe(404);
          expect(response.text.includes(code) || response.text.includes(email)).toBe(false);
        }
      }
    }
    privateLogs();
  });

  it('uses a real admin login and revokes the SAME JWT after database demotion', async () => {
    const token = await login(adminEmail);
    expect((await call(admin, '/', token)).status).toBe(200);
    expect((await call(admin, '/users/all', token)).status).toBe(200);
    await prisma.user.update({ where: { id: adminId }, data: { role: 0 } });
    expect((await call(admin, '/', token)).status).toBe(403);
    expect((await call(admin, '/users/all', token)).status).toBe(403);
  });

  it('rejects a second auth listener on the owned port without harming the primary', async () => {
    const other = launch('auth', { port: new URL(auth.ready!).port });
    await closed(other, 15000); tombstone(other);
    expect(other.code).toBe(1);
    expect(other.ready === undefined).toBe(true);
    expect((await call(auth, '/documentation-json')).status).toBe(200);
    privateLogs();
  }, 20000);

  it('rejects wrong credentials on the SAME owned PostgreSQL endpoint without leaking them', async () => {
    const wrong = new URL(database);
    wrong.password = 'owned-wrong-password'; secrets.add(wrong.password);
    const other = launch('auth', { database: wrong.href });
    await closed(other, 15000); tombstone(other);
    expect(other.code).toBe(1);
    expect(other.ready === undefined).toBe(true);
    privateLogs();
  }, 20000);

  it('makes no external attempts and gracefully closes every registered process group', async () => {
    expect(existsSync(audit)).toBe(true);
    expect(readFileSync(audit, 'utf8').length === 0).toBe(true);
    for (const child of children) {
      const wasLive = !child.closed;
      await stop(child);
      if (wasLive) expect(child.code === 0 || child.signal === 'SIGTERM').toBe(true);
      expect(recovery.exists(child.pid) || recovery.exists(-child.pid)).toBe(false);
    }
    expect(readFileSync(audit, 'utf8').length === 0).toBe(true);
    privateLogs();
  }, 30000);
});
