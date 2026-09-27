// tests/e2e/labels.spec.js
import { test, expect } from './support/test';
import { ImportPage } from './pages/ImportPage';
import basis from './fixtures/temperieren.json';

/**
 * E2E tests for label rendering and label editing (core/FpbRenderer,
 * core/shapes/BaseShapeRenderer, core/TextRenderer, label/LabelProvider,
 * label/positioning/BoundsCalculator, label/cmd/UpdateLabelHandler).
 *
 * Rules as implemented (core/FpbConstants LABEL_LIMITS):
 *  - process operator, technical resource, system limit: one line inside the
 *    shape, a longer name is cut and ends with an ellipsis
 *  - the editor opens where the name is drawn: operator bottom right,
 *    technical resource bottom center, system limit top right
 *  - states: external label, wrapped, at most three lines, then an ellipsis
 *  - a cut name, or an identification.longName, is shown as hover tooltip
 *    (div.fpb-tooltip, after 400 ms)
 *  - a state gets its external label when it is named (UpdateLabelHandler,
 *    label/LabelPreview hides the drawn name while the editor is open)
 */

const clone = () => JSON.parse(JSON.stringify(basis));

const LANG = 'Erhitzen der Rohstoffe auf die vorgegebene Zieltemperatur mit anschließender Haltezeit';

async function laden(page, path = '/') {
  const fehler = [];
  page.on('pageerror', (e) => fehler.push(e.message));
  await page.setViewportSize({ width: 1600, height: 1000 });
  const importer = new ImportPage(page);
  await importer.goto(path);
  await importer.import(clone());
  return { importer, fehler };
}


