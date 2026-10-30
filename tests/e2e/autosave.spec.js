// tests/e2e/autosave.spec.js
import { test, expect } from './support/test';
import { ImportPage } from './pages/ImportPage';
import basis from './fixtures/temperieren.json';

/**
 * Sicherung im Browser in der Web-App, mit echter IndexedDB und echten
 * Web Locks: eine Sicherung je Tab, angeboten werden nur Sicherungen von
 * Tabs, die nicht mehr offen sind.
 */

const clone = () => JSON.parse(JSON.stringify(basis));

/** Alle Sicherungen in der IndexedDB der Seite */
const sicherungen = (page) => page.evaluate(() => new Promise((resolve, reject) => {
  const request = indexedDB.open('fpbjs.autosave', 1);
  request.onupgradeneeded = () => request.result.createObjectStore('backups', { keyPath: 'id' });
  request.onerror = () => reject(request.error);
  request.onsuccess = () => {
    const db = request.result;
    const all = db.transaction('backups', 'readonly').objectStore('backups').getAll();
    all.onsuccess = () => { db.close(); resolve(all.result); };
  };
}));
const tabId = (page) => page.evaluate(() => window.fpbjs.get('autosave')._id);
const bereit = (page) => page.evaluate(() => window.fpbjs.get('autosave').ready());
const sichern = (page) => page.evaluate(() => window.fpbjs.get('autosave').flush());
const namen = (page) => page.evaluate(() => window.fpbjs.get('elementRegistry')
  .filter((e) => e.businessObject && e.businessObject.name && e.type !== 'label')
  .map((e) => e.businessObject.name).sort());
const ungespeichert = (page) => page.evaluate(() => window.fpbjs.get('autosave').isDirty());
const verlassenWarnt = (page) => page.evaluate(() => {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
});

/** Einen Namen umbenennen, ein normaler Befehl */
const umbenennen = (page, von, nach) => page.evaluate(([von, nach]) => {
  const registry = window.fpbjs.get('elementRegistry');
  const element = registry.filter((e) => e.businessObject && e.businessObject.name === von && e.type !== 'label')[0];
  window.fpbjs.get('modeling').updateLabel(element, nach);
}, [von, nach]);

async function laden(page) {
  const importer = new ImportPage(page);
  await importer.goto();
  await bereit(page);
  await importer.import(clone());
  return importer;
}

async function oeffnen(page) {
  await page.goto('/');
  await page.waitForFunction(() => window.fpbjs && window.fpbjs.get);
  await bereit(page);
}

async function neuLaden(page) {
  await page.reload();
  await page.waitForFunction(() => window.fpbjs && window.fpbjs.get);
  await bereit(page);
}

const hinweis = (page) => page.locator('[data-id="autosave.pending"]');

/** Der Browser gibt das Schloss eines geschlossenen Tabs nicht sofort frei, unter Last erst nach Sekunden */
const schlossFrei = (page, id) => expect.poll(() => page.evaluate((id) => navigator.locks.query()
  .then((state) => state.held.some((lock) => lock.name.endsWith('.tab.' + id))), id), { timeout: 20000 }).toBe(false);

