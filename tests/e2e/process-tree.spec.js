// tests/e2e/process-tree.spec.js
import { test, expect } from './support/test';
import { ImportPage } from './pages/ImportPage';
import basis from './fixtures/temperieren.json';

/**
 * E2E tests for the process tree in the layer panel (ProcessTreeView,
 * utils/treeUtils, hooks/useProcessManagement) and for the information
 * dialog (InfoModal, constants/keyboardShortcuts).
 *
 * The fixture has two layers: the root (shown with the project name
 * "FPBJS_Project") and the decomposition of "Erhitzen". Tree nodes show the
 * name of the decomposed operator, cut after 25 characters. The tree follows
 * layer switches made on the canvas as well (context pad of the system limit).
 */

const clone = () => JSON.parse(JSON.stringify(basis));

const ROOT = '55b4780e-6896-4e92-b184-858cf0cb5b32';
const CHILD = '9ca400c0-a373-48c0-9f13-37ce196cee29';

async function laden(page) {
  const fehler = [];
  page.on('pageerror', (e) => fehler.push(e.message));
  await page.setViewportSize({ width: 1600, height: 1000 });
  const importer = new ImportPage(page);
  await importer.goto();
  await importer.import(clone());
  return { importer, fehler };
}

async function baumOeffnen(page) {
  await page.locator('#openLayerButton').click();
  await expect(page.locator('#openLayerButton')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('.arborist-tree-container')).toBeVisible();
}

const knoten = (page, name) => page.locator('.arborist-node-content', { hasText: name });
const sichtbareKnoten = (page) => page.locator('.arborist-node-content').allTextContents();
const ebene = (page) => page.evaluate(() => window.fpbjs.get('canvas').getRootElement().id);