async function mitte(page, name) {
  return page.evaluate((name) => {
    const e = window.fpbjs.get('elementRegistry').filter((x) => x.businessObject && x.businessObject.name === name && !x.waypoints && x.type !== 'label')[0];
    const r = document.querySelector(`[data-element-id="${e.id}"]`).getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, name);
}

/** Rename by double click and typing, as a user does */
async function umbenennen(page, alt, neu) {
  const p = await mitte(page, alt);
  await page.mouse.dblclick(p.x, p.y);
  const editor = page.locator('.djs-direct-editing-parent');
  await expect(editor).toBeVisible();
  await page.keyboard.press('Control+a');
  if (neu) {
    await page.keyboard.type(neu);
  } else {
    await page.keyboard.press('Delete');
  }
  // leave the editor by clicking an empty spot of the canvas
  await page.mouse.click(1450, 900);
  await page.waitForTimeout(250);
}

/** Text lines drawn for an element: inside the shape or in its external label */
const zeilen = (page, id) => page.evaluate((id) => {
  const e = window.fpbjs.get('elementRegistry').get(id);
  const ziel = e.label || e;
  const gfx = document.querySelector(`[data-element-id="${ziel.id}"] .djs-visual`);
  return [...gfx.querySelectorAll('text tspan')].map((t) => t.textContent);
}, id);

const idVon = (page, name) => page.evaluate((name) => window.fpbjs.get('elementRegistry')
  .filter((x) => x.businessObject && x.businessObject.name === name && !x.waypoints && x.type !== 'label')[0].id, name);

async function tooltipBeiHover(page, id) {
  const p = await page.evaluate((id) => {
    const e = window.fpbjs.get('elementRegistry').get(id);
    const r = document.querySelector(`[data-element-id="${e.id}"]`).getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, id);
  await page.mouse.move(1450, 900);
  await page.waitForTimeout(100);
  await page.mouse.move(p.x, p.y, { steps: 3 });
  await page.waitForTimeout(700);
  const text = await page.evaluate(() => {
    const t = document.querySelector('.fpb-tooltip');
    return t ? t.textContent : null;
  });
  return text;
}

test.describe('Labels inside shapes', () => {

  test('a long operator name is cut to one line with an ellipsis, the model keeps it whole', async ({ page }) => {
    const { fehler } = await laden(page);
    const id = await idVon(page, 'Erhitzen');
    await umbenennen(page, 'Erhitzen', LANG);

    expect(await page.evaluate((id) => window.fpbjs.get('elementRegistry').get(id).businessObject.name, id)).toBe(LANG);
    const z = await zeilen(page, id);
    expect(z.length).toBe(1);
    expect(z[0].endsWith('…')).toBe(true);
    expect(LANG.startsWith(z[0].slice(0, -1).trimEnd())).toBe(true);

    // the text stays within the shape
    const breite = await page.evaluate((id) => {
      const g = document.querySelector(`[data-element-id="${id}"]`);
      return { text: g.querySelector('.djs-visual text').getBBox().width, shape: window.fpbjs.get('elementRegistry').get(id).width };
    }, id);
    expect(breite.text).toBeLessThanOrEqual(breite.shape);
    expect(fehler).toEqual([]);
  });

  test('hovering a cut name shows the whole name as tooltip, leaving hides it', async ({ page }) => {
    await laden(page);
    const id = await idVon(page, 'Erhitzen');
    await umbenennen(page, 'Erhitzen', LANG);

    expect(await tooltipBeiHover(page, id)).toBe(LANG);
    await page.mouse.move(1450, 900);
    await page.waitForTimeout(150);
    expect(await page.locator('.fpb-tooltip').count()).toBe(0);
  });

  test('a short name is not cut and has no tooltip', async ({ page }) => {
    await laden(page);
    const id = await idVon(page, 'Prüfen');
    expect(await zeilen(page, id)).toEqual(['Prüfen']);
    expect(await tooltipBeiHover(page, id)).toBeNull();
  });

  test('a long name of a technical resource and of a system limit is cut as well', async ({ page }) => {
    await laden(page);
    const tr = await idVon(page, 'Heizplatte');
    const sl = await idVon(page, 'Aufheizen mit Prüfung');
    await page.evaluate(({ tr, sl, lang }) => {
      const registry = window.fpbjs.get('elementRegistry');
      window.fpbjs.get('modeling').updateLabel(registry.get(tr), 'Heizplatte ' + lang);
      window.fpbjs.get('modeling').updateLabel(registry.get(sl), 'Systemgrenze ' + lang + ' ' + lang);
    }, { tr, sl, lang: LANG });
    await page.waitForTimeout(200);

    const ztr = await zeilen(page, tr);
    expect(ztr.length).toBe(1);
    expect(ztr[0].endsWith('…')).toBe(true);
    const zsl = await zeilen(page, sl);
    expect(zsl.length).toBe(1);
    expect(zsl[0].endsWith('…')).toBe(true);
    expect(await tooltipBeiHover(page, tr)).toBe('Heizplatte ' + LANG);
  });

  test('a technical resource with the same long name is cut to one line as well', async ({ page }) => {
    await laden(page);
    const id = await idVon(page, 'Heizplatte');
    await umbenennen(page, 'Heizplatte', LANG);

    const z = await zeilen(page, id);
    expect(z.length).toBe(1);
    expect(z[0].endsWith('…')).toBe(true);
    expect(await tooltipBeiHover(page, id)).toBe(LANG);
  });

  test('the long name from the properties panel becomes the tooltip', async ({ page }) => {
    await laden(page);
    const id = await idVon(page, 'Prüfen');
    await page.click('#openPropertiesPanelButton');
    const p = await mitte(page, 'Prüfen');
    await page.mouse.click(p.x, p.y);
    const feld = page.locator('#pp_identification_longName');
    await expect(feld).toBeVisible();
    await feld.fill('Prüfen der Temperatur');
    await page.waitForTimeout(300);

    expect(await tooltipBeiHover(page, id)).toBe('Prüfen der Temperatur');

    // with a cut name the tooltip carries both
    await page.evaluate((id) => window.fpbjs.get('modeling').updateLabel(window.fpbjs.get('elementRegistry').get(id), 'Prüfen ' + 'x'.repeat(5) + ' mit einer sehr langen Beschreibung des Vorgangs'), id);
    await page.waitForTimeout(200);
    expect(await tooltipBeiHover(page, id)).toBe('Prüfen xxxxx mit einer sehr langen Beschreibung des Vorgangs\nPrüfen der Temperatur');
  });

  test('the long name from the new properties panel becomes the tooltip', async ({ page }) => {
    await laden(page, '/?panel=next');
    const id = await idVon(page, 'Prüfen');
    await page.click('#propertiesPanelToggle');
    const p = await mitte(page, 'Prüfen');
    await page.mouse.click(p.x, p.y);
    const feld = page.locator('#bio-properties-panel-longName');
    await expect(feld).toBeVisible();
    await feld.fill('Prüfen der Temperatur');
    // the panel applies input after a pause of 300 ms (debounceInput)
    await page.waitForFunction((id) => {
      const identification = window.fpbjs.get('elementRegistry').get(id).businessObject.identification;
      return identification && identification.longName === 'Prüfen der Temperatur';
    }, id);

    expect(await tooltipBeiHover(page, id)).toBe('Prüfen der Temperatur');
  });
});

test.describe('External labels of states', () => {

  test('a medium state name wraps to several lines without ellipsis and without tooltip', async ({ page }) => {
    await laden(page);
    const id = await idVon(page, 'Warmprodukt');
    const name = 'Warmes Zwischenprodukt nach Heizen';
    await umbenennen(page, 'Warmprodukt', name);

    const z = await zeilen(page, id);
    expect(z.length).toBeGreaterThan(1);
    expect(z.length).toBeLessThanOrEqual(3);
    expect(z.join(' ').replace(/\s+/g, ' ').trim()).toBe(name);
    expect(z.some((l) => l.includes('…'))).toBe(false);
  });

  test('a very long state name is cut after three lines, the tooltip shows it whole', async ({ page }) => {
    const { fehler } = await laden(page);
    const id = await idVon(page, 'Warmprodukt');
    await umbenennen(page, 'Warmprodukt', LANG);

    const z = await zeilen(page, id);
    expect(z.length).toBe(3);
    expect(z[2].endsWith('…')).toBe(true);

    const labelId = await page.evaluate((id) => window.fpbjs.get('elementRegistry').get(id).label.id, id);
    expect(await tooltipBeiHover(page, labelId)).toBe(LANG);
    expect(fehler).toEqual([]);
  });

  test('a name with a line break is drawn on two lines', async ({ page }) => {
    const { importer } = await laden(page);
    await importer.switchToChildLayer();
    const id = await page.evaluate(() => window.fpbjs.get('elementRegistry')
      .filter((x) => x.businessObject && x.businessObject.name === 'Produkt_\nVorgewärmt' && x.type !== 'label')[0].id);
    expect(await zeilen(page, id)).toEqual(['Produkt_', 'Vorgewärmt']);
  });

  test('the external label sits next to its state and moves with it', async ({ page }) => {
    await laden(page);
    const id = await idVon(page, 'Warmprodukt');
    const vorher = await page.evaluate((id) => {
      const e = window.fpbjs.get('elementRegistry').get(id);
      return { dx: e.label.x - e.x, dy: e.label.y - e.y };
    }, id);
    const p = await mitte(page, 'Warmprodukt');
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    await page.mouse.move(p.x + 30, p.y + 10, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(200);
    const nachher = await page.evaluate((id) => {
      const e = window.fpbjs.get('elementRegistry').get(id);
      return { dx: e.label.x - e.x, dy: e.label.y - e.y, moved: e.x };
    }, id);
    expect({ dx: nachher.dx, dy: nachher.dy }).toEqual(vorher);
  });
});

test.describe('Label editing', () => {

  const editorBox = (page) => page.evaluate(() => {
    const r = document.querySelector('.djs-direct-editing-parent').getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });

  // the drawn shape, without selection outline and hit area
  const elementBox = (page, id) => page.evaluate((id) => {
    const r = document.querySelector(`[data-element-id="${id}"] .djs-visual > :first-child`).getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  }, id);

  test('the editor of a process operator opens at its bottom right with the current name', async ({ page }) => {
    await laden(page);
    const id = await idVon(page, 'Erhitzen');
    const p = await mitte(page, 'Erhitzen');
    await page.mouse.dblclick(p.x, p.y);
    const editor = page.locator('.djs-direct-editing-parent');
    await expect(editor).toBeVisible();
    await expect(editor).toHaveText('Erhitzen');
    const e = await editorBox(page);
    const s = await elementBox(page, id);
    expect(Math.abs((e.x + e.width) - (s.x + s.width))).toBeLessThan(3);
    expect(Math.abs((e.y + e.height) - (s.y + s.height))).toBeLessThan(3);
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('.djs-direct-editing-parent')).textAlign)).toBe('right');
    await page.keyboard.press('Escape');
    await expect(editor).toBeHidden();
  });

  test('the editor of a technical resource opens at its bottom center', async ({ page }) => {
    await laden(page);
    const id = await idVon(page, 'Heizplatte');
    const p = await mitte(page, 'Heizplatte');
    await page.mouse.dblclick(p.x, p.y);
    const editor = page.locator('.djs-direct-editing-parent');
    await expect(editor).toBeVisible();
    await expect(editor).toHaveText('Heizplatte');
    const e = await editorBox(page);
    const s = await elementBox(page, id);
    expect(Math.abs((e.x + e.width / 2) - (s.x + s.width / 2))).toBeLessThan(3);
    expect(Math.abs((e.y + e.height) - (s.y + s.height))).toBeLessThan(3);
  });

  test('the editor of a system limit opens at its top right', async ({ page }) => {
    await laden(page);
    const id = await idVon(page, 'Aufheizen mit Prüfung');
    const s = await elementBox(page, id);
    // double click on the drawn name
    const t = await page.evaluate((id) => {
      const r = document.querySelector(`[data-element-id="${id}"] .djs-visual text`).getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }, id);
    await page.mouse.dblclick(t.x, t.y);
    const editor = page.locator('.djs-direct-editing-parent');
    await expect(editor).toBeVisible();
    await expect(editor).toHaveText('Aufheizen mit Prüfung');
    const e = await editorBox(page);
    expect(Math.abs((e.x + e.width) - (s.x + s.width))).toBeLessThan(3);
    expect(Math.abs(e.y - s.y)).toBeLessThan(3);
  });

  test('the editor of a state opens on its external label', async ({ page }) => {
    await laden(page);
    const id = await idVon(page, 'Warmprodukt');
    const p = await mitte(page, 'Warmprodukt');
    await page.mouse.dblclick(p.x, p.y);
    const editor = page.locator('.djs-direct-editing-parent');
    await expect(editor).toBeVisible();
    await expect(editor).toHaveText('Warmprodukt');
    const e = await editorBox(page);
    const label = await page.evaluate((id) => {
      const r = document.querySelector(`[data-element-id="${window.fpbjs.get('elementRegistry').get(id).label.id}"]`).getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    }, id);
    // overlaps the label
    expect(e.x).toBeLessThan(label.x + label.width);
    expect(e.x + e.width).toBeGreaterThan(label.x);
    expect(e.y).toBeLessThan(label.y + label.height);
    expect(e.y + e.height).toBeGreaterThan(label.y);
  });

  test('double clicking the external label itself edits the state', async ({ page }) => {
    await laden(page);
    const id = await idVon(page, 'Warmprodukt');
    const p = await page.evaluate((id) => {
      const r = document.querySelector(`[data-element-id="${window.fpbjs.get('elementRegistry').get(id).label.id}"]`).getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }, id);
    await page.mouse.dblclick(p.x, p.y);
    await expect(page.locator('.djs-direct-editing-parent')).toBeVisible();
    await page.keyboard.press('Control+a');
    await page.keyboard.type('Heißprodukt');
    await page.mouse.click(1450, 900);
    await page.waitForTimeout(250);
    expect(await page.evaluate((id) => window.fpbjs.get('elementRegistry').get(id).businessObject.name, id)).toBe('Heißprodukt');
  });

  test('Escape keeps the old name', async ({ page }) => {
    await laden(page);
    const id = await idVon(page, 'Prüfen');
    const p = await mitte(page, 'Prüfen');
    await page.mouse.dblclick(p.x, p.y);
    await page.keyboard.press('Control+a');
    await page.keyboard.type('Verworfen');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    expect(await page.evaluate((id) => window.fpbjs.get('elementRegistry').get(id).businessObject.name, id)).toBe('Prüfen');
  });

  test('clearing the name leaves no text drawn and undo brings the name back', async ({ page }) => {
    const { fehler } = await laden(page);
    const id = await idVon(page, 'Prüfen');
    await umbenennen(page, 'Prüfen', '');
    const name = await page.evaluate((id) => window.fpbjs.get('elementRegistry').get(id).businessObject.name, id);
    expect(name === null || name === undefined || name === '').toBe(true);
    expect(await zeilen(page, id)).toEqual([]);
    expect(await page.evaluate((id) => document.querySelectorAll(`[data-element-id="${id}"] .djs-visual text`).length, id)).toBe(0);

    await page.keyboard.press('Control+z');
    await page.waitForTimeout(200);
    expect(await zeilen(page, id)).toEqual(['Prüfen']);
    expect(fehler).toEqual([]);
  });

  test('only blanks count as clearing the name', async ({ page }) => {
    await laden(page);
    const id = await idVon(page, 'Prüfen');
    await umbenennen(page, 'Prüfen', '   ');
    expect(await zeilen(page, id)).toEqual([]);
  });

  test('a rename is taken back by undo and repeated by redo, including the tooltip', async ({ page }) => {
    await laden(page);
    const id = await idVon(page, 'Erhitzen');
    await umbenennen(page, 'Erhitzen', LANG);
    const umbenannt = await zeilen(page, id);
    expect(umbenannt.join('').endsWith('…')).toBe(true);

    await page.keyboard.press('Control+z');
    await page.waitForTimeout(200);
    expect(await zeilen(page, id)).toEqual(['Erhitzen']);
    expect(await tooltipBeiHover(page, id)).toBeNull();

    await page.keyboard.press('Control+y');
    await page.waitForTimeout(200);
    expect(await zeilen(page, id)).toEqual(umbenannt);
    expect(await tooltipBeiHover(page, id)).toBe(LANG);
  });

  test('while the editor is open the drawn name is hidden, Escape shows it again', async ({ page }) => {
    await laden(page);
    const id = await idVon(page, 'Prüfen');
    const anzeige = () => page.evaluate((id) => getComputedStyle(document.querySelector(`[data-element-id="${id}"] .djs-visual text`)).display, id);
    expect(await anzeige()).not.toBe('none');

    const p = await mitte(page, 'Prüfen');
    await page.mouse.dblclick(p.x, p.y);
    await expect(page.locator('.djs-direct-editing-parent')).toBeVisible();
    expect(await anzeige()).toBe('none');

    await page.keyboard.press('Escape');
    await expect(page.locator('.djs-direct-editing-parent')).toBeHidden();
    expect(await anzeige()).not.toBe('none');
    expect(await zeilen(page, id)).toEqual(['Prüfen']);
  });

  test('scrolling the canvas while typing keeps the typed name', async ({ page }) => {
    await laden(page);
    const id = await idVon(page, 'Prüfen');
    const p = await mitte(page, 'Prüfen');
    await page.mouse.dblclick(p.x, p.y);
    await expect(page.locator('.djs-direct-editing-parent')).toBeVisible();
    await page.keyboard.press('Control+a');
    await page.keyboard.type('Kontrolle');

    await page.mouse.move(700, 500);
    await page.mouse.wheel(0, 200);
    await page.waitForTimeout(250);

    await expect(page.locator('.djs-direct-editing-parent')).toBeHidden();
    expect(await page.evaluate((id) => window.fpbjs.get('elementRegistry').get(id).businessObject.name, id)).toBe('Kontrolle');
    expect(await zeilen(page, id)).toEqual(['Kontrolle']);
  });

  test('the editor follows the zoom', async ({ page }) => {
    await laden(page);
    const id = await idVon(page, 'Erhitzen');
    await page.evaluate(() => window.fpbjs.get('canvas').zoom(1.5));
    await page.waitForTimeout(150);
    const s = await elementBox(page, id);
    await page.mouse.dblclick(s.x + s.width / 2, s.y + s.height / 2);
    await expect(page.locator('.djs-direct-editing-parent')).toBeVisible();
    const e = await editorBox(page);
    const fontSize = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.djs-direct-editing-parent')).fontSize));
    expect(Math.abs((e.x + e.width) - (s.x + s.width))).toBeLessThan(3);
    // editor box (70 x 30 at zoom 1) and font grow with the zoom
    expect(e.width).toBeCloseTo(70 * 1.5, 0);
    expect(fontSize).toBeGreaterThan(12);
  });
});

