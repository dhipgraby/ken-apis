import * as request from 'supertest';
import { LoginModule } from '../src/auth.module';
import { fixture } from '../../../test/e2e.helpers';
import { allowGoogleTicket } from '../../../test/e2e.setup';
import { compare } from 'bcrypt';

describe('Authentication module (integration)', () => {
  const api = fixture(LoginModule);
  beforeAll(() => api.start());
  afterAll(() => api.close());

  it('serves the public greeting', async () => {
    await request(api.server).get('/').expect(200).expect('Authentication Api is status 200!');
  });

  it.each([false, true])('signup persists only public fields (injection=%s)', async injected => {
    const username = injected ? 'injected' : 'ordinary';
    const email = api.ownEmail(`${username}@example.invalid`);
    const password = 'Test.1234';
    const oldDate = '2000-01-01T00:00:00.000Z';
    const extras = injected ? {
      id: 2147483647, role: 3, userStatus: 1, email_verified: oldDate,
      created_at: oldDate, last_modified: oldDate, last_login: oldDate,
      isTwoFactorEnabled: true,
      userInfo: { create: { first_name: 'Injected', last_name: 'Relation' } },
    } : {};
    const { body } = await request(api.server).post('/auth/signup')
      .send({ email, username, password, ...extras }).expect(201);
    expect(body).toEqual({ status: 200, message: 'New user created' });
    const user = await api.prisma.user.findUnique({ where: { email }, include: { userInfo: true } });
    expect(user).toMatchObject({ email, username, role: 0, userStatus: 0,
      email_verified: null, isTwoFactorEnabled: false, userInfo: null });
    expect(user.id).not.toBe(2147483647);
    for (const date of [user.created_at, user.last_modified, user.last_login]) {
      expect(date.getTime()).toBeGreaterThan(new Date(oldDate).getTime());
    }
    expect(user.password).not.toBe(password);
    expect(await compare(password, user.password)).toBe(true);
    expect(await api.prisma.emailCode.count({ where: { email } })).toBe(1);
    await request(api.server).get('/auth/user')
      .set('Authorization', `Bearer ${api.token(user)}`).expect(403);
  });

  it('preserves duplicate signup rejection', async () => {
    const user = await api.seed();
    const { body } = await request(api.server).post('/auth/signup')
      .send({ email: user.email, username: user.username, password: 'Test.1234' }).expect(403);
    expect(body.message).toBe('User with the same email or name already exists');
    expect(await api.prisma.emailCode.count({ where: { email: user.email } })).toBe(0);
  });

  it('preserves default ValidationPipe DTO rejection', async () => {
    const email = api.ownEmail('invalid-dto@example.invalid');
    const { body } = await request(api.server).post('/auth/signup')
      .send({ email, username: 'x', password: 'weak' }).expect(400);
    expect(body.message).toEqual(expect.any(Array));
    expect(await api.prisma.user.count({ where: { email } })).toBe(0);
    expect(await api.prisma.emailCode.count({ where: { email } })).toBe(0);
  });

  it('registers a verified Google account without an email code', async () => {
    const email = api.ownEmail('google-new@example.invalid');
    allowGoogleTicket('verified-new', { email, email_verified: true, given_name: 'Google' });
    const before = Date.now();
    const { body } = await request(api.server).post('/auth/google')
      .send({ googleTokenId: 'verified-new' }).expect(201);
    expect(body).toMatchObject({ status: 200, message: 'Login successful',
      user: { email, role: 0 }, token: expect.any(String) });
    const user = await api.prisma.user.findUnique({ where: { email } });
    expect(user).toMatchObject({ role: 0, userStatus: 1 });
    expect(user.email_verified.getTime()).toBeGreaterThanOrEqual(before);
    expect(user.email_verified.getTime()).toBeLessThanOrEqual(Date.now());
    expect(await api.prisma.emailCode.count({ where: { email } })).toBe(0);
    await request(api.server).get('/auth/user')
      .set('Authorization', `Bearer ${body.token}`).expect(200);
  });

  it.each(['false', 'missing-verification', 'string-verification', 'missing-email', 'missing-payload', 'verification-error'])
  ('rejects Google identity %s without creating accounts', async kind => {
    const email = api.ownEmail(`google-${kind}@example.invalid`);
    let payload: Record<string, unknown> | undefined = { email, email_verified: true };
    if (kind === 'false') payload.email_verified = false;
    if (kind === 'missing-verification') delete payload.email_verified;
    if (kind === 'string-verification') payload.email_verified = 'true';
    if (kind === 'missing-email') delete payload.email;
    if (kind === 'missing-payload') payload = undefined;
    const token = `synthetic-${kind}`;
    allowGoogleTicket(token, payload, kind === 'verification-error' ? new Error('Invalid synthetic ticket') : undefined);
    const count = await api.prisma.user.count();
    await request(api.server).post('/auth/google').send({ googleTokenId: token }).expect(403);
    expect(await api.prisma.user.count()).toBe(count);
    expect(await api.prisma.emailCode.count({ where: { email } })).toBe(0);
  });

  it.each(['', '   '])('rejects missing Google audience %j before verification', async audience => {
    const original = process.env.GOOGLE_CLIENT_ID;
    process.env.GOOGLE_CLIENT_ID = audience;
    try {
      // Not registered: any verification attempt is also caught by the external-call sentinel.
      await request(api.server).post('/auth/google')
        .send({ googleTokenId: 'no-config' }).expect(403);
    } finally { process.env.GOOGLE_CLIENT_ID = original; }
  });

  it.each([0, 3])('Google login does not reactivate existing status %s', async status => {
    const user = await api.seed(3, status);
    allowGoogleTicket(`existing-${status}`, { email: user.email, email_verified: true });
    const { body } = await request(api.server).post('/auth/google')
      .send({ googleTokenId: `existing-${status}` }).expect(201);
    const current = await api.prisma.user.findUnique({ where: { id: user.id } });
    expect(current).toMatchObject({ role: user.role, userStatus: status, email_verified: user.email_verified });
    expect(await api.prisma.emailCode.count({ where: { email: user.email } })).toBe(0);
    await request(api.server).get('/auth/user')
      .set('Authorization', `Bearer ${body.token}`).expect(403);
  });
});
