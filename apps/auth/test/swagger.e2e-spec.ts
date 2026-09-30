import { INestApplication } from '@nestjs/common';
import { NestApplication } from '@nestjs/core';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { LoginModule } from '../src/auth.module';
import { UsersModule } from '../../users/src/users.module';
import { AdminModule } from '../../admin/src/admin.module';
import { fixture } from '../../../test/e2e.helpers';

// Resolve only document-local references. allOf may carry required fields separately.
function resolveSchema(document: OpenAPIObject, value: any): any {
  if (value?.$ref) {
    expect(value.$ref).toMatch(/^#\//);
    const resolved = value.$ref.slice(2).split('/').reduce((node: any, key: string) =>
      node?.[key.replace(/~1/g, '/').replace(/~0/g, '~')], document);
    expect(resolved).toBeDefined();
    return resolveSchema(document, resolved);
  }
  const { allOf = [], ...schema } = value ?? {};
  return allOf.reduce((merged: any, item: any) => {
    const part = resolveSchema(document, item);
    return { ...merged, ...part,
      properties: { ...merged.properties, ...part.properties },
      required: [...new Set([...(merged.required ?? []), ...(part.required ?? [])])],
    };
  }, schema);
}

const targets = [
  { name: 'auth', module: LoginModule },
  { name: 'users', module: UsersModule },
  { name: 'admin', module: AdminModule },
];

describe.each(targets)('$name real module OpenAPI', target => {
  const api = fixture(target.module);
  let document: OpenAPIObject;

  beforeAll(async () => {
    let ownedApp: INestApplication;
    // The shared fixture owns startup/cleanup but exposes only its HTTP server.
    // Capture its real application without replacing Nest or Swagger behavior.
    const init = NestApplication.prototype.init;
    const capture = jest.spyOn(NestApplication.prototype, 'init').mockImplementation(function (this: NestApplication) {
      ownedApp = this;
      return init.call(this);
    });
    try {
      await api.start();
      expect(ownedApp).toBeDefined();
      document = SwaggerModule.createDocument(ownedApp, new DocumentBuilder().addBearerAuth().build());
    } finally {
      capture.mockRestore();
    }
  });
  afterAll(async () => { await api.close(); });

  function operation(path: string, method: 'get' | 'post' = 'get') {
    const operation = document.paths[path]?.[method];
    expect(operation).toBeDefined();
    return operation!;
  }

  function publicOperation(path: string, method: 'get' | 'post') {
    expect(operation(path, method).security ?? document.security ?? []).toEqual([]);
  }

  function protectedOperation(path: string) {
    const security = operation(path).security ?? document.security ?? [];
    expect(security.length).toBeGreaterThan(0);
    // An empty alternative would make bearer authentication optional.
    for (const alternative of security) expect(alternative).toHaveProperty('bearer');
    expect(document.components?.securitySchemes?.bearer).toMatchObject({ type: 'http', scheme: 'bearer' });
  }

  function body(path: string) {
    const request = resolveSchema(document, operation(path, 'post').requestBody);
    expect(request).toBeDefined();
    expect(request.required).toBe(true);
    const schema = request.content?.['application/json']?.schema;
    expect(schema).toBeDefined();
    return resolveSchema(document, schema);
  }

  it('declares every referenced security scheme', () => {
    const requirements = [...(document.security ?? [])];
    for (const path of Object.values(document.paths)) {
      for (const method of ['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'trace'] as const) {
        requirements.push(...(path[method]?.security ?? []));
      }
    }
    for (const requirement of requirements) {
      for (const name of Object.keys(requirement)) {
        expect(document.components?.securitySchemes?.[name]).toBeDefined();
      }
    }
  });

  if (target.name === 'auth') {
    it.each([
      { path: '/auth/signup', method: 'post' as const },
      { path: '/auth/login', method: 'post' as const },
      { path: '/auth/google', method: 'post' as const },
      { path: '/auth/verify', method: 'get' as const },
    ])('documents $path as public', ({ path, method }) => publicOperation(path, method));

    it('requires declared bearer authentication for the current user', () => protectedOperation('/auth/user'));

    it('requires a UUID token query parameter for verification', () => {
      const parameters = (operation('/auth/verify').parameters ?? []).map(value => resolveSchema(document, value));
      const token = parameters.find(value => value.name === 'token' && value.in === 'query');
      expect(token).toMatchObject({ required: true, schema: { type: 'string', format: 'uuid' } });
    });

    it('describes signup validation without writable privilege fields', () => {
      const schema = body('/auth/signup');
      expect(schema.required).toEqual(expect.arrayContaining(['email', 'username', 'password']));
      expect(resolveSchema(document, schema.properties?.email)).toMatchObject({ type: 'string', format: 'email' });
      expect(resolveSchema(document, schema.properties?.password)).toMatchObject({
        type: 'string', writeOnly: true, minLength: 8, maxLength: 128,
      });
      expect(resolveSchema(document, schema.properties?.username)).toMatchObject({ type: 'string', minLength: 3, maxLength: 15 });
      for (const field of ['role', 'status', 'userStatus']) expect(schema.properties).not.toHaveProperty(field);
    });

    it('requires login identifier and password', () => {
      const schema = body('/auth/login');
      expect(schema.required).toEqual(expect.arrayContaining(['identifier', 'password']));
      expect(resolveSchema(document, schema.properties?.identifier)).toMatchObject({ type: 'string' });
      expect(resolveSchema(document, schema.properties?.password)).toMatchObject({ type: 'string', minLength: 8, maxLength: 128 });
    });

    it('documents verification success and known failure responses', () => {
      expect(Object.keys(operation('/auth/verify').responses)).toEqual(expect.arrayContaining(['200', '400', '403', '404', '410']));
    });

    it('documents signup success and known failure responses', () => {
      expect(Object.keys(operation('/auth/signup', 'post').responses)).toEqual(expect.arrayContaining(['201', '400', '403', '503']));
    });
  }

  if (target.name === 'users') {
    it('requires declared bearer authentication for /user/me', () => protectedOperation('/user/me'));
    it('keeps the unguarded greeting public', () => publicOperation('/user', 'get'));
  }

  if (target.name === 'admin') {
    it.each(['/', '/users/all'])('requires declared bearer authentication for %s', path => protectedOperation(path));
  }
});
