// tests/unit/autosave/fallbacks.test.js
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

import { createTabPresence } from '../../../app/fpb/autosave/TabPresence.js';
import { createBackupStore } from '../../../app/fpb/autosave/BackupStore.js';

/**
 * Die Ausweichwege für Browser ohne Web Locks bzw. ohne IndexedDB. Chromium
 * hat beides, die E2E-Tests erreichen diese Wege daher nie.
 */
describe('Ausweichwege der Sicherung', () => {

  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('Anwesenheit per Herzschlag (ohne Web Locks)', () => {

    beforeEach(() => {
      vi.stubGlobal('navigator', {});
    });

    it('jeder Seitenaufruf ist ein neuer Tab, der sich als lebendig meldet', async () => {
      const a = createTabPresence('fpbjs.autosave');
      const b = createTabPresence('fpbjs.autosave');
      expect(a.id).not.toBe(b.id);

      await a.start();
      await b.start();
      const lebendig = await a.aliveIds();
      expect(lebendig.has(a.id)).toBe(true);
      expect(lebendig.has(b.id)).toBe(true);
      a.stop();
      b.stop();
    });

    it('ein beendeter oder verstummter Tab gilt als weg', async () => {
      const a = createTabPresence('fpbjs.autosave');
      const b = createTabPresence('fpbjs.autosave');
      await a.start();
      await b.start();

      b.stop();
      window.localStorage.setItem('fpbjs.autosave.alive.verstummt', String(Date.now() - 60000));

      const lebendig = await a.aliveIds();
      expect(lebendig.has(b.id)).toBe(false);
      expect(lebendig.has('verstummt')).toBe(false);
      a.stop();
    });

    it('beim Verlassen der Seite meldet sich der Tab ab', async () => {
      const a = createTabPresence('fpbjs.autosave');
      await a.start();
      window.dispatchEvent(new Event('pagehide'));

      expect(window.localStorage.getItem('fpbjs.autosave.alive.' + a.id)).toBeNull();
      a.stop();
    });
  });

  describe('Speicher im localStorage (ohne IndexedDB)', () => {

    beforeEach(() => {
      vi.stubGlobal('indexedDB', undefined);
    });

    it('legt ab, liest, listet und löscht Sicherungen', async () => {
      const store = createBackupStore('fpbjs.autosave');
      await store.put({ id: 'a', savedAt: 'x', title: 'A', model: [{ a: 1 }] });
      await store.put({ id: 'b', savedAt: 'y', title: 'B', model: [{ b: 1 }] });
      // fremde und kaputte Einträge stören nicht
      window.localStorage.setItem('anderes', '1');
      window.localStorage.setItem('fpbjs.autosave.backup.kaputt', '{nein');

      expect((await store.get('a')).model).toEqual([{ a: 1 }]);
      expect((await store.list()).map((r) => r.id).sort()).toEqual(['a', 'b']);

      await store.remove('a');
      expect(await store.get('a')).toBeNull();
      expect((await store.list()).map((r) => r.id)).toEqual(['b']);
    });
  });
});
