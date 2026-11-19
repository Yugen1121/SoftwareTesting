
module.exports = {
  testEnvironment: 'node',

  globalSetup: './test/integration/global-setup.js',

  globalTeardown: './test/integration/global-teardown.js',

  setupFiles: [
    './test/integration/setup.js'
  ],

  testMatch: [
    '**/test/**/*.test.js'
  ],

  testTimeout: 30000,

  maxWorkers: 1
};
