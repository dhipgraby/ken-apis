module.exports = {
  rootDir: require('node:path').resolve(__dirname, '..'),
  roots: ['<rootDir>/apps'],
  testMatch: ['<rootDir>/apps/*/test/*.e2e-spec.ts'],
  testEnvironment: 'node',
  moduleFileExtensions: ['js', 'json', 'ts'],
  maxWorkers: 1,
  testTimeout: 30000,
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: {
      module: 'commonjs', target: 'ES2021', experimentalDecorators: true,
      emitDecoratorMetadata: true, esModuleInterop: false, skipLibCheck: true,
      baseUrl: '.', paths: { 'apps/*': ['apps/*'], 'lib/*': ['lib/*'], 'utils/*': ['utils/*'] },
    } }],
  },
  moduleNameMapper: {
    '^apps/(.*)$': '<rootDir>/apps/$1',
    '^lib/(.*)$': '<rootDir>/lib/$1',
    '^utils/(.*)$': '<rootDir>/utils/$1',
  },
  setupFilesAfterEnv: ['<rootDir>/test/e2e.setup.ts'],
};
