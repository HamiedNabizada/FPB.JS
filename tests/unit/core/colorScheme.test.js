// tests/unit/core/colorScheme.test.js
import { describe, it, expect, afterEach } from 'vitest';

import { SCHEMES, colors, getScheme, setScheme } from '../../../app/fpb/core/colorScheme.js';

/**
 * Prüft das Farbschema für Farbfehlsichtigkeit an dem, worauf es ankommt:
 * Bleiben die Elementfarben unterscheidbar, wenn man sie durch die drei
 * häufigen Formen der Farbfehlsichtigkeit schickt?
 *
 * Gerechnet wird in CIE Lab, simuliert mit den üblichen linearen Näherungen
 * (Viénot/Brettel). Ein Abstand unter etwa 25 gilt als leicht verwechselbar.
 * Das Standardschema von VDI 3682 liegt bei 18, das zugängliche bei 30; beides
 * hält dieser Test fest, damit der Grund für das zweite Schema dokumentiert
 * bleibt.
 */

const MATRIZEN = {
  normal: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
  protanopie: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deuteranopie: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]],
  tritanopie: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.303900]],
};

const zuLinear = (c) => (c /= 255) <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
const zuSrgb = (c) => {
  const v = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(v * 255)));
};
const alsRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

function simuliere(hex, art) {
  const [r, g, b] = alsRgb(hex).map(zuLinear);
  const m = MATRIZEN[art];
  return [0, 1, 2].map((i) => zuSrgb(m[i][0] * r + m[i][1] * g + m[i][2] * b));
}

function lab(rgb) {
  const [r, g, b] = rgb.map(zuLinear);
  let x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  let y = (0.2126 * r + 0.7152 * g + 0.0722 * b);
  let z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  [x, y, z] = [f(x), f(y), f(z)];
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

const abstand = (a, b) => {
  const [A, B] = [lab(a), lab(b)];
  return Math.sqrt((A[0] - B[0]) ** 2 + (A[1] - B[1]) ** 2 + (A[2] - B[2]) ** 2);
};

/** Kleinster Abstand zweier Elementfarben über alle vier Sehweisen */
function kleinsterAbstand(schema) {
  const werte = Object.keys(schema)
    .filter((schluessel) => schluessel !== 'FPB_STROKE')
    .map((schluessel) => schema[schluessel]);
  let kleinster = Infinity;

  Object.keys(MATRIZEN).forEach((art) => {
    for (let i = 0; i < werte.length; i++) {
      for (let j = i + 1; j < werte.length; j++) {
        kleinster = Math.min(kleinster, abstand(simuliere(werte[i], art), simuliere(werte[j], art)));
      }
    }
  });
  return kleinster;
}

describe('Farbschema', () => {

  afterEach(() => {
    setScheme('standard');
  });

  it('die Farben von VDI 3682 fallen bei Farbfehlsichtigkeit zusammen', () => {
    // der Grund für das zweite Schema, hier als Messwert festgehalten
    expect(kleinsterAbstand(SCHEMES.standard)).toBeLessThan(25);
  });

  it('das zugängliche Schema hält alle Typen auseinander', () => {
    expect(kleinsterAbstand(SCHEMES.accessible)).toBeGreaterThanOrEqual(30);
  });

  it('behält die Farbfamilien, damit die Bedeutung erkennbar bleibt', () => {
    const roter = (hex) => alsRgb(hex)[0] > alsRgb(hex)[2];
    expect(roter(SCHEMES.accessible.FPB_PRODUCT)).toBe(true);
    // Energie und Information bleiben blau
    expect(alsRgb(SCHEMES.accessible.FPB_ENERGY)[2]).toBeGreaterThan(alsRgb(SCHEMES.accessible.FPB_ENERGY)[0]);
    expect(alsRgb(SCHEMES.accessible.FPB_INFORMATION)[2]).toBeGreaterThan(alsRgb(SCHEMES.accessible.FPB_INFORMATION)[0]);
    // der Operator bleibt grün
    const operator = alsRgb(SCHEMES.accessible.FPB_PROCESS_OPERATOR);
    expect(operator[1]).toBeGreaterThan(operator[0]);
    expect(operator[1]).toBeGreaterThan(operator[2]);
  });

  it('die Kontur bleibt in beiden Schemas schwarz', () => {
    expect(SCHEMES.accessible.FPB_STROKE).toBe(SCHEMES.standard.FPB_STROKE);
  });

  it('schaltet um und meldet, ob sich etwas geändert hat', () => {
    expect(getScheme()).toBe('standard');
    expect(colors().FPB_PRODUCT).toBe(SCHEMES.standard.FPB_PRODUCT);

    expect(setScheme('accessible')).toBe(true);
    expect(getScheme()).toBe('accessible');
    expect(colors().FPB_PRODUCT).toBe(SCHEMES.accessible.FPB_PRODUCT);

    expect(setScheme('accessible')).toBe(false);
  });

  it('fällt bei einem unbekannten Namen auf den Standard zurück', () => {
    setScheme('accessible');
    setScheme('gibtsnicht');
    expect(getScheme()).toBe('standard');
  });
});