test.describe('Sicherung im Browser', () => {

  test('ein importiertes Modell braucht keine Sicherung, eine Änderung schon', async ({ page }) => {
    await laden(page);
    await sichern(page);

    expect(await ungespeichert(page)).toBe(false);
    expect(await verlassenWarnt(page)).toBe(false);
    expect(await sicherungen(page)).toEqual([]);

    await umbenennen(page, 'Erhitzen', 'Erwärmen');
    await sichern(page);
    const liste = await sicherungen(page);
    expect(liste).toHaveLength(1);
    expect(liste[0].id).toBe(await tabId(page));
    expect(liste[0].title).toBe('Aufheizen mit Prüfung');
    expect(JSON.stringify(liste[0].model)).toContain('Erwärmen');
    expect(await verlassenWarnt(page)).toBe(true);
  });

  test('ein Ebenenwechsel ist keine Änderung', async ({ page }) => {
    await laden(page);

    await page.evaluate(() => {
      const fpb = window.fpbjs;
      const operator = fpb.get('elementRegistry').filter((e) => e.businessObject && e.businessObject.decomposedView)[0];
      fpb.get('modeling').switchProcess(operator.businessObject.decomposedView);
    });
    await sichern(page);

    expect(await ungespeichert(page)).toBe(false);
  });

  test('nach dem Neuladen wird die Sicherung angeboten und lässt sich wiederherstellen', async ({ page }) => {
    await laden(page);
    await umbenennen(page, 'Erhitzen', 'Erwärmen');
    await sichern(page);

    await neuLaden(page);

    await expect(hinweis(page)).toBeVisible();
    await expect(hinweis(page)).toContainText('Unsaved model found');
    await expect(hinweis(page)).toContainText('Aufheizen mit Prüfung');
    expect(await namen(page)).toEqual([]);

    await hinweis(page).getByRole('button', { name: 'Restore Aufheizen mit Prüfung' }).click();
    await expect(hinweis(page)).toHaveCount(0);
    await expect.poll(() => namen(page)).toContain('Erwärmen');
    expect(await ungespeichert(page)).toBe(true);

    // die Sicherung gehört jetzt diesem Tab, keine zweite liegt herum
    await sichern(page);
    const liste = await sicherungen(page);
    expect(liste.map((s) => s.id)).toEqual([await tabId(page)]);
  });

  test('zwei offene Tabs überschreiben sich nicht und bieten sich gegenseitig nichts an', async ({ context }) => {
    // vier Seiten mit Import: im vollen Lauf reichten 60 s nicht immer
    test.slow();
    const a = await context.newPage();
    const b = await context.newPage();
    await laden(a);
    await laden(b);

    await umbenennen(a, 'Erhitzen', 'Modell A');
    await umbenennen(b, 'Erhitzen', 'Modell B');
    await sichern(a);
    await sichern(b);

    const liste = await sicherungen(a);
    expect(liste).toHaveLength(2);
    const inhalt = Object.fromEntries(liste.map((s) => [s.id, JSON.stringify(s.model)]));
    expect(inhalt[await tabId(a)]).toContain('Modell A');
    expect(inhalt[await tabId(b)]).toContain('Modell B');

    // ein dritter Tab sieht nichts: beide sind noch offen
    const c = await context.newPage();
    await oeffnen(c);
    await c.waitForTimeout(300);
    await expect(hinweis(c)).toHaveCount(0);

    // B wird geschlossen: jetzt bietet ein neuer Tab dessen Modell an, nicht das von A
    const idB = await tabId(b);
    await b.close();
    await schlossFrei(a, idB);
    const d = await context.newPage();
    await oeffnen(d);
    await expect(hinweis(d)).toBeVisible();
    await expect(hinweis(d).locator('.fpb-notification-items li')).toHaveCount(1);
    await hinweis(d).getByRole('button', { name: /^Restore/ }).click();
    await expect.poll(() => namen(d)).toContain('Modell B');
  });

  test('mit eigener ungespeicherter Arbeit öffnet eine Sicherung in einem neuen Tab', async ({ context }) => {
    const alt = await context.newPage();
    await laden(alt);
    await umbenennen(alt, 'Erhitzen', 'Aus dem alten Tab');
    await sichern(alt);
    const idAlt = await tabId(alt);
    await alt.close();

    const page = await context.newPage();
    await oeffnen(page);
    await schlossFrei(page, idAlt);
    await neuLaden(page);
    await new ImportPage(page).import(clone());
    await umbenennen(page, 'Prüfen', 'Eigene Arbeit');
    await sichern(page);

    await expect(hinweis(page)).toBeVisible();
    const [neu] = await Promise.all([
      context.waitForEvent('page'),
      hinweis(page).getByRole('button', { name: /in a new tab/ }).click(),
    ]);
    // a new tab loads the whole development bundle, slow under a full run
    await neu.waitForFunction(() => window.fpbjs && window.fpbjs.get, null, { timeout: 30000 });
    await expect.poll(() => namen(neu)).toContain('Aus dem alten Tab');
    expect(neu.url()).not.toContain('fpbRestore');

    // der eigene Tab bleibt, wie er war
    expect(await namen(page)).toContain('Eigene Arbeit');
    await expect(hinweis(page)).toHaveCount(0);
  });

  test('Verwerfen lässt die Zeichenfläche leer und die Sicherung ist weg', async ({ page }) => {
    await laden(page);
    await umbenennen(page, 'Erhitzen', 'Erwärmen');
    await sichern(page);

    await neuLaden(page);
    await hinweis(page).getByRole('button', { name: /^Discard/ }).click();

    await expect(hinweis(page)).toHaveCount(0);
    await expect.poll(async () => (await sicherungen(page)).length).toBe(0);
    expect(await namen(page)).toEqual([]);
  });

  // B11
  test('eine Sicherung, die sich nicht laden lässt, bleibt angeboten; der nächste Import ist ein gewöhnlicher', async ({ page }) => {
    await oeffnen(page);
    // Sicherung eines geschlossenen Tabs, deren Inhalt der Importer ablehnt
    await page.evaluate(() => new Promise((resolve, reject) => {
      const request = indexedDB.open('fpbjs.autosave', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('backups', { keyPath: 'id' });
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('backups', 'readwrite');
        tx.objectStore('backups').put({ id: 'tab-weg', savedAt: '2026-10-01T10:00:00Z', title: 'Kaputt', model: [{ kein: 'Projekt' }] });
        tx.oncomplete = () => { db.close(); resolve(); };
      };
    }));
    await neuLaden(page);

    await hinweis(page).getByRole('button', { name: 'Restore Kaputt' }).click();
    await expect(hinweis(page).getByRole('button', { name: 'Restore Kaputt' })).toBeVisible();

    const importer = new ImportPage(page);
    await importer.import(clone());
    await expect.poll(() => namen(page)).toContain('Erhitzen');
    expect(await ungespeichert(page)).toBe(false);
    expect((await sicherungen(page)).map((s) => s.id)).toContain('tab-weg');
  });

  test('wer vor dem Speichern die Seite verlässt, verliert nichts', async ({ page }) => {
    await laden(page);
    // sofort weg, bevor die verzögerte Sicherung läuft
    await umbenennen(page, 'Erhitzen', 'Kurz vor Schluss');
    await page.goto('about:blank');

    await oeffnen(page);
    await expect(hinweis(page)).toBeVisible();
    await hinweis(page).getByRole('button', { name: /^Restore/ }).click();
    await expect.poll(() => namen(page)).toContain('Kurz vor Schluss');
  });

  test('New model fragt bei ungespeicherten Änderungen, leert alles und lässt neu modellieren', async ({ page }) => {
    await laden(page);
    await umbenennen(page, 'Erhitzen', 'Erwärmen');
    await sichern(page);

    await page.locator('#newModelButton').click();
    // a question is an alertdialog since the final review of 016e D1
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toContainText('Start a new model?');
    await dialog.locator('[data-answer="confirm"]').click();

    await expect(dialog).toHaveCount(0);
    expect(await namen(page)).toEqual([]);
    await expect.poll(async () => (await sicherungen(page)).length).toBe(0);
    expect(await ungespeichert(page)).toBe(false);
    await expect(page.locator('#openLayerButton')).toHaveCount(0);

    // Neu anfangen: das erste Element legt wieder ein Projekt an
    const modell = await page.evaluate(() => {
      const fpb = window.fpbjs;
      const modeling = fpb.get('modeling');
      const limit = modeling.createShape({ type: 'fpb:SystemLimit' }, { x: 400, y: 300 }, fpb.get('canvas').getRootElement());
      modeling.createShape({ type: 'fpb:ProcessOperator' }, { x: 400, y: 300 }, limit);
      fpb.get('eventBus').fire('dataStore.updateAll', {});
      return {
        prozesse: fpb.getProcesses().filter((p) => p.process).length,
        projekt: Boolean(fpb.getProjectDefinition()),
      };
    });
    expect(modell).toEqual({ prozesse: 1, projekt: true });
    await sichern(page);
    expect(await sicherungen(page)).toHaveLength(1);
  });

  test('ohne Änderungen startet New model ohne Rückfrage', async ({ page }) => {
    await laden(page);

    await page.locator('#newModelButton').click();

    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    expect(await namen(page)).toEqual([]);
  });

  test('nach einem Import ohne Änderung bietet das Neuladen nichts an', async ({ page }) => {
    await laden(page);
    await sichern(page);

    await neuLaden(page);
    await page.waitForTimeout(300);
    await expect(hinweis(page)).toHaveCount(0);
  });

  test('Rückgängig bis zum Dateistand entfernt die Sicherung wieder', async ({ page }) => {
    await laden(page);
    await umbenennen(page, 'Erhitzen', 'Erwärmen');
    await sichern(page);
    expect(await sicherungen(page)).toHaveLength(1);

    await page.evaluate(() => window.fpbjs.get('commandStack').undo());
    await sichern(page);
    expect(await ungespeichert(page)).toBe(false);
    expect(await sicherungen(page)).toEqual([]);
  });

  test('ein Download des ganzen Modells gilt als gespeichert', async ({ page }) => {
    await laden(page);
    await umbenennen(page, 'Erhitzen', 'Erwärmen');
    await sichern(page);
    expect(await ungespeichert(page)).toBe(true);

    await page.evaluate(() => window.fpbjs.get('eventBus').fire('model.downloaded', { format: 'json' }));
    await sichern(page);
    expect(await ungespeichert(page)).toBe(false);
    expect(await verlassenWarnt(page)).toBe(false);
    expect(await sicherungen(page)).toEqual([]);
  });

  // Abschlussprüfung 016e D1: das Angebot kam mit jedem autosave.changed wieder
  test('ein geschlossenes Angebot bleibt zu, auch wenn danach etwas bearbeitet wird', async ({ page }) => {
    await laden(page);
    await umbenennen(page, 'Erhitzen', 'Erwärmen');
    await sichern(page);
    await neuLaden(page);

    await expect(hinweis(page)).toBeVisible();
    await hinweis(page).getByRole('button', { name: 'Dismiss' }).click();
    await expect(hinweis(page)).toHaveCount(0);

    // eigene Arbeit in diesem Tab: der Zustand "ungespeichert" wechselt
    const importer = new ImportPage(page);
    await importer.import(clone());
    await umbenennen(page, 'Erhitzen', 'Aufwärmen');
    await expect.poll(() => ungespeichert(page)).toBe(true);
    await page.waitForTimeout(300);
    await expect(hinweis(page)).toHaveCount(0);
  });

  test('verweigert der Browser die Sicherung, sagt eine Warnung das', async ({ page }) => {
    await laden(page);
    await page.evaluate(() => window.fpbjs.get('eventBus').fire('autosave.failed', { error: new Error('quota') }));
    const warnung = page.locator('[data-id="autosave.failed"]');
    await expect(warnung).toHaveClass(/fpb-notification--warning/);
    await expect(warnung).toContainText('This browser could not keep a backup of your model.');
  });
});