test.describe('Process tree', () => {

  test('with a single layer there is no tree button', async ({ page }) => {
    const importer = new ImportPage(page);
    await importer.goto();
    await expect(page.locator('#openLayerButton')).toHaveCount(0);
  });

  test('opens with the root expanded and the current layer marked', async ({ page }) => {
    const { fehler } = await laden(page);
    await expect(page.locator('#openLayerButton')).toHaveAttribute('aria-label', 'Show layers');
    await baumOeffnen(page);
    await expect(page.locator('#openLayerButton')).toHaveAttribute('aria-label', 'Hide layers');

    expect(await sichtbareKnoten(page)).toEqual(['FPBJS_Project', 'Erhitzen']);
    await expect(knoten(page, 'FPBJS_Project')).toHaveAttribute('aria-current', 'true');
    await expect(knoten(page, 'Erhitzen')).not.toHaveAttribute('aria-current', 'true');
    await expect(page.getByRole('button', { name: 'Collapse FPBJS_Project' })).toHaveAttribute('aria-expanded', 'true');
    expect(fehler).toEqual([]);
  });

  test('clicking a node switches the layer, clicking the root switches back', async ({ page }) => {
    const { fehler } = await laden(page);
    await baumOeffnen(page);
    expect(await ebene(page)).toBe(ROOT);

    await knoten(page, 'Erhitzen').click();
    await page.waitForTimeout(300);
    expect(await ebene(page)).toBe(CHILD);
    await expect(knoten(page, 'Erhitzen')).toHaveAttribute('aria-current', 'true');
    await expect(knoten(page, 'FPBJS_Project')).not.toHaveAttribute('aria-current', 'true');
    // the canvas shows the elements of the child layer
    expect(await page.evaluate(() => window.fpbjs.get('elementRegistry').filter((e) => e.businessObject && e.businessObject.name === 'Vorwärmen').length)).toBe(1);

    await knoten(page, 'FPBJS_Project').click();
    await page.waitForTimeout(300);
    expect(await ebene(page)).toBe(ROOT);
    await expect(knoten(page, 'FPBJS_Project')).toHaveAttribute('aria-current', 'true');
    expect(fehler).toEqual([]);
  });

  test('the nodes work by keyboard: Enter switches, Space on the toggle folds', async ({ page }) => {
    await laden(page);
    await baumOeffnen(page);

    await knoten(page, 'Erhitzen').focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    expect(await ebene(page)).toBe(CHILD);

    const toggle = page.getByRole('button', { name: 'Collapse FPBJS_Project' });
    await toggle.focus();
    await page.keyboard.press(' ');
    await expect(page.getByRole('button', { name: 'Expand FPBJS_Project' })).toHaveAttribute('aria-expanded', 'false');
    expect(await sichtbareKnoten(page)).toEqual(['FPBJS_Project']);

    await page.getByRole('button', { name: 'Expand FPBJS_Project' }).focus();
    await page.keyboard.press('Enter');
    expect(await sichtbareKnoten(page)).toEqual(['FPBJS_Project', 'Erhitzen']);

    await knoten(page, 'FPBJS_Project').focus();
    await page.keyboard.press(' ');
    await page.waitForTimeout(300);
    expect(await ebene(page)).toBe(ROOT);
  });

  test('collapsing and expanding by mouse does not switch the layer', async ({ page }) => {
    await laden(page);
    await baumOeffnen(page);
    await page.getByRole('button', { name: 'Collapse FPBJS_Project' }).click();
    expect(await sichtbareKnoten(page)).toEqual(['FPBJS_Project']);
    await expect(page.getByRole('button', { name: 'Expand FPBJS_Project' })).toHaveText('+');
    await page.getByRole('button', { name: 'Expand FPBJS_Project' }).click();
    expect(await sichtbareKnoten(page)).toEqual(['FPBJS_Project', 'Erhitzen']);
    expect(await ebene(page)).toBe(ROOT);
  });

  test('the search field filters the nodes', async ({ page }) => {
    await laden(page);
    await baumOeffnen(page);
    const suche = page.getByPlaceholder('Search processes...');
    await suche.fill('erh');
    await page.waitForTimeout(200);
    expect(await sichtbareKnoten(page)).toContain('Erhitzen');

    await suche.fill('gibt es nicht');
    await page.waitForTimeout(200);
    expect(await sichtbareKnoten(page)).toEqual([]);

    await suche.fill('');
    await page.waitForTimeout(200);
    expect(await sichtbareKnoten(page)).toEqual(['FPBJS_Project', 'Erhitzen']);
  });

  test('a rename on the canvas shows up in the tree, a long name is cut after 25 characters', async ({ page }) => {
    await laden(page);
    await baumOeffnen(page);

    const p = await page.evaluate(() => {
      const e = window.fpbjs.get('elementRegistry').filter((x) => x.businessObject && x.businessObject.name === 'Erhitzen' && x.type !== 'label')[0];
      const r = document.querySelector(`[data-element-id="${e.id}"]`).getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    await page.mouse.dblclick(p.x, p.y);
    await expect(page.locator('.djs-direct-editing-parent')).toBeVisible();
    await page.keyboard.press('Control+a');
    await page.keyboard.type('Aufheizen');
    await page.mouse.click(1300, 900);
    await page.waitForTimeout(300);
    expect(await sichtbareKnoten(page)).toEqual(['FPBJS_Project', 'Aufheizen']);

    const lang = 'Aufheizen auf Zieltemperatur und Halten';
    await page.evaluate((lang) => {
      const e = window.fpbjs.get('elementRegistry').filter((x) => x.businessObject && x.businessObject.decomposedView)[0];
      window.fpbjs.get('modeling').updateLabel(e, lang);
    }, lang);
    await page.waitForTimeout(300);
    expect(await sichtbareKnoten(page)).toEqual(['FPBJS_Project', lang.substring(0, 25) + '...']);

    // undo of the rename reaches the tree as well
    await page.evaluate(() => window.fpbjs.get('commandStack').undo());
    await page.waitForTimeout(300);
    expect(await sichtbareKnoten(page)).toEqual(['FPBJS_Project', 'Aufheizen']);
  });

  test('a further decomposition adds a third level below its parent', async ({ page }) => {
    const { importer, fehler } = await laden(page);
    await importer.switchToChildLayer();
    await page.evaluate(() => {
      const op = window.fpbjs.get('elementRegistry').filter((x) => x.businessObject && x.businessObject.name === 'Vorwärmen' && x.type !== 'label')[0];
      window.fpbjs.get('modeling').decomposeProcessOperator(op);
    });
    await page.waitForTimeout(500);
    const enkel = await ebene(page);
    expect([ROOT, CHILD]).not.toContain(enkel);

    await baumOeffnen(page);
    // the path to the current layer is open and the new layer is marked
    expect(await sichtbareKnoten(page)).toEqual(['FPBJS_Project', 'Erhitzen', 'Vorwärmen']);
    await expect(knoten(page, 'Vorwärmen')).toHaveAttribute('aria-current', 'true');
    // indentation grows with the depth
    const einzug = await page.evaluate(() => [...document.querySelectorAll('.arborist-node')].map((n) => parseFloat(getComputedStyle(n).paddingLeft) || 0));
    expect(einzug[2]).toBeGreaterThan(einzug[1]);
    expect(einzug[1]).toBeGreaterThan(einzug[0]);

    await knoten(page, 'FPBJS_Project').click();
    await page.waitForTimeout(300);
    expect(await ebene(page)).toBe(ROOT);
    await knoten(page, 'Vorwärmen').click();
    await page.waitForTimeout(300);
    expect(await ebene(page)).toBe(enkel);

    // folding the middle level hides the grandchild
    await page.getByRole('button', { name: 'Collapse Erhitzen' }).click();
    expect(await sichtbareKnoten(page)).toEqual(['FPBJS_Project', 'Erhitzen']);
    expect(fehler).toEqual([]);
  });

  test('switching up from the canvas moves the mark in the open tree', async ({ page }) => {
    const { fehler } = await laden(page);
    await baumOeffnen(page);
    await knoten(page, 'Erhitzen').click();
    await page.waitForTimeout(300);
    await expect(knoten(page, 'Erhitzen')).toHaveAttribute('aria-current', 'true');

    // context pad of the system limit on the child layer: "Switch to parent process"
    const name = await page.evaluate(() => {
      const sl = window.fpbjs.get('elementRegistry').filter((e) => e.type === 'fpb:SystemLimit')[0];
      return document.querySelector(`[data-element-id="${sl.id}"] .djs-visual text`).getBoundingClientRect().toJSON();
    });
    await page.mouse.click(name.x + name.width / 2, name.y + name.height / 2);
    const eintrag = page.locator('.djs-context-pad .entry[data-action="compose"]');
    await expect(eintrag).toBeVisible();
    await eintrag.click();
    await page.waitForTimeout(300);

    expect(await ebene(page)).toBe(ROOT);
    await expect(knoten(page, 'FPBJS_Project')).toHaveAttribute('aria-current', 'true');
    await expect(knoten(page, 'Erhitzen')).not.toHaveAttribute('aria-current', 'true');
    expect(fehler).toEqual([]);
  });

  test('a decomposition made while the tree is open shows the new layer marked', async ({ page }) => {
    await laden(page);
    await baumOeffnen(page);
    await knoten(page, 'Erhitzen').click();
    await page.waitForTimeout(300);

    const p = await page.evaluate(() => {
      const e = window.fpbjs.get('elementRegistry').filter((x) => x.businessObject && x.businessObject.name === 'Vorwärmen' && x.type !== 'label')[0];
      const r = document.querySelector(`[data-element-id="${e.id}"]`).getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    await page.mouse.click(p.x, p.y);
    await page.locator('.djs-context-pad .entry[data-action="decompose"]').click();
    await page.waitForTimeout(500);
    expect([ROOT, CHILD]).not.toContain(await ebene(page));

    // as when the tree is opened after the decomposition (see above)
    expect(await sichtbareKnoten(page)).toEqual(['FPBJS_Project', 'Erhitzen', 'Vorwärmen']);
    await expect(knoten(page, 'Vorwärmen')).toHaveAttribute('aria-current', 'true');
  });

  test('a decomposed operator without a name is listed as unnamed', async ({ page }) => {
    await laden(page);
    await page.evaluate(() => {
      const e = window.fpbjs.get('elementRegistry').filter((x) => x.businessObject && x.businessObject.decomposedView)[0];
      window.fpbjs.get('modeling').updateLabel(e, null);
    });
    await page.waitForTimeout(300);
    await baumOeffnen(page);
    expect(await sichtbareKnoten(page)).toEqual(['FPBJS_Project', 'unnamed']);
  });

  test('importing the model again lists every layer once', async ({ page }) => {
    const { importer } = await laden(page);
    await importer.import(clone());
    await baumOeffnen(page);
    expect(await sichtbareKnoten(page)).toEqual(['FPBJS_Project', 'Erhitzen']);
  });

  test('closing the overview hides the tree', async ({ page }) => {
    await laden(page);
    await baumOeffnen(page);
    await page.locator('#openLayerButton').click();
    await expect(page.locator('#openLayerButton')).toHaveAttribute('aria-expanded', 'false');
    await page.waitForTimeout(600);
    const hoehe = await page.evaluate(() => {
      const c = document.querySelector('.layerPanel-ProcessOverview-Content');
      return c ? c.getBoundingClientRect().height : 0;
    });
    expect(hoehe).toBe(0);
  });
});

test.describe('Information dialog', () => {

  const oeffnen = async (page) => {
    await page.getByRole('button', { name: 'Show information and help' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('FPB.js Information');
    return dialog;
  };

  test('opens on About and closes by its button', async ({ page }) => {
    await laden(page);
    const dialog = await oeffnen(page);
    await expect(dialog).toContainText('VDI/VDE 3682');
    await dialog.locator('.modal-header button').click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('Escape closes the dialog', async ({ page }) => {
    await laden(page);
    await oeffnen(page);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('the shortcut tab lists every alignment shortcut the editor reacts to', async ({ page }) => {
    await laden(page);
    const dialog = await oeffnen(page);
    await dialog.getByRole('tab', { name: 'Keyboard Shortcuts' }).click().catch(async () => {
      await dialog.getByText('Keyboard Shortcuts', { exact: true }).click();
    });
    await expect(dialog).toContainText('Available Keyboard Shortcuts');
    const tabelle = await dialog.locator('.tab-pane.active tbody tr').evaluateAll((rows) => rows.map((r) => ({
      keys: [...r.querySelectorAll('.badge')].map((b) => b.textContent.trim()),
      text: r.cells[1].textContent.trim(),
    })));
    const dienst = await page.evaluate(() => window.fpbjs.get('keyboardAlignService').getShortcuts());
    const erwartet = [...dienst.Alignment, ...dienst.Distribution];
    erwartet.forEach((s) => {
      const zeile = tabelle.find((z) => z.keys.includes(s.keys[0]));
      expect(zeile, s.keys[0]).toBeTruthy();
      expect(zeile.text.startsWith(s.description)).toBe(true);
    });
    // and the basic ones
    ['Ctrl+Z', 'Ctrl+A', 'Ctrl+F', 'Delete', 'H', 'L', 'S'].forEach((k) => {
      expect(tabelle.some((z) => z.keys.includes(k)), k).toBe(true);
    });
  });

  test('the help tab links to the issue tracker in a new tab', async ({ page }) => {
    await laden(page);
    const dialog = await oeffnen(page);
    await dialog.getByText('Help', { exact: true }).click();
    const link = dialog.getByRole('link', { name: 'GitHub Issues' });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', /github\.com\/.+\/issues/);
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', /noopener/);

    // the chosen tab is kept when the dialog is opened again
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const wieder = await oeffnen(page);
    await expect(wieder.getByRole('link', { name: 'GitHub Issues' })).toBeVisible();
  });

  test('the dialog is readable in dark mode', async ({ page }) => {
    await laden(page);
    await page.locator('.layerPanel button[aria-label="Switch to Dark Mode"]').click();
    const dialog = await oeffnen(page);
    const farben = await dialog.locator('.modal-content').evaluate((el) => ({
      bg: getComputedStyle(el).backgroundColor,
      fg: getComputedStyle(el.querySelector('h5')).color,
    }));
    expect(farben.bg).not.toBe('rgb(255, 255, 255)');
    expect(farben.fg).not.toBe(farben.bg);
  });
});
