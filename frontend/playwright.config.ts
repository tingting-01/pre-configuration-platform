import { defineConfig, devices } from '@playwright/test';

/**
 * 配置说明见 https://playwright.dev/docs/test-configuration。
 */
export default defineConfig({
  testDir: './tests',
  /* 在不同测试文件之间并行执行。 */
  fullyParallel: true,
  /* 避免误提交或遗漏仅聚焦执行的测试。 */
  forbidOnly: true,
  /* 本地失败不重试，避免重试掩盖不稳定问题。 */
  retries: 0,
  reporter: [
    [
      'html',
      {
        // 手动执行测试命令后会写入该目录，与agent skill执行的报告目录区分开来
        outputFolder: 'playwright-report/latest',
        open: 'never',
      },
    ],
  ],
  /* 下方各项目共用的测试选项。说明见 https://playwright.dev/docs/api/class-testoptions。 */
  use: {
    /* 用于 `await page.goto('')` 等操作的基础 URL。 */
    baseURL: 'http://localhost:3000',

    /* 保留本地失败用例的 trace，便于排查问题。 */
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',

  },

  /* 配置主要浏览器对应的测试项目。 */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },

    // 暂时注释掉这两种类型的浏览器，如果需要后续再打开
    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] },
    // },

    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'] },
    // },

    /* 在移动端视口下测试。 */
    // {
    //   name: 'Mobile Chrome',
    //   use: { ...devices['Pixel 5'] },
    // },
    // {
    //   name: 'Mobile Safari',
    //   use: { ...devices['iPhone 12'] },
    // },

    /* 针对品牌浏览器进行测试。 */
    // {
    //   name: 'Microsoft Edge',
    //   use: { ...devices['Desktop Edge'], channel: 'msedge' },
    // },
    // {
    //   name: 'Google Chrome',
    //   use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    // },
  ],

  /* 启动测试前先运行本地开发服务器。 */
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
  },
});
