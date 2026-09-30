import {
  existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync,
  readdirSync, rmSync, symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { PrismaService } from 'lib/common/database/prisma.service';
import type { SupportService } from '../src/support/support.service';
import type { SupportRequestDto } from '../src/support/dto/support-request.dto';

type MailModule = typeof import('../../../lib/mail/mail');
type SupportModule = typeof import('../src/support/support.service');
type LocalMessage = {
  id: string;
  createdAt: string;
  to: string;
  subject: string;
  text: string;
};

const recipient = 'mail-fixture@example.invalid';
const token = 'synthetic-token+/=?& fragment';
const authBase = 'http://127.0.0.1:43101';
const payload: SupportRequestDto = {
  type: 'question',
  subject: 'Synthetic local support question',
  description: 'Synthetic description for the private outbox.',
};
const uuidJson = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.json$/i;

describe('explicit local mail boundary (no database or external providers)', () => {
  let savedEnv: NodeJS.ProcessEnv;
  let fixture: string;
  let outbox: string;
  let uploadsLeaf: string | undefined;
  let send: jest.Mock;
  let constructor: jest.Mock;
  let logs: jest.SpyInstance[];

  beforeEach(() => {
    savedEnv = { ...process.env };
    fixture = mkdtempSync(join(tmpdir(), 'ken-local-mail-'));
    outbox = join(fixture, 'outbox');
    uploadsLeaf = undefined;
    Object.assign(process.env, {
      LOCAL_MODE: 'true', PROD: 'false', NODE_ENV: 'test',
      LOCAL_MAIL_DIR: outbox, AUTH_BASE_URL: authBase,
      RESEND_API_KEY: 're_synthetic_never_use',
      WEBSITE: 'https://remote-website.example.invalid',
      EMAIL_FROM: 'sender@example.invalid',
    });
    delete process.env.MAIL_TRANSPORT;
    jest.resetModules();
    // Replace only Resend, including the OLD eager implementation. Neither spy
    // delegates to the SDK; successful fake delivery exposes behavioral failures.
    send = jest.fn().mockResolvedValue({ data: { id: 'synthetic' }, error: null });
    constructor = jest.fn().mockImplementation(() => ({ emails: { send } }));
    jest.doMock('resend', () => ({ Resend: constructor }));
    logs = (['log', 'info', 'warn', 'error', 'debug'] as const)
      .map((method) => jest.spyOn(console, method).mockImplementation(() => undefined));
  });

  afterEach(() => {
    logs.forEach((spy) => spy.mockRestore());
    for (const key of Object.keys(process.env)) {
      if (!(key in savedEnv)) delete process.env[key];
    }
    Object.assign(process.env, savedEnv);
    jest.resetModules();
    // Do not leave the permissive synthetic provider mock installed for others.
    jest.doMock('resend', () => ({ Resend: class {
      constructor() { throw new Error('Unexpected Resend outside local mail fixture'); }
    } }));
    rmSync(fixture, { recursive: true, force: true });
    // This randomly named leaf is the only permissible cleanup under uploads.
    // Never create, remove, or traverse the original uploads directory itself.
    if (uploadsLeaf && existsSync(uploadsLeaf)) {
      rmSync(uploadsLeaf, { recursive: true, force: true });
    }
  });

  function load() {
    let mail!: MailModule;
    let supportModule!: SupportModule;
    jest.isolateModules(() => {
      mail = require('../../../lib/mail/mail') as MailModule;
      supportModule = require('../src/support/support.service') as SupportModule;
    });
    const findUnique = jest.fn().mockResolvedValue({
      email: recipient, username: 'synthetic-user',
    });
    const prisma: { user: Pick<PrismaService['user'], 'findUnique'> } = {
      user: { findUnique },
    };
    // Only this delegate is consumed; no PrismaClient or Nest application exists.
    const support: SupportService = new supportModule.SupportService(prisma as PrismaService);
    return { mail, support, findUnique };
  }

  function expectNoProvider() {
    expect(constructor).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  }

  function messages(): LocalMessage[] {
    expect(existsSync(outbox)).toBe(true);
    expect(lstatSync(outbox).isDirectory()).toBe(true);
    expect(lstatSync(outbox).mode & 0o777).toBe(0o700);
    return readdirSync(outbox).map((name) => {
      expect(name).toMatch(uuidJson);
      const path = join(outbox, name);
      expect(lstatSync(path).isFile()).toBe(true);
      expect(lstatSync(path).mode & 0o777).toBe(0o600);
      const record = JSON.parse(readFileSync(path, 'utf8')) as LocalMessage;
      expect(Object.keys(record).sort()).toEqual(['createdAt', 'id', 'subject', 'text', 'to']);
      expect(record.id).toEqual(expect.any(String));
      expect(record.id.length).toBeGreaterThan(0);
      expect(record.createdAt).toEqual(expect.any(String));
      expect(Number.isFinite(Date.parse(record.createdAt))).toBe(true);
      expect(record.to).toEqual(expect.any(String));
      expect(record.subject).toEqual(expect.any(String));
      expect(record.subject.length).toBeGreaterThan(0);
      expect(record.text).toEqual(expect.any(String));
      expect(record.text).not.toMatch(/<\/?[a-z][^>]*>|https?:\/\/(?!127\.0\.0\.1:43101)/i);
      return record;
    });
  }

  async function expectRejectedDelivery() {
    // Both import-time policy validation and delivery-time rejection are valid.
    await expect((async () => {
      const { mail } = load();
      await mail.sendVerificationEmail(recipient, token, 'email_verification');
    })()).rejects.toThrow();
    expectNoProvider();
    expect(existsSync(outbox)).toBe(false);
  }

  it('imports mail and constructs support without instantiating a provider', () => {
    load();
    expectNoProvider();
    expect(existsSync(outbox)).toBe(false);
  });

  it.each([
    'email_verification',
    'reset_password',
    'set_password',
  ])('captures %s as one private text-only message', async (action) => {
    const { mail } = load();
    await mail.sendVerificationEmail(recipient, token, action);
    const records = messages();
    expect(records).toHaveLength(1);
    expect(records[0].to).toBe(recipient);
    if (action === 'email_verification') {
      expect(records[0].text).toContain(`${authBase}/auth/verify?token=${encodeURIComponent(token)}`);
    } else {
      expect(records[0].text).toContain(token);
      expect(records[0].text).not.toMatch(/https?:\/\//i);
    }
    expectNoProvider();
  });

  it('shares the outbox with support and preserves its accepted response and context', async () => {
    const { mail, support, findUnique } = load();
    await mail.sendVerificationEmail(recipient, token, 'email_verification');
    const result = await support.sendSupportEmail(701, payload);
    expect(result.status).toBe(202);
    expect(findUnique).toHaveBeenCalledWith({
      where: { id: 701 }, select: { email: true, username: true },
    });
    const records = messages();
    expect(records).toHaveLength(2);
    const supportMessage = records.find((record) => record.to === 'support@example.invalid');
    expect(supportMessage).toBeDefined();
    expect(supportMessage!.subject).toContain(payload.subject);
    expect(supportMessage!.text).toContain(payload.subject);
    expect(supportMessage!.text).toContain(payload.description);
    expect(supportMessage!.text).toContain(recipient);
    expectNoProvider();
  });

  it('never writes recipients or raw/encoded tokens to normal console logs', async () => {
    const { mail, support } = load();
    await mail.sendVerificationEmail(recipient, token, 'email_verification');
    await support.sendSupportEmail(701, payload);
    const output = logs.flatMap((spy) => spy.mock.calls).map((call) => JSON.stringify(call)).join('\n');
    for (const secret of [recipient, 'support@example.invalid', token, encodeURIComponent(token)]) {
      expect(output).not.toContain(secret);
    }
    expectNoProvider();
  });

  it('does not overwrite concurrent messages and leaves only complete JSON files', async () => {
    const { mail } = load();
    const tokens = ['synthetic-first', 'synthetic-second', 'synthetic-third'];
    await Promise.all(tokens.map((value) => mail.sendVerificationEmail(recipient, value, 'email_verification')));
    const records = messages();
    expect(records).toHaveLength(tokens.length);
    expect(new Set(records.map((record) => record.id)).size).toBe(tokens.length);
    for (const value of tokens) {
      expect(records.filter((record) => record.text.includes(`token=${value}`))).toHaveLength(1);
    }
    expectNoProvider();
  });

  it('rejects an outbox symlink without writing into its target', async () => {
    const target = join(fixture, 'symlink-target');
    mkdirSync(target, { mode: 0o700 });
    symlinkSync(target, outbox, 'dir');
    await expect((async () => {
      await load().mail.sendVerificationEmail(recipient, token, 'email_verification');
    })()).rejects.toThrow();
    expect(readdirSync(target)).toEqual([]);
    expect(lstatSync(outbox).isSymbolicLink()).toBe(true);
    expectNoProvider();
  });

  it('rejects a path below public uploads without creating that directory', async () => {
    uploadsLeaf = join(process.cwd(), 'uploads', `local-mail-fixture-${randomUUID()}`);
    expect(existsSync(uploadsLeaf)).toBe(false);
    process.env.LOCAL_MAIL_DIR = uploadsLeaf;
    await expectRejectedDelivery();
    expect(existsSync(uploadsLeaf)).toBe(false);
  });

  it.each([
    ['PROD', 'true'], ['NODE_ENV', 'production'],
  ])('rejects contradictory local mode with %s=%s', async (key, value) => {
    process.env[key] = value;
    await expectRejectedDelivery();
  });

  it('defaults to disabled delivery despite an inherited Resend key', async () => {
    delete process.env.LOCAL_MODE;
    delete process.env.MAIL_TRANSPORT;
    await expectRejectedDelivery();
  });

  it('rejects an unknown explicit transport', async () => {
    delete process.env.LOCAL_MODE;
    process.env.MAIL_TRANSPORT = 'synthetic-unknown';
    await expectRejectedDelivery();
  });

  it('rejects explicit Resend combined with local mode', async () => {
    process.env.MAIL_TRANSPORT = 'resend';
    await expectRejectedDelivery();
  });

  it('rejects a non-loopback local authentication base URL', async () => {
    process.env.AUTH_BASE_URL = 'https://remote-auth.example.invalid';
    await expectRejectedDelivery();
  });
});
