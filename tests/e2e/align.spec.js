// tests/e2e/align.spec.js
import { test, expect } from './support/test';
import { ImportPage } from './pages/ImportPage';
import basis from './fixtures/temperieren.json';
import { exportiere, nachIds } from './helpers/modelExport';

/**
 * E2E tests for aligning and distributing several selected elements
 * (services/AlignService, KeyboardAlignService, PaletteAlignState).
 *
 * The palette has no align entries any more (removed in 040fb1b; the handlers
 * in PaletteUtils and the PaletteAlignState service are left over), so the
 * keyboard shortcuts listed in the info dialog are the only way in:
 *   Ctrl+Shift+L/C/R  left, center, right
 *   Ctrl+Shift+T/M/B  top, middle, bottom
 *   Ctrl+Shift+H/V    distribute horizontally, vertically
 *
 * The test elements are three technical resources placed left of the system
 * limit of the fixture: no connections, no parent other than the root, so the
 * expected positions follow from the bounding box alone. Further tests mix in
 * what a real selection contains (connections after Ctrl+A, labels from the
 * lasso) and elements the modeling rules keep in place.
 */

const clone = () => JSON.parse(JSON.stringify(basis));

// center points; a technical resource is 150 x 80
const START = [
  { name: 'TR_A', x: 120, y: 240 },
  { name: 'TR_B', x: 300, y: 420 },
  { name: 'TR_C', x: 180, y: 600 },
];

async function vorbereiten(page) {
  const fehler = [];
  page.on('pageerror', (e) => fehler.push(e.message));
  await page.setViewportSize({ width: 1600, height: 1000 });
  const importer = new ImportPage(page);
  await importer.goto();
  await importer.import(clone());

  await page.evaluate((start) => {
    const modeler = window.fpbjs;
    const root = modeler.get('canvas').getRootElement();
    start.forEach((s) => {
      const shape = modeler.get('elementFactory').createShape({ type: 'fpb:TechnicalResource' });
      const created = modeler.get('modeling').createShape(shape, { x: s.x, y: s.y }, root);
      modeler.get('modeling').updateLabel(created, s.name);
    });
    modeler.get('canvas').zoom('fit-viewport');
  }, START);
  await page.waitForTimeout(300);
  return { importer, fehler };
}

async function punkt(page, name) {
  return page.evaluate((name) => {
    const element = window.fpbjs.get('elementRegistry')
      .filter((e) => e.businessObject && e.businessObject.name === name && !e.waypoints && e.type !== 'label')[0];
    const box = document.querySelector(`[data-element-id="${element.id}"]`).getBoundingClientRect();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }, name);
}

/** Select by clicking the first name and shift-clicking the others, as a user does */
async function waehle(page, namen) {
  // start empty: diagram-js deselects an element that is clicked while it is
  // the only one selected
  await page.evaluate(() => window.fpbjs.get('selection').select(null));
  for (let i = 0; i < namen.length; i++) {
    const p = await punkt(page, namen[i]);
    if (i === 0) {
      await page.mouse.click(p.x, p.y);
    } else {
      await page.keyboard.down('Shift');
      await page.mouse.click(p.x, p.y);
      await page.keyboard.up('Shift');
    }
  }
  await page.waitForTimeout(150);
  return page.evaluate(() => window.fpbjs.get('selection').get().map((e) => e.businessObject.name).sort());
}

const lage = (page, namen) => page.evaluate((namen) => {
  const registry = window.fpbjs.get('elementRegistry');
  const out = {};
  namen.forEach((name) => {
    const e = registry.filter((x) => x.businessObject && x.businessObject.name === name && !x.waypoints && x.type !== 'label')[0];
    out[name] = { x: e.x, y: e.y, width: e.width, height: e.height };
  });
  return out;
}, namen);

const taste = async (page, kuerzel) => {
  await page.keyboard.press(kuerzel);
  await page.waitForTimeout(200);
};

const NAMEN = START.map((s) => s.name);

function box(l) {
  const werte = Object.values(l);
  const minX = Math.min(...werte.map((e) => e.x));
  const minY = Math.min(...werte.map((e) => e.y));
  const maxX = Math.max(...werte.map((e) => e.x + e.width));
  const maxY = Math.max(...werte.map((e) => e.y + e.height));
  return { minX, minY, maxX, maxY, cx: minX + (maxX - minX) / 2, cy: minY + (maxY - minY) / 2 };
}

