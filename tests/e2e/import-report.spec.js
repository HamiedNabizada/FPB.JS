// tests/e2e/import-report.spec.js
import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const fixture = path.join(__dirname, '..', 'unit', 'layout', 'fixtures', 'temperieren.json');

async function importData(page, data) {
  await page.goto('/');
  await page.waitForFunction(() => window.fpbjs && window.fpbjs.get);
  await page.evaluate((json) => {
    window.fpbjs.get('eventBus').fire('FPBJS.import', { data: json });
  }, data);
}

test.describe('Import report', () => {

  test('a clean file imports without a report', async ({ page }) => {
    await importData(page, JSON.parse(fs.readFileSync(fixture, 'utf8')));
    await page.waitForTimeout(3000);
    await expect(page.locator('.import-report')).toHaveCount(0);
  });

  test('a file without layout reports the automatic arrangement', async ({ page }) => {
    const data = JSON.parse(fs.readFileSync(fixture, 'utf8'));
    data.forEach((entry) => {
      if (entry.process) {
        delete entry.elementVisualInformation;
      }
    });
    await importData(page, data);

    const report = page.locator('.import-report');
    await expect(report).toBeVisible({ timeout: 6000 });
    await expect(report).toContainText('Import completed with 2 notes');
    await expect(report).toContainText('"Aufheizen mit Prüfung" carried no layout');
    await expect(report).toContainText('download the file again to keep the layout');

    await report.getByRole('button', { name: 'Dismiss' }).click();
    await expect(report).toHaveCount(0);
  });

  test('a dangling connection is named with its ends and a hint', async ({ page }) => {
    const data = JSON.parse(fs.readFileSync(fixture, 'utf8'));
    const root = data.find((entry) => entry.process && !entry.process.isDecomposedProcessOperator);
    const flow = root.elementDataInformation.find((item) => item.$type === 'fpb:Flow');
    flow.targetRef = 'does-not-exist';
    await importData(page, data);

    const report = page.locator('.import-report');
    await expect(report).toBeVisible({ timeout: 6000 });
    await expect(report).toContainText('Flow from Warmprodukt to does-not-exist references a missing target (does-not-exist) - removed');
    await expect(report).toContainText('Add the target element with this id to the process or delete the connection from the file.');

    // The import itself went through.
    const elements = await page.evaluate(() => window.fpbjs.get('elementRegistry').getAll().length);
    expect(elements).toBeGreaterThan(10);
  });

  test('the report is also available to library users as an event', async ({ page }) => {
    const data = JSON.parse(fs.readFileSync(fixture, 'utf8'));
    data.forEach((entry) => {
      if (entry.process) {
        delete entry.elementVisualInformation;
      }
    });
    await page.goto('/');
    await page.waitForFunction(() => window.fpbjs && window.fpbjs.get);
    const warnings = await page.evaluate((json) => new Promise((resolve) => {
      window.fpbjs.get('eventBus').on('import.report', (event) => resolve(event.warnings));
      window.fpbjs.get('eventBus').fire('FPBJS.import', { data: json });
    }), data);
    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toEqual(expect.objectContaining({
      message: expect.stringContaining('carried no layout'),
      hint: expect.stringContaining('download the file again')
    }));
  });
});
