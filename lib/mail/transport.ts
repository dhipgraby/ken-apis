import {
  chmodSync, closeSync, constants, fchmodSync, fsyncSync, fstatSync,
  linkSync, lstatSync, mkdirSync, openSync, realpathSync, unlinkSync, writeFileSync,
} from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, isAbsolute, join, parse, relative, resolve, sep } from 'node:path';
import { isLocalMode } from '../common/config/local-runtime';

type MailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
  senderName: string;
  replyTo?: string;
};

export function mailTransport(): 'local' | 'resend' {
  const local = isLocalMode();
  const selected = process.env.MAIL_TRANSPORT ?? (local ? 'local' : 'disabled');
  if (local && selected === 'local') return 'local';
  if (!local && selected === 'resend') return 'resend';
  throw new Error('Mail delivery is disabled or misconfigured');
}

export function localVerificationUrl(token: string): string {
  const base = process.env.AUTH_BASE_URL ?? 'http://127.0.0.1:3011';
  const url = new URL(base);
  if (/[?#@]/.test(base) || !['http:', 'https:'].includes(url.protocol)
    || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
    || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('Invalid local authentication origin');
  }
  return `${url.origin}/auth/verify?token=${encodeURIComponent(token)}`;
}

function contains(parent: string, path: string): boolean {
  const remainder = relative(parent, path);
  return remainder === '' || (!isAbsolute(remainder) && remainder !== '..'
    && !remainder.startsWith(`..${sep}`));
}

function statIfPresent(path: string) {
  try {
    return lstatSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

function privateOutbox(): string {
  const target = resolve(process.env.LOCAL_MAIL_DIR ?? join(process.cwd(), '.local', 'mail'));
  const uploads = resolve(process.cwd(), 'uploads');
  const publicRoots = [uploads];
  if (statIfPresent(uploads)) publicRoots.push(realpathSync(uploads));
  // Inspect the entire path before creating anything, including missing suffixes.
  const paths: string[] = [];
  for (let path = target; ; path = dirname(path)) {
    paths.unshift(path);
    if (path === parse(path).root) break;
  }
  for (const path of paths) {
    const stat = statIfPresent(path);
    if (stat && (stat.isSymbolicLink() || !stat.isDirectory())) {
      throw new Error('Unsafe local mail directory');
    }
    const canonical = stat ? realpathSync(path) : path;
    if (publicRoots.some((root) => contains(root, path) || contains(root, canonical))) {
      throw new Error('Local mail cannot be stored in public uploads');
    }
  }
  // Never change permissions on ancestors, and never use a filesystem root.
  if (target === parse(target).root || contains(target, process.cwd())) {
    throw new Error('Unsafe local mail directory');
  }
  for (const path of paths) {
    if (!statIfPresent(path)) mkdirSync(path, { mode: 0o700 });
  }
  const stat = lstatSync(target);
  if (stat.isSymbolicLink() || !stat.isDirectory()
    || typeof process.getuid !== 'function' || stat.uid !== process.getuid()) {
    throw new Error('Local mail directory must be owned by the current user');
  }
  chmodSync(target, 0o700);
  return target;
}

function capture(message: MailMessage): void {
  const directory = privateOutbox();
  const id = randomUUID();
  const destination = join(directory, `${id}.json`);
  const temporary = join(directory, `.${randomUUID()}.tmp`);
  let fd: number | undefined;
  let created = false;
  try {
    fd = openSync(temporary, constants.O_WRONLY | constants.O_CREAT
      | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    created = true;
    if (!fstatSync(fd).isFile()) throw new Error('Invalid local mail file');
    fchmodSync(fd, 0o600);
    writeFileSync(fd, JSON.stringify({
      id, createdAt: new Date().toISOString(), to: message.to,
      subject: message.subject, text: message.text,
    }), 'utf8');
    fsyncSync(fd);
    closeSync(fd);
    fd = undefined;
    // A hard link publishes a complete file atomically and cannot overwrite one.
    linkSync(temporary, destination);
  } finally {
    try {
      if (fd !== undefined) closeSync(fd);
    } finally {
      if (created) unlinkSync(temporary);
    }
  }
}

export async function deliverMail(message: MailMessage): Promise<void> {
  try {
    if (mailTransport() === 'local') {
      capture(message);
      return;
    }
    const key = process.env.RESEND_API_KEY?.trim();
    const from = process.env.EMAIL_FROM?.trim();
    if (!key || !from || !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(from)) {
      throw new Error('Mail provider configuration is incomplete');
    }
    const { Resend } = await import('resend');
    const result = await new Resend(key).emails.send({
      from: `${message.senderName} <${from}>`,
      to: message.to, subject: message.subject, html: message.html,
      ...(message.replyTo ? { replyTo: message.replyTo } : {}),
    });
    if (result.error) throw new Error('Mail provider rejected delivery');
  } catch {
    throw new Error('Mail delivery failed');
  }
}
