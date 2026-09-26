// tests/e2e/svg-export.spec.js
import { test, expect } from './support/test';
import { ImportPage } from './pages/ImportPage';
import basis from './fixtures/temperieren.json';

/**
 * SVG export (also the base of PNG, PDF and the toSVG/toPNG/toPDF API).
 *
 * The export measured the layer with getBBox(). diagram-js draws selection
 * and hover outlines only when needed, and they count in that box: the size
 * of the export depended on what had been selected before. And there was no
 * margin, so the outer half of the strokes at the edge was cut off.
 */

const clone = () => JSON.parse(JSON.stringify(basis));

const exportSvg = (page) => page.evaluate(() => new Promise((resolve, reject) => {
  window.fpbjs.saveSVG({}, (err, svg) => (err ? reject(err) : resolve(svg)));
}));

const viewBox = (svg) => {
  const match = svg.match(/viewBox="([^"]+)"/);
  const [x, y, width, height] = match[1].split(/\s+/).map(Number);
  return { x, y, width, height };
};

test.describe('SVG export', () => {

  test('has the same size no matter what was selected before', async ({ page }) => {
    const importer = new ImportPage(page);
    await importer.goto();
    await importer.import(clone());

    const before = viewBox(await exportSvg(page));

    // select the rightmost shape, so its outline is drawn, then deselect
    await page.evaluate(() => {
      const shapes = window.fpbjs.get('elementRegistry')
        .filter((e) => !e.waypoints && e.type !== 'label' && e.parent && e.type !== 'fpb:Process');
      const rightmost = shapes.sort((a, b) => (b.x + b.width) - (a.x + a.width))[0];
      window.fpbjs.get('selection').select(rightmost);
      window.fpbjs.get('selection').select(null);
    });

    expect(viewBox(await exportSvg(page))).toEqual(before);
  });

  test('keeps the full stroke of the shapes at the edge', async ({ page }) => {
    const importer = new ImportPage(page);
    await importer.goto();
    await importer.import(clone());

    const box = viewBox(await exportSvg(page));
    const bounds = await page.evaluate(() => {
      const shapes = window.fpbjs.get('elementRegistry')
        .filter((e) => !e.waypoints && e.type !== 'label' && e.parent && e.type !== 'fpb:Process');
      return {
        left: Math.min(...shapes.map((s) => s.x)),
        top: Math.min(...shapes.map((s) => s.y)),
        right: Math.max(...shapes.map((s) => s.x + s.width)),
        bottom: Math.max(...shapes.map((s) => s.y + s.height)),
      };
    });

    // strokes are up to 2 px wide: at least 1 px of room around every shape
    expect(box.x).toBeLessThanOrEqual(bounds.left - 1);
    expect(box.y).toBeLessThanOrEqual(bounds.top - 1);
    expect(box.x + box.width).toBeGreaterThanOrEqual(bounds.right + 1);
    expect(box.y + box.height).toBeGreaterThanOrEqual(bounds.bottom + 1);
  });
});