const RICHTUNGEN = [
  { kuerzel: 'Control+Shift+L', name: 'left', pruefe: (e, b) => expect(e.x).toBeCloseTo(b.minX, 5), fest: 'y' },
  { kuerzel: 'Control+Shift+C', name: 'center', pruefe: (e, b) => expect(e.x + e.width / 2).toBeCloseTo(b.cx, 5), fest: 'y' },
  { kuerzel: 'Control+Shift+R', name: 'right', pruefe: (e, b) => expect(e.x + e.width).toBeCloseTo(b.maxX, 5), fest: 'y' },
  { kuerzel: 'Control+Shift+T', name: 'top', pruefe: (e, b) => expect(e.y).toBeCloseTo(b.minY, 5), fest: 'x' },
  { kuerzel: 'Control+Shift+M', name: 'middle', pruefe: (e, b) => expect(e.y + e.height / 2).toBeCloseTo(b.cy, 5), fest: 'x' },
  { kuerzel: 'Control+Shift+B', name: 'bottom', pruefe: (e, b) => expect(e.y + e.height).toBeCloseTo(b.maxY, 5), fest: 'x' },
];

test.describe('Align by keyboard', () => {

  for (const r of RICHTUNGEN) {
    test(`${r.kuerzel} aligns ${r.name} and leaves the other axis alone`, async ({ page }) => {
      const { fehler } = await vorbereiten(page);
      expect(await waehle(page, NAMEN)).toEqual([...NAMEN].sort());

      const vorher = await lage(page, NAMEN);
      const b = box(vorher);

      await taste(page, r.kuerzel);
      const nachher = await lage(page, NAMEN);

      NAMEN.forEach((n) => {
        r.pruefe(nachher[n], b);
        expect(nachher[n][r.fest]).toBe(vorher[n][r.fest]);
        expect(nachher[n].width).toBe(vorher[n].width);
      });
      // the selection survives, a second shortcut works on the same elements
      expect((await page.evaluate(() => window.fpbjs.get('selection').get().length))).toBe(3);
      expect(fehler).toEqual([]);
    });
  }

  test('two aligned directions in a row stack the elements on one point', async ({ page }) => {
    await vorbereiten(page);
    await waehle(page, NAMEN);
    await taste(page, 'Control+Shift+L');
    await taste(page, 'Control+Shift+T');
    const l = await lage(page, NAMEN);
    const xs = new Set(NAMEN.map((n) => l[n].x));
    const ys = new Set(NAMEN.map((n) => l[n].y));
    expect(xs.size).toBe(1);
    expect(ys.size).toBe(1);
  });

  test('with a single selected element nothing moves', async ({ page }) => {
    await vorbereiten(page);
    await waehle(page, ['TR_B']);
    const vorher = await lage(page, NAMEN);
    const meldungen = await page.evaluate(() => {
      window.__alignEvents = [];
      window.fpbjs.on('keyboard.align.insufficient', (e) => window.__alignEvents.push(e.required));
      window.fpbjs.on('keyboard.distribute.insufficient', (e) => window.__alignEvents.push(e.required));
      return true;
    });
    expect(meldungen).toBe(true);

    for (const k of ['Control+Shift+L', 'Control+Shift+B', 'Control+Shift+H']) {
      await taste(page, k);
    }
    expect(await lage(page, NAMEN)).toEqual(vorher);
    expect(await page.evaluate(() => window.__alignEvents)).toEqual([2, 2, 3]);
  });

  test('two selected elements align but do not distribute', async ({ page }) => {
    await vorbereiten(page);
    await waehle(page, ['TR_A', 'TR_B']);
    const vorher = await lage(page, NAMEN);

    await taste(page, 'Control+Shift+H');
    expect(await lage(page, NAMEN)).toEqual(vorher);

    await taste(page, 'Control+Shift+R');
    const nachher = await lage(page, NAMEN);
    expect(nachher.TR_A.x + nachher.TR_A.width).toBe(vorher.TR_B.x + vorher.TR_B.width);
    expect(nachher.TR_B).toEqual(vorher.TR_B);
    expect(nachher.TR_C).toEqual(vorher.TR_C); // not selected
  });

  test('Ctrl+Shift+H distributes the centers evenly between the outer elements', async ({ page }) => {
    await vorbereiten(page);
    await waehle(page, NAMEN);
    const vorher = await lage(page, NAMEN);

    await taste(page, 'Control+Shift+H');
    const l = await lage(page, NAMEN);
    const mitte = (n) => l[n].x + l[n].width / 2;
    // sorted by center x: A (120), C (180), B (300) -> C moves to 210
    expect(l.TR_A).toEqual(vorher.TR_A);
    expect(l.TR_B).toEqual(vorher.TR_B);
    expect(mitte('TR_C') - mitte('TR_A')).toBeCloseTo(mitte('TR_B') - mitte('TR_C'), 5);
    expect(l.TR_C.y).toBe(vorher.TR_C.y);
  });

  test('Ctrl+Shift+V distributes the centers evenly from top to bottom', async ({ page }) => {
    await vorbereiten(page);
    // make the vertical spacing uneven first
    await page.evaluate(() => {
      const registry = window.fpbjs.get('elementRegistry');
      const b = registry.filter((x) => x.businessObject && x.businessObject.name === 'TR_B' && x.type !== 'label')[0];
      window.fpbjs.get('modeling').moveElements([b], { x: 0, y: 100 });
    });
    await waehle(page, NAMEN);
    const vorher = await lage(page, NAMEN);
    const anzahlVorher = await page.evaluate(() => window.fpbjs.get('elementRegistry').getAll().length);

    await taste(page, 'Control+Shift+V');
    const l = await lage(page, NAMEN);
    const mitte = (n) => l[n].y + l[n].height / 2;
    // order by center y as the service does
    const sortiert = [...NAMEN].sort((a, b) => (vorher[a].y - vorher[b].y));
    expect(l[sortiert[0]]).toEqual(vorher[sortiert[0]]);
    expect(l[sortiert[2]]).toEqual(vorher[sortiert[2]]);
    expect(mitte(sortiert[1]) - mitte(sortiert[0])).toBeCloseTo(mitte(sortiert[2]) - mitte(sortiert[1]), 5);
    expect(l[sortiert[1]].x).toBe(vorher[sortiert[1]].x);
    expect(await page.evaluate(() => window.fpbjs.get('elementRegistry').getAll().length)).toBe(anzahlVorher);
  });

  test('aligning connected operators keeps the flows attached', async ({ page }) => {
    const { fehler } = await vorbereiten(page);
    await waehle(page, ['Erhitzen', 'Prüfen']);
    await taste(page, 'Control+Shift+C');

    const ergebnis = await page.evaluate(() => {
      const registry = window.fpbjs.get('elementRegistry');
      const pruefen = registry.filter((x) => x.businessObject && x.businessObject.name === 'Prüfen' && x.type !== 'label')[0];
      const erhitzen = registry.filter((x) => x.businessObject && x.businessObject.name === 'Erhitzen' && x.type !== 'label')[0];
      const nah = (p, s) => p.x >= s.x - 2 && p.x <= s.x + s.width + 2 && p.y >= s.y - 2 && p.y <= s.y + s.height + 2;
      const lose = [];
      [...pruefen.incoming, ...pruefen.outgoing, ...erhitzen.incoming, ...erhitzen.outgoing].forEach((c) => {
        const a = c.waypoints[0];
        const z = c.waypoints[c.waypoints.length - 1];
        if (!nah(a, c.source) || !nah(z, c.target)) lose.push(c.id);
      });
      return { mitte: [erhitzen.x + erhitzen.width / 2, pruefen.x + pruefen.width / 2], lose };
    });
    expect(ergebnis.mitte[0]).toBeCloseTo(ergebnis.mitte[1], 5);
    expect(ergebnis.lose).toEqual([]);
    expect(fehler).toEqual([]);
  });

  test('the alignment is written to the export', async ({ page }) => {
    await vorbereiten(page);
    await waehle(page, NAMEN);
    await taste(page, 'Control+Shift+L');
    const l = await lage(page, NAMEN);

    const modell = nachIds(await exportiere(page));
    const root = await page.evaluate(() => window.fpbjs.get('canvas').getRootElement().id);
    const ids = await page.evaluate((namen) => namen.map((n) => window.fpbjs.get('elementRegistry')
      .filter((x) => x.businessObject && x.businessObject.name === n && x.type !== 'label')[0].id), NAMEN);
    ids.forEach((id, i) => {
      expect(modell[root].grafik[id].x).toBe(l[NAMEN[i]].x);
    });
  });
});

