// playwright.coverage.config.js
import path from 'path';
import { defineConfig } from '@playwright/test';
import base from './playwright.config.js';

/**
 * E2E run that measures which code the tests reach: an instrumented dev
 * server on its own port (webpack `--env coverage`), Chromium only. Every
 * test writes its counters to coverage/e2e/.nyc_output (tests/e2e/support/test.js);
 * `npm run test:e2e:coverage` then renders the report to coverage/e2e.
 */
const PORT = 3011;
process.env.FPB_COVERAGE_DIR = path.resolve('coverage/e2e/.nyc_output');

export default defineConfig({
  ...base,
  use: { ...base.use, baseURL: `http://localhost:${PORT}` },
  projects: base.projects.filter((project) => project.name === 'chromium'),
  webServer: {
    ...base.webServer,
    command: `npx webpack serve --env coverage --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false
  }
});
