import * as request from 'supertest';
import { randomUUID } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { JwtService } from '@nestjs/jwt';
import { LoginModule } from '../src/auth.module';
import { EmailActions } from '../src/users/dto/reset-password.dto';
import { fixture } from '../../../test/e2e.helpers';
import { allowGoogleTicket, localMailRoot } from '../../../test/e2e.setup';

const success = { status: 200, success: 'Email verified!' };
const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('Local signup and one-use verification (integration)', () => {
  const api = fixture(LoginModule);
  const outbox = process.env.LOCAL_MAIL_DIR!;
  let sequence = 0;
  beforeAll(() => api.start());
  afterAll(() => api.close());

  function signupData() {
    const username = `local-${++sequence}`;
    return { username, email: api.ownEmail(`${username}@example.invalid`), password: 'Test.1234' };
  }

  function files() {
    return existsSync(outbox) ? readdirSync(outbox).sort() : [];
  }

  async function snapshot() {
    return {
      users: await api.prisma.user.findMany({ orderBy: { id: 'asc' } }),
      codes: await api.prisma.emailCode.findMany({ orderBy: { id: 'asc' } }),
      messages: files(),
    };
  }

  const verify = (token?: string) => {
    const call = request(api.server).get('/auth/verify');
    return token === undefined ? call : call.query({ token });
  };
  const protectedUser = (token: string) => request(api.server).get('/auth/user')
    .set('Authorization', `Bearer ${token}`);

  async function codeFor(email: string, action: EmailActions = EmailActions.EMAIL_VERIFICATION,
    expires_at = new Date(Date.now() + 60_000)) {
    api.ownEmail(email);
    return api.prisma.emailCode.create({ data: { email, action, expires_at, code: randomUUID() } });
  }

  async function pending(role = 0, status = 0) {
    const user = await api.seed(role, status);
    const code = await codeFor(user.email);
    return { user, code };
  }

  it('delivers exactly one private backend link and unlocks the same pre-verification JWT', async () => {
    const data = signupData();
    const before = files();
    const response = await request(api.server).post('/auth/signup').send(data).expect(201);
    expect(response.body).toEqual({ status: 200, message: 'New user created' });
    const user = await api.prisma.user.findUnique({ where: { email: data.email } });
    expect(user).toMatchObject({ role: 0, userStatus: 0, email_verified: null });
    expect(await api.prisma.emailCode.count({ where: { email: data.email } })).toBe(1);

    const added = files().filter(name => !before.includes(name));
    expect(added).toHaveLength(1);
    expect(lstatSync(outbox).mode & 0o777).toBe(0o700);
    const path = join(outbox, added[0]);
    expect(lstatSync(path).isFile()).toBe(true);
    expect(lstatSync(path).mode & 0o777).toBe(0o600);
    const message = JSON.parse(readFileSync(path, 'utf8')) as { to: string; text: string };
    expect(message.to).toBe(data.email);
    // The verification credential comes only from the private message, never the signup response.
    const links = message.text.match(/http:\/\/127\.0\.0\.1:43101\/auth\/verify\?token=[^\s<>"']+/g) ?? [];
    expect(links).toHaveLength(1);
    const url = new URL(links[0]);
    const verificationToken = url.searchParams.get('token')!;
    expect(verificationToken).toMatch(uuidV4);

    const login = await request(api.server).post('/auth/login')
      .send({ identifier: data.email, password: data.password }).expect(201);
    const token = login.body.token as string;
    expect(typeof token).toBe('string');
    expect(new JwtService().verify(token, { secret: process.env.JWT_SECRET }))
      .toMatchObject({ id: user.id, role: 0 });
    await protectedUser(token).expect(403);
    await request(api.server).get(url.pathname + url.search).expect(200).expect(success);
    await protectedUser(token).expect(200);
    const activated = await api.prisma.user.findUnique({ where: { id: user.id } });
    expect(activated).toMatchObject({ role: 0, userStatus: 1 });
    expect(activated.email_verified).toBeInstanceOf(Date);
    expect(await api.prisma.emailCode.count({ where: { email: data.email } })).toBe(0);
    expect(files()).toHaveLength(before.length + 1);
  });

  it.each(['email', 'username'] as const)('rejects duplicate %s without users, codes or messages', async field => {
    const existing = await api.seed();
    const data = signupData();
    data[field] = existing[field];
    api.ownEmail(data.email);
    const before = await snapshot();
    await request(api.server).post('/auth/signup').send(data).expect(403);
    expect(await snapshot()).toEqual(before);
  });

  it('rejects invalid signup DTO without users, codes or messages', async () => {
    const data = { ...signupData(), username: 'x', password: 'weak' };
    const before = await snapshot();
    await request(api.server).post('/auth/signup').send(data).expect(400);
    expect(await snapshot()).toEqual(before);
  });

  it.each([
    { label: 'missing', token: undefined, status: 400 },
    { label: 'empty', token: '', status: 400 },
    { label: 'malformed', token: 'not-a-token', status: 400 },
    { label: 'non-v4 UUID', token: '00000000-0000-1000-8000-000000000001', status: 400 },
    { label: 'unknown UUIDv4', token: randomUUID(), status: 404 },
  ])('rejects $label verification without changing state', async ({ token, status }) => {
    await pending();
    const before = await snapshot();
    await verify(token).expect(status);
    expect(await snapshot()).toEqual(before);
  });

  it('rejects expired verification with 410 and preserves the account and code', async () => {
    const user = await api.seed(0, 0);
    const code = await codeFor(user.email, EmailActions.EMAIL_VERIFICATION, new Date(Date.now() - 60_000));
    const before = await snapshot();
    await verify(code.code).expect(410);
    expect(await snapshot()).toEqual(before);
  });

  it.each([EmailActions.PASSWORD_RESET, EmailActions.PASSWORD_SET, EmailActions.TWO_FACTOR_LOGIN])
  ('rejects wrong action %s without consuming its code', async action => {
    const user = await api.seed(0, 0);
    const code = await codeFor(user.email, action);
    const before = await snapshot();
    await verify(code.code).expect(404);
    expect(await snapshot()).toEqual(before);
  });

  it('rejects a code for a nonexistent user without consuming it', async () => {
    const code = await codeFor(signupData().email);
    const before = await snapshot();
    await verify(code.code).expect(404);
    expect(await snapshot()).toEqual(before);
  });

  it.each([2, 3, 99])('rejects account state %s without activation or consumption', async status => {
    const { code } = await pending(3, status);
    const before = await snapshot();
    await verify(code.code).expect(403);
    expect(await snapshot()).toEqual(before);
  });

  it.each([0, 3])('activates only PROCESSING to VERIFIED and preserves role %s', async role => {
    const { user, code } = await pending(role);
    const start = Date.now();
    await verify(code.code).expect(200).expect(success);
    const current = await api.prisma.user.findUnique({ where: { id: user.id } });
    expect(current).toMatchObject({ userStatus: 1, role });
    expect(current.email_verified.getTime()).toBeGreaterThanOrEqual(start);
    expect(current.email_verified.getTime()).toBeLessThanOrEqual(Date.now());
    expect(await api.prisma.emailCode.count({ where: { id: code.id } })).toBe(0);
  });

  it.each([false, true])('confirms an already VERIFIED account (existing timestamp=%s) without promotion', async stamped => {
    const { user, code } = await pending(2, 1);
    const timestamp = new Date('2020-01-02T03:04:05.000Z');
    if (stamped) await api.prisma.user.update({ where: { id: user.id }, data: { email_verified: timestamp } });
    const start = Date.now();
    await verify(code.code).expect(200).expect(success);
    const current = await api.prisma.user.findUnique({ where: { id: user.id } });
    expect(current).toMatchObject({ userStatus: 1, role: 2 });
    if (stamped) expect(current.email_verified).toEqual(timestamp);
    else {
      expect(current.email_verified.getTime()).toBeGreaterThanOrEqual(start);
      expect(current.email_verified.getTime()).toBeLessThanOrEqual(Date.now());
    }
    expect(await api.prisma.emailCode.count({ where: { id: code.id } })).toBe(0);
  });

  it('rejects replay with 404 and leaves the verified account unchanged', async () => {
    const { code } = await pending();
    await verify(code.code).expect(200).expect(success);
    const before = await snapshot();
    await verify(code.code).expect(404);
    expect(await snapshot()).toEqual(before);
  });

  it('consumes a verification once under simultaneous requests, never returning 500', async () => {
    const { user, code } = await pending();
    const responses = await Promise.all([verify(code.code), verify(code.code)]);
    expect(responses.map(response => response.status).sort()).toEqual([200, 404]);
    expect(responses.find(response => response.status === 200)!.body).toEqual(success);
    expect(await api.prisma.emailCode.count({ where: { id: code.id } })).toBe(0);
    const current = await api.prisma.user.findUnique({ where: { id: user.id } });
    expect(current).toMatchObject({ role: 0, userStatus: 1 });
    expect(current.email_verified).toBeInstanceOf(Date);
    const before = await snapshot();
    await verify(code.code).expect(404);
    expect(await snapshot()).toEqual(before);
  });

  it('returns 503 and rolls back user/code when local delivery fails', async () => {
    const data = signupData();
    const before = await snapshot();
    const regularFile = join(localMailRoot, 'not-a-directory');
    writeFileSync(regularFile, 'owned delivery failure fixture', { mode: 0o600, flag: 'wx' });
    const original = process.env.LOCAL_MAIL_DIR;
    process.env.LOCAL_MAIL_DIR = regularFile;
    try {
      await request(api.server).post('/auth/signup').send(data).expect(503);
      expect(await snapshot()).toEqual(before);
      expect(await api.prisma.user.count({ where: { email: data.email } })).toBe(0);
      expect(await api.prisma.emailCode.count({ where: { email: data.email } })).toBe(0);
    } finally { process.env.LOCAL_MAIL_DIR = original; }
    // This covers a failed capture, not a distributed filesystem/DB transaction.
  });

  it('keeps Google verification behavior without logging the returned JWT', async () => {
    const email = api.ownEmail('local-google@example.invalid');
    const ticket = 'synthetic-local-google-ticket';
    allowGoogleTicket(ticket, { email, email_verified: true, given_name: 'Local' });
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      const { body } = await request(api.server).post('/auth/google')
        .send({ googleTokenId: ticket }).expect(201);
      const token = body.token as string;
      expect(typeof token).toBe('string');
      expect(token.length > 0).toBe(true);
      const user = await api.prisma.user.findUnique({ where: { email } });
      expect(user).toMatchObject({ role: 0, userStatus: 1 });
      expect(user.email_verified).toBeInstanceOf(Date);
      expect(await api.prisma.emailCode.count({ where: { email } })).toBe(0);
      await protectedUser(token).expect(200);
      const leaked = log.mock.calls.some(call => JSON.stringify(call).includes(token));
      expect(leaked).toBe(false);
    } finally { log.mockRestore(); }
  });
});
