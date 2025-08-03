export default {
  testEnvironment: 'node',
  testTimeout: 60000,
  bail: 1,
  verbose: true,
  transform: {},
  testMatch: [
    '**/test/**/*.test.js',
    '**/test/**/*.e2e.test.js'
  ],
  collectCoverageFrom: [
    '*.js',
    '!index.js',
    '!jest.config.js',
    '!test/**'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  maxWorkers: 1,
  runInBand: true
}; 