test.describe('Align and undo', () => {

  test('one Ctrl+Z takes back a whole alignment', async ({ page }) => {
    await vorbereiten(page);
    await waehle(page, NAMEN);
    const vorher = await lage(page, NAMEN);

    await taste(page, 'Control+Shift+L');
    expect(await lage(page, NAMEN)).not.toEqual(vorher);

    await taste(page, 'Control+z');
    expect(await lage(page, NAMEN)).toEqual(vorher);
  });

  test('undoing every step of an alignment restores the positions, redo repeats it', async ({ page }) => {
    await vorbereiten(page);
    await waehle(page, NAMEN);
    const vorher = await lage(page, NAMEN);
    const idxVorher = await page.evaluate(() => window.fpbjs.get('commandStack')._stackIdx);

    await taste(page, 'Control+Shift+R');
    const nachher = await lage(page, NAMEN);
    // user-visible undo steps = distinct command ids pushed by the alignment
    const schritte = await page.evaluate((von) => {
      const cs = window.fpbjs.get('commandStack');
      return new Set(cs._stack.slice(von + 1, cs._stackIdx + 1).map((a) => a.id)).size;
    }, idxVorher);
    expect(schritte).toBeGreaterThan(0);

    for (let i = 0; i < schritte; i++) await taste(page, 'Control+z');
    expect(await lage(page, NAMEN)).toEqual(vorher);

    for (let i = 0; i < schritte; i++) await taste(page, 'Control+y');
    expect(await lage(page, NAMEN)).toEqual(nachher);
  });

  test('distribution is taken back by undo as well', async ({ page }) => {
    await vorbereiten(page);
    await waehle(page, NAMEN);
    const vorher = await lage(page, NAMEN);
    await taste(page, 'Control+Shift+H');
    expect(await lage(page, NAMEN)).not.toEqual(vorher);
    await taste(page, 'Control+z');
    expect(await lage(page, NAMEN)).toEqual(vorher);
  });
});

