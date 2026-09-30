import { ExecutionContext, INestApplication, Type, ValidationPipe } from '@nestjs/common';
import { ModulesContainer } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../lib/common/database/prisma.service';
import * as request from 'supertest';
import { JwtAuthGuard } from '../lib/common/auth/jwt-auth.guard';
import { AdminJwtAuthGuard } from '../lib/common/auth/admin-guard';

export function fixture(module: Type<unknown>) {
  let app: INestApplication;
  let testing: TestingModule;
  const clients = new Set<PrismaService>();
  const ownedIds: number[] = [];
  let prisma: PrismaService;
  const ownedEmails = new Set<string>();
  let sequence = 0;

  async function close() {
    const errors: unknown[] = [];
    // Emails are registered before requests, including requests that only create codes.
    if (prisma) {
      try {
        const emails = [...ownedEmails];
        const users = await prisma.user.findMany({
          where: { OR: [{ id: { in: ownedIds } }, { email: { in: emails } }] },
          select: { id: true },
        });
        const ids = users.map(user => user.id);
        await prisma.userInfo.deleteMany({ where: { userId: { in: ids } } });
        await prisma.emailCode.deleteMany({ where: { email: { in: emails } } });
        await prisma.twoFactorCode.deleteMany({ where: { email: { in: emails } } });
        await prisma.user.deleteMany({ where: { id: { in: ids } } });
        ownedIds.length = 0;
        ownedEmails.clear();
      } catch (error) { errors.push(error); }
    }
    try {
      if (app) await app.close();
      else if (testing) await testing.close();
    } catch (error) { errors.push(error); }
    for (const client of clients) {
      try { await client.$disconnect(); } catch (error) { errors.push(error); }
    }
    clients.clear();
    app = undefined;
    testing = undefined;
    if (errors.length) throw new AggregateError(errors, 'E2E cleanup failed');
  }

  return {
    get server() { return app.getHttpServer(); },
    get prisma() { return prisma; },
    get clients() { return [...clients]; },
    ownEmail(email: string) { ownedEmails.add(email); return email; },
    async start() {
      try {
        testing = await Test.createTestingModule({ imports: [module] })
          .overrideProvider(PrismaService).useFactory({ factory: () => {
            // Track constructors too, so compilation/initialization failures cannot leak clients.
            const client = new PrismaService();
            clients.add(client);
            return client;
          } }).compile();
        app = testing.createNestApplication();
        app.useLogger(false);
        app.useGlobalPipes(new ValidationPipe());
        for (const mod of app.get(ModulesContainer).values()) {
          for (const provider of mod.providers.values()) {
            if (provider.instance instanceof PrismaService) clients.add(provider.instance);
          }
        }
        if (!clients.size) throw new Error('No Prisma providers found');
        prisma = [...clients][0];
        await app.listen(0, '127.0.0.1');
        for (const count of await Promise.all([
          prisma.user.count(), prisma.userInfo.count(),
          prisma.emailCode.count(), prisma.twoFactorCode.count(),
        ])) expect(count).toBe(0);
      } catch (error) {
        try { await close(); } catch (cleanup) {
          throw new AggregateError([error, cleanup], 'E2E startup and cleanup failed');
        }
        throw error;
      }
    },
    async seed(role = 0, userStatus = 1) {
      const name = `e2e-${role}-${++sequence}`;
      const email = `${name}@example.invalid`;
      ownedEmails.add(email);
      const user = await prisma.user.create({ data: {
        email, username: name,
        password: 'not-a-login-credential', role, userStatus,
      } });
      ownedIds.push(user.id);
      return user;
    },
    token(user: { id?: unknown; username?: string; role?: unknown }, expired = false, secret = process.env.JWT_SECRET) {
      return new JwtService().sign({ id: user.id, username: user.username, role: user.role }, {
        secret, algorithm: 'HS256', expiresIn: expired ? -1 : '5m',
      });
    },
    close,
  };
}

// Identical boundary cases exercise both actual HTTP guards and every module client.
export function currentAccountCases(api: ReturnType<typeof fixture>, path: string, role: number) {
  const get = (token: string) => request(api.server).get(path)
    .set('Authorization', `Bearer ${token}`);

  it.each([0, 2, 3, 99])('denies current account status %s', async status => {
    const user = await api.seed(role, status);
    await get(api.token(user)).expect(403);
  });

  const invalidIds = [undefined, null, '1', 1.5, 0, -1, 2147483648, {}, []];
  it.each(invalidIds.map((id, index) => ({ id, index })))('rejects invalid ID case $index without lookup', async ({ id }) => {
    const spies = api.clients.map(client => jest.spyOn(client.user, 'findUnique'));
    try {
      await get(api.token({ id, role })).expect(401);
      for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    } finally { spies.forEach(spy => spy.mockRestore()); }
  });

  it.each(['signature', 'expiry', 'malformed'])('rejects %s before lookup', async kind => {
    const user = await api.seed(role);
    const token = kind === 'malformed' ? 'not.a.jwt' :
      api.token(user, kind === 'expiry', kind === 'signature' ? 'wrong-secret' : process.env.JWT_SECRET);
    const spies = api.clients.map(client => jest.spyOn(client.user, 'findUnique'));
    try {
      await get(token).expect(401);
      for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    } finally { spies.forEach(spy => spy.mockRestore()); }
  });

  it('rejects a missing current account', async () => {
    const user = await api.seed(role);
    await api.prisma.user.delete({ where: { id: user.id } });
    await get(api.token(user)).expect(401);
  });

  it('rechecks status and deletion for the same token', async () => {
    const user = await api.seed(role);
    const token = api.token(user);
    await get(token).expect(200);
    await api.prisma.user.update({ where: { id: user.id }, data: { userStatus: 3 } });
    await get(token).expect(403);
    await api.prisma.user.delete({ where: { id: user.id } });
    await get(token).expect(401);
  });

  it('projects only safe current fields onto request.user', async () => {
    const user = await api.seed(role);
    const jwt = new JwtService();
    const token = jwt.sign({ id: user.id, username: 'stale-name', role: 99,
      password: 'untrusted', extra: 'untrusted' }, { secret: process.env.JWT_SECRET });
    const req = { headers: { authorization: `Bearer ${token}` }, user: undefined };
    const context = { switchToHttp: () => ({ getRequest: () => req }) } as ExecutionContext;
    const guard = role === 3 ? new AdminJwtAuthGuard(jwt, api.prisma) : new JwtAuthGuard(jwt, api.prisma);
    const spy = jest.spyOn(api.prisma.user, 'findUnique');
    try {
      expect(await guard.canActivate(context)).toBe(true);
      expect(spy).toHaveBeenCalledWith({ where: { id: user.id },
        select: { id: true, username: true, role: true, userStatus: true } });
      expect(req.user).toEqual({ id: user.id, username: user.username, role: user.role });
    } finally { spy.mockRestore(); }
  });

  it('fails closed on database errors without converting them to 401', async () => {
    const user = await api.seed(role);
    const spies = api.clients.map(client => jest.spyOn(client.user, 'findUnique')
      .mockRejectedValue(new Error('Synthetic database failure')));
    try { await get(api.token(user)).expect(500); }
    finally { spies.forEach(spy => spy.mockRestore()); }
  });
}
