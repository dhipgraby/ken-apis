import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

// Check existence only: even Prisma's bundled dotenv must not find real secrets.
for (const file of ['.env', 'prisma/.env']) {
  if (existsSync(resolve(__dirname, '..', file))) {
    throw new Error('E2E requires a clean fixture without .env or prisma/.env');
  }
}
if (process.env.DATABASE_URL !== undefined) {
  throw new Error('Unset inherited DATABASE_URL before running E2E');
}
const raw = process.env.KEN_E2E_DATABASE_URL;
if (!raw || process.env.KEN_E2E_DISPOSABLE !== '1') {
  throw new Error('Explicit KEN_E2E_DATABASE_URL and KEN_E2E_DISPOSABLE=1 required');
}
const url = new URL(raw);
if (url.protocol !== 'postgresql:' || url.hostname !== '127.0.0.1' ||
    !url.port || !/^ken_e2e_[a-z0-9]+$/.test(url.pathname.slice(1)) ||
    url.username !== 'ken_e2e' || !url.password || url.search || url.hash) {
  throw new Error('E2E URL must identify a disposable loopback PostgreSQL database');
}
// One private, owned root per Jest VM; never clean an inherited mail path.
export const localMailRoot = mkdtempSync(join(tmpdir(), 'ken-e2e-mail-'));
afterAll(() => rmSync(localMailRoot, { recursive: true, force: true }));
delete process.env.MAIL_TRANSPORT;
Object.assign(process.env, {
  LOCAL_MODE: 'true', AUTH_BASE_URL: 'http://127.0.0.1:43101',
  LOCAL_MAIL_DIR: join(localMailRoot, 'outbox'),
  DATABASE_URL: raw,
  JWT_SECRET: 'ken-e2e-only-not-a-production-secret',
  JWT_KEY: 'ken-e2e-only-not-a-production-secret',
  RESEND_API_KEY: 're_e2e_fake', GOOGLE_CLIENT_ID: 'e2e.invalid',
  PROD: 'false', WEBSITE: 'http://127.0.0.1', EMAIL_FROM: 'e2e@example.invalid',
});

const attempts: string[] = [];
function blocked(label: string): any {
  return new Proxy(function () {}, {
    get: (_target, key) => key === 'then' ? undefined : blocked(`${label}.${String(key)}`),
    apply: () => {
      attempts.push(label);
      throw new Error(`Unexpected external API call: ${label}`);
    },
  });
}
// doMock is deliberately not hoisted; factories close over initialized state.
jest.doMock('dotenv', () => ({ config: () => ({ parsed: {} }), configDotenv: () => ({ parsed: {} }) }));
jest.doMock('dotenv/config', () => ({}));
jest.doMock('resend', () => ({ Resend: class { constructor() { return blocked('Resend'); } } }));
const googleTickets = new Map<string, { payload?: Record<string, unknown>; error?: Error }>();
export function allowGoogleTicket(token: string, payload?: Record<string, unknown>, error?: Error) {
  googleTickets.set(token, { payload, error });
}
export function resetGoogleTickets() { googleTickets.clear(); }
jest.doMock('google-auth-library', () => ({ OAuth2Client: class {
  async verifyIdToken({ idToken, audience }: { idToken: string; audience: string }) {
    expect(audience).toBe('e2e.invalid');
    if (!googleTickets.has(idToken)) return blocked('Google.OAuth2Client.verifyIdToken')();
    const ticket = googleTickets.get(idToken)!;
    if (ticket.error) throw ticket.error;
    return { getPayload: () => ticket.payload };
  }
} }));
afterEach(resetGoogleTickets);
afterEach(() => expect(attempts).toEqual([]));
afterAll(() => expect(attempts).toEqual([]));
