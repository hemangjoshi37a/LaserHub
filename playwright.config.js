module.exports = {
  testDir: '.',
  testMatch: ['visual-test-workflow.js'],
  use: {
    baseURL: 'http://localhost:5173',
    headless: false,
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
  },
  reporter: [['list'], ['html']],
  timeout: 120000,
};
