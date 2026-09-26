// tests/e2e/palette-tools.spec.js
import { test, expect } from './support/test';
import { ImportPage } from './pages/ImportPage';
import basis from './fixtures/temperieren.json';

/**
 * E2E tests for the palette (palette/FpbPaletteProvider, palette/PaletteUtils)
 * beyond clicking an entry: creating elements by dragging an entry onto the
 * canvas, the space and hand tool started from the palette, and where new
 * flows dock on the shapes (core/paths/PathCalculator, used by the cropping
 * of connections).
 *
 * Positions are given in diagram coordinates and converted with the viewbox.
 */

const clone = () => JSON.parse(JSON.stringify(basis));

async function laden(page) {
  const fehler = [];
  page.on('pageerror', (e) => fehler.push(e.message));
  await page.setViewportSize({ width: 1600, height: 1000 });
  const importer = new ImportPage(page);
  await importer.goto();
  await importer.import(clone());
  return { importer, fehler };
}

/** diagram coordinates -> screen coordinates of the page */
const nachBildschirm = (page, p) => page.evaluate((p) => {
  const vb = window.fpbjs.get('canvas').viewbox();
  const r = document.querySelector('.djs-container svg').getBoundingClientRect();
  return { x: r.x + (p.x - vb.x) * vb.scale, y: r.y + (p.y - vb.y) * vb.scale };
}, p);

const lage = (page, namen) => page.evaluate((namen) => {
  const out = {};
  namen.forEach((n) => {
    const e = window.fpbjs.get('elementRegistry').filter((x) => x.businessObject && x.businessObject.name === n && x.type !== 'label')[0];
    out[n] = { x: e.x, y: e.y, width: e.width, height: e.height };
  });
  return out;
}, namen);

const neueVomTyp = (page, typ, vorher) => page.evaluate(({ typ, vorher }) => window.fpbjs.get('elementRegistry')
  .filter((e) => e.type === typ && !vorher.includes(e.id))
  .map((e) => ({ id: e.id, x: e.x, y: e.y, width: e.width, height: e.height, parent: e.parent && e.parent.type })), { typ, vorher });

const alleIds = (page) => page.evaluate(() => window.fpbjs.get('elementRegistry').getAll().map((e) => e.id));