test.describe('Label of a new state', () => {

  /** diagram coordinates -> screen coordinates of the page */
  const nachBildschirm = (page, p) => page.evaluate((p) => {
    const vb = window.fpbjs.get('canvas').viewbox();
    const r = document.querySelector('.djs-container svg').getBoundingClientRect();
    return { x: r.x + (p.x - vb.x) * vb.scale, y: r.y + (p.y - vb.y) * vb.scale };
  }, p);

  const zustand = (page, id) => page.evaluate((id) => {
    const e = window.fpbjs.get('elementRegistry').get(id);
    const l = e.label;
    return {
      name: e.businessObject.name,
      state: { x: e.x, y: e.y, width: e.width, height: e.height },
      label: l ? { x: l.x, y: l.y, width: l.width, height: l.height } : null,
      labelImRegister: !!window.fpbjs.get('elementRegistry').get(id + '_label'),
    };
  }, id);

  // the label sits above left of its state, its lower right corner on the upper left corner of the state
  const ecke = (z) => ({
    dx: Math.abs(z.label.x + z.label.width - z.state.x),
    dy: Math.abs(z.label.y + z.label.height - z.state.y),
  });

  test('naming a state from the palette creates its label, which grows with the name and goes with it', async ({ page }) => {
    const { fehler } = await laden(page);
    // a free spot in the left part of the system limit
    const ziel = await nachBildschirm(page, { x: 600, y: 300 });
    await page.locator('.djs-palette .entry[data-action="fpb-product"]').click();
    await page.mouse.move(ziel.x, ziel.y, { steps: 4 });
    await page.mouse.click(ziel.x, ziel.y);
    await page.waitForTimeout(300);
    const id = await page.evaluate(() => window.fpbjs.get('selection').get()[0].id);
    const neu = await zustand(page, id);
    expect(neu.name == null || neu.name === '').toBe(true);
    expect(neu.label).toBeNull();

    // the editor opens where the label will be: above the state, reaching over its left edge
    const s = await page.evaluate((id) => {
      const r = document.querySelector(`[data-element-id="${id}"] .djs-visual > :first-child`).getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    }, id);
    await page.mouse.dblclick(s.x + s.width / 2, s.y + s.height / 2);
    const editor = page.locator('.djs-direct-editing-parent');
    await expect(editor).toBeVisible();
    await expect(editor).toHaveText('');
    const e = await page.evaluate(() => {
      const r = document.querySelector('.djs-direct-editing-parent').getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    });
    expect(e.y + e.height).toBeLessThanOrEqual(s.y + 2);
    expect(e.x).toBeLessThan(s.x);
    expect(e.x + e.width).toBeGreaterThan(s.x);

    await page.keyboard.type('Neuer Zustand');
    await page.mouse.click(1450, 900);
    await page.waitForTimeout(250);
    const benannt = await zustand(page, id);
    expect(benannt.name).toBe('Neuer Zustand');
    expect(benannt.label).not.toBeNull();
    expect(ecke(benannt).dx).toBeLessThanOrEqual(1);
    expect(ecke(benannt).dy).toBeLessThanOrEqual(1);
    expect(await zeilen(page, id)).toEqual(['Neuer Zustand']);

    // a longer name wraps and the label grows upwards, the corner stays
    const lang = 'Neuer Zustand mit einem langen Namen';
    await umbenennen(page, 'Neuer Zustand', lang);
    const laenger = await zustand(page, id);
    expect(laenger.label.height).toBeGreaterThan(benannt.label.height);
    expect(ecke(laenger).dx).toBeLessThanOrEqual(1);
    expect(ecke(laenger).dy).toBeLessThanOrEqual(1);
    expect((await zeilen(page, id)).join(' ').replace(/\s+/g, ' ').trim()).toBe(lang);

    // clearing the name removes the label, undo brings it back as it was
    await umbenennen(page, lang, '');
    const leer = await zustand(page, id);
    expect(leer.label).toBeNull();
    expect(leer.labelImRegister).toBe(false);

    await page.keyboard.press('Control+z');
    await page.waitForTimeout(200);
    expect(await zustand(page, id)).toEqual(laenger);
    expect(fehler).toEqual([]);
  });
});
