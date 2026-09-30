import { PrismaService } from 'lib/common/database/prisma.service';

const targets = [
  { api: 'auth', port: 'AUTH_PORT', main: '../src/main', module: '../src/auth.module', exported: 'LoginModule' },
  { api: 'users', port: 'USERS_PORT', main: '../../users/src/main', module: '../../users/src/users.module', exported: 'UsersModule' },
  { api: 'admin', port: 'ADMIN_PORT', main: '../../admin/src/main', module: '../../admin/src/admin.module', exported: 'AdminModule' },
];
const flush = () => new Promise<void>(resolve => setImmediate(resolve));

// Execute the real entrypoints, but never construct Nest, Prisma, or a socket.
describe('local entrypoint contract', () => {
  let environment: NodeJS.ProcessEnv;
  let exitCode: typeof process.exitCode;
  let output: unknown[][];
  let releaseListen: () => void;

  beforeEach(() => {
    environment = { ...process.env };
    exitCode = process.exitCode;
    output = [];
    process.exitCode = undefined;
    Object.assign(process.env, {
      LOCAL_MODE: 'true', PROD: 'false', NODE_ENV: 'test',
      AUTH_PORT: '0', USERS_PORT: '0', ADMIN_PORT: '0',
    });
    for (const method of ['info', 'log', 'error', 'warn'] as const) {
      jest.spyOn(console, method).mockImplementation((...args) => { output.push(args); });
    }
  });

  afterEach(async () => {
    // Even a failed pre-resolution assertion must release the owned bootstrap.
    releaseListen?.();
    await flush();
    releaseListen = undefined;
    jest.restoreAllMocks();
    for (const target of targets) jest.dontMock(target.module);
    jest.dontMock('@nestjs/core');
    jest.dontMock('@nestjs/swagger');
    for (const key of Object.keys(process.env)) {
      if (!(key in environment)) delete process.env[key];
    }
    Object.assign(process.env, environment);
    process.exitCode = exitCode;
  });

  function ready() {
    const messages = [...(console.info as jest.Mock).mock.calls, ...(console.log as jest.Mock).mock.calls];
    return messages.filter(args => typeof args[0] === 'string' && args[0].startsWith('LOCAL_READY '));
  }

  async function boot(target: typeof targets[number], deferred = false) {
    const url = 'http://127.0.0.1:49123';
    const listening = deferred ? new Promise<void>(resolve => { releaseListen = resolve; }) : Promise.resolve();
    const app = {
      listen: jest.fn(() => listening), getUrl: jest.fn().mockResolvedValue(url),
      useGlobalPipes: jest.fn(), enableCors: jest.fn(), use: jest.fn(),
      enableShutdownHooks: jest.fn(), close: jest.fn().mockResolvedValue(undefined),
    };
    const root = class MockRootModule {};
    const create = jest.fn().mockResolvedValue(app);
    jest.doMock(target.module, () => ({ [target.exported]: root }));
    jest.doMock('@nestjs/core', () => ({ ...jest.requireActual('@nestjs/core'), NestFactory: { create } }));
    jest.doMock('@nestjs/swagger', () => ({
      ...jest.requireActual('@nestjs/swagger'),
      SwaggerModule: { createDocument: jest.fn(() => ({})), setup: jest.fn() },
    }));
    await jest.isolateModulesAsync(async () => {
      require(target.main);
      await flush();
    });
    return { app, create, root, url };
  }

  describe.each(targets)('$api main', target => {
    it('binds configured ephemeral port on loopback and enables graceful signals', async () => {
      const { app, create, root } = await boot(target);
      expect(create.mock.calls[0][0]).toBe(root);
      expect(app.listen).toHaveBeenCalledTimes(1);
      expect(app.listen).toHaveBeenCalledWith(0, '127.0.0.1');
      expect(app.enableShutdownHooks).toHaveBeenCalledWith(['SIGINT', 'SIGTERM']);
    });

    it('announces the actual bound URL and documentation URLs once', async () => {
      const { app, url } = await boot(target);
      expect(app.getUrl).toHaveBeenCalled();
      expect(ready()).toHaveLength(1);
      const record = JSON.parse((ready()[0][0] as string).slice('LOCAL_READY '.length));
      expect(record).toMatchObject({ api: target.api, url,
        swagger: `${url}/documentation`, openapi: `${url}/documentation-json`, pid: process.pid });
    });

    it('emits neither running nor ready before listen resolves', async () => {
      const { app } = await boot(target, true);
      try {
        expect(app.listen).toHaveBeenCalledTimes(1);
        expect(output.filter(args => /running|LOCAL_READY/i.test(args.map(String).join(' ')))).toEqual([]);
        expect(app.getUrl).not.toHaveBeenCalled();
      } finally {
        releaseListen();
        await flush();
      }
      expect(ready()).toHaveLength(1);
    });

    it.each(['-1', '65536', '1.5', 'abc', ''])('rejects invalid port %j before creating Nest', async port => {
      process.env[target.port] = port;
      const { create } = await boot(target);
      expect(create).not.toHaveBeenCalled();
      expect(ready()).toEqual([]);
      expect(process.exitCode).toBe(1);
    });

    it.each(['PROD', 'NODE_ENV'])('rejects local mode conflicting with %s before creating Nest', async key => {
      process.env[key] = key === 'PROD' ? 'true' : 'production';
      const { create } = await boot(target);
      expect(create).not.toHaveBeenCalled();
      expect(ready()).toEqual([]);
      expect(process.exitCode).toBe(1);
    });
  });

  it('uses the bound auth URL for subsequent local verification mail', async () => {
    process.env.AUTH_BASE_URL = 'http://127.0.0.1:43101';
    const { url } = await boot(targets[0]);
    expect(process.env.AUTH_BASE_URL).toBe(url);
  });

  it('does not mount the admin queue dashboard in local mode', async () => {
    const { app } = await boot(targets[2]);
    expect(app.use.mock.calls.some(args => args[0] === '/admin/queues')).toBe(false);
  });
});

describe('Prisma shutdown without a client or database', () => {
  it('disconnects exactly once through its Nest shutdown hook', async () => {
    const service = Object.create(PrismaService.prototype);
    service.$disconnect = jest.fn().mockResolvedValue(undefined);
    expect(typeof service.onModuleDestroy).toBe('function');
    await service.onModuleDestroy();
    expect(service.$disconnect).toHaveBeenCalledTimes(1);
  });
});
