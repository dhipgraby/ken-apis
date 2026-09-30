export function isLocalMode(): boolean {
  const value = process.env.LOCAL_MODE;
  if (value !== undefined && value !== 'true' && value !== 'false') {
    throw new Error('Invalid local mode configuration');
  }
  const local = value === 'true';
  if (local && (process.env.PROD === 'true' || process.env.NODE_ENV === 'production')) {
    throw new Error('Local mode is unavailable in production');
  }
  return local;
}

type ApiName = 'auth' | 'users' | 'admin';

export function runtimeOptions(api: ApiName) {
  const local = isLocalMode();
  const defaults = { auth: 3001, users: 3002, admin: 3003 };
  const value = process.env[`${api.toUpperCase()}_PORT`];
  if (value !== undefined && (!/^\d+$/.test(value) || Number(value) > 65535)) {
    throw new Error('Invalid port configuration');
  }
  return {
    local,
    port: value === undefined ? defaults[api] : Number(value),
    host: local ? '127.0.0.1' : '0.0.0.0',
  };
}

export function announceReady(api: ApiName, url: string, local: boolean) {
  if (local) {
    console.log(`LOCAL_READY ${JSON.stringify({
      api, url, swagger: `${url}/documentation`,
      openapi: `${url}/documentation-json`, pid: process.pid,
    })}`);
  } else {
    console.log(`${api.toUpperCase()} API RUNNING AT: ${url}`);
  }
}