test.describe('Align with mixed selections and the modeling rules', () => {

  test('after Ctrl+A the shortcut aligns the shapes and keeps every position a number', async ({ page }) => {
    const { fehler } = await vorbereiten(page);
    await waehle(page, ['TR_A']);
    await taste(page, 'Control+a');
    // Ctrl+A selects connections as well (FpbEditorActions selectAll)
    expect(await page.evaluate(() => window.fpbjs.get('selection').get().some((e) => e.waypoints))).toBe(true);

    await taste(page, 'Control+Shift+L');
    const kaputt = await page.evaluate(() => {
      const out = [];
      window.fpbjs.get('elementRegistry').forEach((e) => {
        if (!e.parent) return;
        if (e.waypoints) {
          e.waypoints.forEach((p) => { if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) out.push(e.id); });
        } else if (!Number.isFinite(e.x) || !Number.isFinite(e.y)) {
          out.push(e.id);
        }
      });
      return [...new Set(out)];
    });
    expect(kaputt).toEqual([]);
    expect(fehler).toEqual([]);
  });

  test('states selected together with their labels keep their places when they are aligned already', async ({ page }) => {
    const importer = new ImportPage(page);
    await page.setViewportSize({ width: 1600, height: 1000 });
    await importer.goto();
    await importer.import(clone());
    const EINGAENGE = ['Rohstoff', 'Strom', 'Temperatur'];

    // lasso around the three input states on the upper border and their labels
    const rahmen = await page.evaluate((namen) => {
      const boxen = [];
      namen.forEach((n) => {
        const e = window.fpbjs.get('elementRegistry').filter((x) => x.businessObject && x.businessObject.name === n && x.type !== 'label')[0];
        boxen.push(document.querySelector(`[data-element-id="${e.id}"]`).getBoundingClientRect());
        boxen.push(document.querySelector(`[data-element-id="${e.label.id}"]`).getBoundingClientRect());
      });
      return {
        links: Math.min(...boxen.map((r) => r.left)) - 10,
        oben: Math.min(...boxen.map((r) => r.top)) - 10,
        rechts: Math.max(...boxen.map((r) => r.right)) + 10,
        unten: Math.max(...boxen.map((r) => r.bottom)) + 10,
      };
    }, EINGAENGE);
    await page.locator('.djs-palette .entry[data-action="lasso-tool"]').click();
    await page.mouse.move(rahmen.links, rahmen.oben);
    await page.mouse.down();
    await page.mouse.move(rahmen.rechts, rahmen.unten, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(200);
    const gewaehlt = await page.evaluate(() => window.fpbjs.get('selection').get()
      .filter((e) => e.type !== 'label').map((e) => e.businessObject.name).sort());
    expect(gewaehlt).toEqual([...EINGAENGE].sort());

    const vorher = await lage(page, EINGAENGE);
    expect(new Set(EINGAENGE.map((n) => vorher[n].y)).size).toBe(1);

    await taste(page, 'Control+Shift+T');
    expect(await lage(page, EINGAENGE)).toEqual(vorher);
  });

  test('aligning does not pull a boundary state of a decomposition off the system limit', async ({ page }) => {
    const importer = new ImportPage(page);
    await page.setViewportSize({ width: 1600, height: 1000 });
    await importer.goto();
    await importer.import(clone());
    await importer.switchToChildLayer();

    const vorher = await lage(page, ['Rohstoff', 'Vorwärmen']);
    // the same state cannot be dragged down by the mouse
    const p = await punkt(page, 'Rohstoff');
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    await page.mouse.move(p.x, p.y + 80, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(200);
    expect((await lage(page, ['Rohstoff'])).Rohstoff).toEqual(vorher.Rohstoff);

    expect(await waehle(page, ['Rohstoff', 'Vorwärmen'])).toEqual(['Rohstoff', 'Vorwärmen']);
    await taste(page, 'Control+Shift+B');
    // still centred on the upper border of the system limit
    expect((await lage(page, ['Rohstoff'])).Rohstoff.y).toBe(vorher.Rohstoff.y);
  });

  test('aligning does not move a technical resource into the system limit', async ({ page }) => {
    const importer = new ImportPage(page);
    await page.setViewportSize({ width: 1600, height: 1000 });
    await importer.goto();
    await importer.import(clone());

    const sl = (await lage(page, ['Aufheizen mit Prüfung']))['Aufheizen mit Prüfung'];
    const innen = (e) => e.x < sl.x + sl.width && e.x + e.width > sl.x && e.y < sl.y + sl.height && e.y + e.height > sl.y;
    // dragging the resource onto the operator is refused
    const von = await punkt(page, 'Heizplatte');
    const nach = await punkt(page, 'Erhitzen');
    await page.mouse.move(von.x, von.y);
    await page.mouse.down();
    await page.mouse.move(nach.x, nach.y + 120, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(200);
    expect(innen((await lage(page, ['Heizplatte'])).Heizplatte)).toBe(false);

    expect(await waehle(page, ['Heizplatte', 'Erhitzen'])).toEqual(['Erhitzen', 'Heizplatte']);
    await taste(page, 'Control+Shift+L');
    expect(innen((await lage(page, ['Heizplatte'])).Heizplatte)).toBe(false);
  });
});

test.describe('Align shortcuts do not trigger other actions', () => {

  test('Ctrl+Shift+V distributes and does not paste the clipboard', async ({ page }) => {
    await vorbereiten(page);
    // something in the clipboard
    await waehle(page, ['TR_A']);
    await taste(page, 'Control+c');

    await waehle(page, NAMEN);
    const anzahl = await page.evaluate(() => window.fpbjs.get('elementRegistry').filter((e) => e.type === 'fpb:TechnicalResource').length);
    await taste(page, 'Control+Shift+V');
    expect(await page.evaluate(() => window.fpbjs.get('elementRegistry').filter((e) => e.type === 'fpb:TechnicalResource').length)).toBe(anzahl);
    expect(await page.evaluate(() => window.fpbjs.get('selection').get().map((e) => e.businessObject.name).sort())).toEqual([...NAMEN].sort());
  });

  test('Ctrl+Shift+C aligns and does not replace the clipboard', async ({ page }) => {
    await vorbereiten(page);
    await waehle(page, ['Heizplatte']);
    await taste(page, 'Control+c');

    await waehle(page, NAMEN);
    await taste(page, 'Control+Shift+C');

    // pasting must still give the copied Heizplatte, not the three aligned elements
    await taste(page, 'Control+v');
    const eingefuegt = await page.evaluate(() => window.fpbjs.get('selection').get().map((e) => e.businessObject.name));
    expect(eingefuegt).toEqual(['Heizplatte']);
  });

  test('Ctrl+Shift+V in a text field pastes there and leaves the diagram alone', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'clipboard permissions are a Chromium feature of Playwright');
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await vorbereiten(page);
    // uneven vertical spacing, so a distribution would show
    await page.evaluate(() => {
      const b = window.fpbjs.get('elementRegistry').filter((x) => x.businessObject && x.businessObject.name === 'TR_B' && x.type !== 'label')[0];
      window.fpbjs.get('modeling').moveElements([b], { x: 0, y: 100 });
    });
    expect(await waehle(page, NAMEN)).toEqual([...NAMEN].sort());
    const vorher = await lage(page, NAMEN);

    // the search field of the process overview
    await page.locator('#openLayerButton').click();
    const suche = page.getByPlaceholder('Search processes...');
    await suche.click();
    await page.evaluate(() => navigator.clipboard.writeText('erh'));
    await taste(page, 'Control+Shift+V');

    expect(await lage(page, NAMEN)).toEqual(vorher);
    await expect(suche).toHaveValue('erh');
  });

  test('the palette offers no align entries, so PaletteAlignState has nothing to switch', async ({ page }) => {
    await vorbereiten(page);
    await waehle(page, NAMEN);
    const eintraege = await page.evaluate(() => [...document.querySelectorAll('.djs-palette .entry')].map((e) => e.getAttribute('data-action')));
    expect(eintraege).toEqual(expect.arrayContaining(['lasso-tool', 'space-tool', 'hand-tool']));
    expect(eintraege.filter((a) => /align|distribute/.test(a))).toEqual([]);
    // the state is tracked nonetheless
    expect(await page.evaluate(() => window.fpbjs.get('paletteAlignState').getCurrentState()))
      .toEqual({ canAlign: true, canDistribute: true, selectedCount: 3 });
    expect(await page.evaluate(() => window.fpbjs.get('alignService').getToolStates()))
      .toEqual({ canAlign: true, canDistribute: true, selectedCount: 3 });
  });

  test('the lasso selection feeds the shortcuts too', async ({ page }) => {
    await vorbereiten(page);
    // move the view so the elements are clear of the palette
    await page.evaluate(() => window.fpbjs.get('canvas').scroll({ dx: 250, dy: 0 }));
    await page.waitForTimeout(200);
    const rahmen = await page.evaluate((namen) => {
      const boxen = namen.map((n) => {
        const e = window.fpbjs.get('elementRegistry').filter((x) => x.businessObject && x.businessObject.name === n && x.type !== 'label')[0];
        return document.querySelector(`[data-element-id="${e.id}"]`).getBoundingClientRect();
      });
      return {
        links: Math.min(...boxen.map((r) => r.left)) - 15,
        oben: Math.min(...boxen.map((r) => r.top)) - 15,
        rechts: Math.max(...boxen.map((r) => r.right)) + 15,
        unten: Math.max(...boxen.map((r) => r.bottom)) + 15,
      };
    }, NAMEN);
    await page.locator('.djs-palette .entry[data-action="lasso-tool"]').click();
    await page.waitForTimeout(100);
    await page.mouse.move(rahmen.links, rahmen.oben);
    await page.mouse.down();
    await page.mouse.move(rahmen.rechts, rahmen.unten, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(200);
    const gewaehlt = await page.evaluate(() => window.fpbjs.get('selection').get().filter((e) => e.type !== 'label').map((e) => e.businessObject.name).sort());
    expect(gewaehlt).toEqual([...NAMEN].sort());

    await taste(page, 'Control+Shift+T');
    const l = await lage(page, NAMEN);
    expect(new Set(NAMEN.map((n) => l[n].y)).size).toBe(1);
  });
});
