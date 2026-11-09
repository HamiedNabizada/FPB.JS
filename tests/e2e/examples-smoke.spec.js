// tests/e2e/examples-smoke.spec.js
import fs from 'fs';
import path from 'path';
import { test, expect } from './support/test';
import basis from './fixtures/temperieren.json';

/**
 * The examples for hosts (examples/*), built against the package of this
 * branch (032a V7, CI job "examples"). Each built example opens without page
 * errors and shows a canvas; the exports give text, not a pending promise.
 * Without a build (dist/index.html) the example is skipped.
 */

const EXAMPLES = path.join(__dirname, '..', '..', 'examples');
const ORIGIN = 'http://fpbjs-example.invalid';

const built = (name) => fs.existsSync(path.join(EXAMPLES, name, 'dist', 'index.html'));

async function openExample(page, name) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error && error.message || error)));
  const dist = path.join(EXAMPLES, name, 'dist');
  await page.route(ORIGIN + '/**', async (route) => {
    const url = new URL(route.request().url());
    const file = path.join(dist, url.pathname === '/' ? 'index.html' : url.pathname.slice(1));
    if (!file.startsWith(dist) || !fs.existsSync(file)) {
      return route.fulfill({ status: 404, body: 'not found' });
    }
    const type = file.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/javascript; charset=utf-8';
    return route.fulfill({ status: 200, contentType: type, body: fs.readFileSync(file) });
  });
  await page.goto(ORIGIN + '/');
  await page.waitForFunction(() => window.fpb && typeof window.fpb.importJSON === 'function');
  await expect(page.locator('.djs-container').first()).toBeVisible();
  return { errors };
}

const importBasis = (page) => page.evaluate((data) => window.fpb.importJSON(data), JSON.parse(JSON.stringify(basis)));

test.describe('Examples', () => {

  test('starter opens with a canvas and no page errors', async ({ page }) => {
    test.skip(!built('starter'), 'examples/starter is not built');
    const { errors } = await openExample(page, 'starter');
    await importBasis(page);
    expect(errors).toEqual([]);
  });

  test('import-export shows the XML export as text', async ({ page }) => {
    test.skip(!built('import-export'), 'examples/import-export is not built');
    const { errors } = await openExample(page, 'import-export');
    await importBasis(page);
    await page.locator('#btn-export-xml').click();
    await expect(page.locator('#output-content')).toContainText('<?xml');
    await page.locator('#btn-export-svg').click();
    await expect(page.locator('#output-content')).toContainText('<svg');
    expect(errors).toEqual([]);
  });

  test('event-export sends the XML export as text', async ({ page }) => {
    test.skip(!built('event-export'), 'examples/event-export is not built');
    const { errors } = await openExample(page, 'event-export');
    await importBasis(page);
    await page.locator('#btn-export-xml').click();
    await expect(page.locator('#log-output')).toContainText('<?xml');
    expect(errors).toEqual([]);
  });

});
