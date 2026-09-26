// tests/e2e/support/test.js
import { test as base, expect, devices } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

/**
 * Shared entry for all E2E specs. Plain Playwright unless the coverage run
 * (playwright.coverage.config.js) sets FPB_COVERAGE_DIR: then every test
 * hands the coverage counters of its open pages (window.__coverage__, from
 * babel-plugin-istanbul) to that directory for `nyc report`.
 *
 * Pages closed or reloaded during a test lose their counters; the measured
 * coverage is therefore a lower bound.
 */
const coverageDir = process.env.FPB_COVERAGE_DIR;

export const test = base.extend({
  collectCoverage: [async ({ context }, use) => {
    await use();
    if (!coverageDir) {
      return;
    }
    fs.mkdirSync(coverageDir, { recursive: true });
    for (const page of context.pages()) {
      const coverage = await page.evaluate(() => window.__coverage__).catch(() => null);
      if (coverage) {
        const file = path.join(coverageDir, crypto.randomUUID() + '.json');
        fs.writeFileSync(file, JSON.stringify(coverage));
      }
    }
  }, { auto: true }]
});

export { expect, devices };
