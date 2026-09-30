'use strict';
// Test-only JS transport guard. Native Prisma/Rust sockets are not intercepted.
const fs = require('node:fs');
const http = require('node:http');
const https = require('node:https');
const audit = process.env.KEN_E2E_NETWORK_AUDIT;
if (!audit || !/^ken-framework-db-e2e-[a-f0-9]{24}$/.test(process.env.KEN_E2E_OWNER || '')) {
  throw new Error('Network guard requires owned audit configuration');
}
function check(operation, input, options) {
  let host;
  try {
    if (typeof input === 'string' || input instanceof URL) host = new URL(input).hostname;
    else if (input && typeof input.url === 'string') host = new URL(input.url).hostname;
    else host = input?.hostname || input?.host || 'localhost';
    // Node request(url, options) lets options override the URL destination.
    host = options?.hostname || options?.host || host;
    host = String(host).toLowerCase();
    if (host.startsWith('[')) host = host.slice(1, host.indexOf(']'));
    else if (/^[^:]+:\d+$/.test(host)) host = host.replace(/:\d+$/, '');
    if (input?.socketPath || options?.socketPath || input?.lookup || options?.lookup ||
        input?.createConnection || options?.createConnection ||
        input?.agent || options?.agent || input?.dispatcher || options?.dispatcher) {
      host = 'custom-transport';
    }
  } catch { host = 'invalid-destination'; }
  // Literal addresses only: localhost DNS can be configured to resolve elsewhere.
  if (host === '127.0.0.1' || host === '::1') return;
  // Never persist raw options, URL, credentials, path, headers or query strings.
  const safeHost = /^[a-z0-9.:-]{1,253}$/.test(host) ? host : 'invalid-destination';
  fs.appendFileSync(audit, JSON.stringify({ host: safeHost, operation }) + '\n', { mode: 0o600 });
  throw new Error('External network blocked by local process fixture');
}
for (const [name, transport] of [['http', http], ['https', https]]) {
  for (const method of ['request', 'get']) {
    const original = transport[method];
    transport[method] = function (input, ...args) {
      check(`${name}.${method}`, input, typeof args[0] === 'object' ? args[0] : undefined);
      return original.call(this, input, ...args);
    };
  }
}
if (typeof globalThis.fetch === 'function') {
  const original = globalThis.fetch;
  globalThis.fetch = function (input, options) {
    check('fetch', input, options);
    return original.call(this, input, options);
  };
}