async function ziehen(page, von, nach) {
  await page.mouse.move(von.x, von.y);
  await page.mouse.down();
  await page.mouse.move((von.x + nach.x) / 2, (von.y + nach.y) / 2, { steps: 6 });
  await page.mouse.move(nach.x, nach.y, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(300);
}

test.describe('Creating elements by dragging a palette entry', () => {

  // free spots of the fixture (diagram coordinates of the new centre)
  const FAELLE = [
    { action: 'fpb-processoperator', typ: 'fpb:ProcessOperator', ziel: { x: 1100, y: 470 }, parent: 'fpb:SystemLimit' },
    { action: 'fpb-product', typ: 'fpb:Product', ziel: { x: 600, y: 300 }, parent: 'fpb:SystemLimit' },
    { action: 'fpb-energy', typ: 'fpb:Energy', ziel: { x: 1100, y: 300 }, parent: 'fpb:SystemLimit' },
    { action: 'fpb-information', typ: 'fpb:Information', ziel: { x: 1100, y: 450 }, parent: 'fpb:SystemLimit' },
    { action: 'fpb-technicalresource', typ: 'fpb:TechnicalResource', ziel: { x: 1330, y: 550 }, parent: 'fpb:Process' },
  ];

  for (const f of FAELLE) {
    test(`dragging "${f.action}" onto the canvas creates the element where it is dropped`, async ({ page }) => {
      const { fehler } = await laden(page);
      const vorher = await alleIds(page);
      const eintrag = await page.locator(`.djs-palette .entry[data-action="${f.action}"]`).boundingBox();
      const ziel = await nachBildschirm(page, f.ziel);
      await ziehen(page, { x: eintrag.x + eintrag.width / 2, y: eintrag.y + eintrag.height / 2 }, ziel);

      const neu = await neueVomTyp(page, f.typ, vorher);
      expect(neu.length).toBe(1);
      expect(neu[0].parent).toBe(f.parent);
      // centred on the drop point (both on the grid)
      expect(neu[0].x + neu[0].width / 2).toBe(f.ziel.x);
      expect(neu[0].y + neu[0].height / 2).toBe(f.ziel.y);
      // the new element is selected, and it is one step in the history
      expect(await page.evaluate(() => window.fpbjs.get('selection').get().map((e) => e.id))).toEqual([neu[0].id]);
      await page.evaluate(() => window.fpbjs.get('commandStack').undo());
      expect(await neueVomTyp(page, f.typ, vorher)).toEqual([]);
      expect(fehler).toEqual([]);
    });
  }

  test('Ctrl+Z right after creating an element from the palette takes it back', async ({ page }) => {
    test.fail(true, 'BUG: the palette entry keeps the keyboard focus after the create gesture (tabindex from a11y/CanvasAccessibility), the diagram-js keyboard on the canvas SVG gets no key');
    await laden(page);
    const vorher = await alleIds(page);
    // create by click and click, as the palette tooltip suggests
    await page.locator('.djs-palette .entry[data-action="fpb-technicalresource"]').click();
    const ziel = await nachBildschirm(page, { x: 1330, y: 550 });
    await page.mouse.move(ziel.x, ziel.y, { steps: 4 });
    await page.mouse.click(ziel.x, ziel.y);
    await page.waitForTimeout(300);
    expect((await neueVomTyp(page, 'fpb:TechnicalResource', vorher)).length).toBe(1);

    await page.keyboard.press('Control+z');
    await page.waitForTimeout(200);
    expect(await neueVomTyp(page, 'fpb:TechnicalResource', vorher)).toEqual([]);
  });

  test('dropping an entry on the palette itself creates nothing', async ({ page }) => {
    await laden(page);
    const vorher = await alleIds(page);
    const eintrag = await page.locator('.djs-palette .entry[data-action="fpb-processoperator"]').boundingBox();
    const anderer = await page.locator('.djs-palette .entry[data-action="fpb-product"]').boundingBox();
    await ziehen(page, { x: eintrag.x + eintrag.width / 2, y: eintrag.y + eintrag.height / 2 },
      { x: anderer.x + anderer.width / 2, y: anderer.y + anderer.height / 2 });
    await page.keyboard.press('Escape');
    expect(await alleIds(page)).toEqual(vorher);
  });
});

test.describe('Tools started from the palette', () => {

  test('the space tool makes room: what lies right of the start moves, the rest stays', async ({ page }) => {
    const { fehler } = await laden(page);
    const NAMEN = ['Heizplatte', 'Aufheizen mit Prüfung', 'Erhitzen', 'Prüfen', 'Rohstoff'];
    const vorher = await lage(page, NAMEN);

    await page.locator('.djs-palette .entry[data-action="space-tool"]').click();
    // start between the right edge of the system limit (1195) and the resource (1255)
    await ziehen(page, await nachBildschirm(page, { x: 1225, y: 600 }), await nachBildschirm(page, { x: 1325, y: 600 }));

    const nachher = await lage(page, NAMEN);
    expect(nachher.Heizplatte).toEqual({ ...vorher.Heizplatte, x: vorher.Heizplatte.x + 100 });
    ['Aufheizen mit Prüfung', 'Erhitzen', 'Prüfen', 'Rohstoff'].forEach((n) => expect(nachher[n]).toEqual(vorher[n]));
    // the usage flow to the resource follows
    const usage = await page.evaluate(() => {
      const u = window.fpbjs.get('elementRegistry').filter((e) => e.type === 'fpb:Usage')[0];
      return u.waypoints[u.waypoints.length - 1];
    });
    expect(usage.x).toBe(nachher.Heizplatte.x);

    await page.keyboard.press('Control+z');
    await page.waitForTimeout(200);
    expect(await lage(page, NAMEN)).toEqual(vorher);
    expect(fehler).toEqual([]);
  });

  test('the hand tool pans the view and moves no element', async ({ page }) => {
    await laden(page);
    const vorher = await lage(page, ['Erhitzen', 'Heizplatte']);
    const vb = await page.evaluate(() => window.fpbjs.get('canvas').viewbox());
    const stapel = await page.evaluate(() => window.fpbjs.get('commandStack')._stackIdx);

    await page.locator('.djs-palette .entry[data-action="hand-tool"]').click();
    // start on an element: the hand grabs the canvas, not the element
    const start = await nachBildschirm(page, { x: 830, y: 349 });
    await ziehen(page, start, { x: start.x + 100, y: start.y + 50 });

    const vb2 = await page.evaluate(() => window.fpbjs.get('canvas').viewbox());
    expect(vb2.x).toBeCloseTo(vb.x - 100 / vb.scale, 0);
    expect(vb2.y).toBeCloseTo(vb.y - 50 / vb.scale, 0);
    expect(await lage(page, ['Erhitzen', 'Heizplatte'])).toEqual(vorher);
    expect(await page.evaluate(() => window.fpbjs.get('commandStack')._stackIdx)).toBe(stapel);
  });
});

test.describe('Where new flows dock', () => {

  test('a flow from each kind of state starts on the outline of its shape and ends on the operator', async ({ page }) => {
    const { fehler } = await laden(page);
    // three new states side by side in the free right part of the system limit
    const STATES = [
      { action: 'fpb-product', typ: 'fpb:Product', ziel: { x: 1050, y: 290 } },
      { action: 'fpb-energy', typ: 'fpb:Energy', ziel: { x: 1110, y: 290 } },
      { action: 'fpb-information', typ: 'fpb:Information', ziel: { x: 1170, y: 290 } },
    ];
    const pruefen = (await lage(page, ['Prüfen'])).Prüfen;
    const zielPunkt = await nachBildschirm(page, { x: pruefen.x + pruefen.width / 2, y: pruefen.y + pruefen.height / 2 });

    // place all states first, so no new flow lies on the spot of the next one
    for (const s of STATES) {
      const vorher = await alleIds(page);
      await page.locator(`.djs-palette .entry[data-action="${s.action}"]`).click();
      const ziel = await nachBildschirm(page, s.ziel);
      await page.mouse.move(ziel.x, ziel.y, { steps: 4 });
      await page.mouse.click(ziel.x, ziel.y);
      await page.waitForTimeout(250);
      const neu = await neueVomTyp(page, s.typ, vorher);
      expect(neu.length, s.typ).toBe(1);
      s.id = neu[0].id;
    }

    for (const s of STATES) {
      // select the state and connect from its context pad to the operator
      const mitte = await nachBildschirm(page, s.ziel);
      await page.mouse.click(mitte.x, mitte.y);
      await page.locator('.djs-context-pad .entry[data-action="connect"]').click();
      await page.mouse.move(zielPunkt.x, zielPunkt.y, { steps: 6 });
      await page.mouse.click(zielPunkt.x, zielPunkt.y);
      await page.waitForTimeout(250);
    }

    const ergebnis = await page.evaluate((ids) => ids.map((id) => {
      const s = window.fpbjs.get('elementRegistry').get(id);
      const flow = s.outgoing[0];
      if (!flow) return { id, flow: null };
      const a = flow.waypoints[0];
      const z = flow.waypoints[flow.waypoints.length - 1];
      const t = flow.target;
      return {
        type: s.type,
        target: t.businessObject.name,
        start: { x: a.x, y: a.y },
        end: { x: z.x, y: z.y },
        s: { x: s.x, y: s.y, width: s.width, height: s.height },
        t: { x: t.x, y: t.y, width: t.width, height: t.height },
      };
    }), STATES.map((s) => s.id));

    const aufLinie = (p, a, b) => {
      // distance of p to the segment a-b
      const vx = b.x - a.x; const vy = b.y - a.y;
      const k = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / (vx * vx + vy * vy)));
      return Math.hypot(p.x - (a.x + k * vx), p.y - (a.y + k * vy));
    };
    const aufPolygon = (p, punkte) => Math.min(...punkte.map((a, i) => aufLinie(p, a, punkte[(i + 1) % punkte.length])));

    ergebnis.forEach((r) => {
      expect(r.target).toBe('Prüfen');
      const { x, y, width: w, height: h } = r.s;
      const cx = x + w / 2; const cy = y + h / 2;
      let abstand;
      if (r.type === 'fpb:Product') {
        abstand = Math.abs(Math.hypot(r.start.x - cx, r.start.y - cy) - w / 2);
      } else if (r.type === 'fpb:Energy') {
        abstand = aufPolygon(r.start, [{ x: cx, y }, { x: x + w, y: cy }, { x: cx, y: y + h }, { x, y: cy }]);
      } else {
        abstand = aufPolygon(r.start, [{ x: x + w / 4, y }, { x: x + 3 * w / 4, y }, { x: x + w, y: cy },
          { x: x + 3 * w / 4, y: y + h }, { x: x + w / 4, y: y + h }, { x, y: cy }]);
      }
      expect(abstand, r.type).toBeLessThanOrEqual(1);
      // the end lies on the border of the operator rectangle
      const t = r.t;
      const rand = aufPolygon(r.end, [{ x: t.x, y: t.y }, { x: t.x + t.width, y: t.y }, { x: t.x + t.width, y: t.y + t.height }, { x: t.x, y: t.y + t.height }]);
      expect(rand, r.type).toBeLessThanOrEqual(1);
    });
    expect(fehler).toEqual([]);
  });
});
