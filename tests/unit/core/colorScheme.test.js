// tests/unit/core/colorScheme.test.js
import { describe, it, expect, afterEach } from 'vitest';

import { SCHEMES, colors, getScheme, setScheme } from '../../../app/fpb/core/colorScheme.js';

/**
 * Prüft das Farbschema für Farbfehlsichtigkeit an dem, worauf es ankommt:
 * Bleiben die Elementfarben unterscheidbar, wenn man sie durch die drei
 * häufigen Formen der Farbfehlsichtigkeit schickt?
 *
 * Simuliert wird mit den Matrizen von Machado u.a. in der stärksten
 * Ausprägung, gemessen wird mit CIEDE2000 (der einfache Lab-Abstand CIE76
 * überschätzt gesättigte Farben deutlich).
 *
 * Der Rot-Grün-Fall ist der entscheidende: Produkt gegen Prozessoperator liegt
 * im Standardschema bei ΔE00 7,9 und ΔL* 4, also praktisch gleich. Im
 * zugänglichen Schema sind es 26,7 bei ΔL* 33, der Unterschied trägt damit
 * auch ohne jede Farbwahrnehmung. Beides hält dieser Test fest.
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

/** CIEDE2000 */
function abstand(a, b) {
  const [L1, a1, b1] = lab(a);
  const [L2, a2, b2] = lab(b);
  const rad = Math.PI / 180, deg = 180 / Math.PI;
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2);
  const Cb = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7)));
  const a1p = (1 + G) * a1, a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
  const h1p = (Math.atan2(b1, a1p) * deg + 360) % 360;
  const h2p = (Math.atan2(b2, a2p) * deg + 360) % 360;
  const dLp = L2 - L1, dCp = C2p - C1p;
  let dhp = 0;
  if (C1p * C2p !== 0) {
    dhp = h2p - h1p;
    if (dhp > 180) dhp -= 360; else if (dhp < -180) dhp += 360;
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * rad);
  const Lbp = (L1 + L2) / 2, Cbp = (C1p + C2p) / 2;
  let hbp = h1p + h2p;
  if (C1p * C2p !== 0) {
    hbp = Math.abs(h1p - h2p) > 180 ? (hbp + 360) / 2 : hbp / 2;
  }
  const T = 1 - 0.17 * Math.cos((hbp - 30) * rad) + 0.24 * Math.cos(2 * hbp * rad)
    + 0.32 * Math.cos((3 * hbp + 6) * rad) - 0.20 * Math.cos((4 * hbp - 63) * rad);
  const dTheta = 30 * Math.exp(-(((hbp - 275) / 25) ** 2));
  const Rc = 2 * Math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7));
  const Sl = 1 + (0.015 * (Lbp - 50) ** 2) / Math.sqrt(20 + (Lbp - 50) ** 2);
  const Sc = 1 + 0.045 * Cbp, Sh = 1 + 0.015 * Cbp * T;
  const Rt = -Math.sin(2 * dTheta * rad) * Rc;
  return Math.sqrt((dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2 + Rt * (dCp / Sc) * (dHp / Sh));
}

/** Helligkeitsunterschied, trägt auch ohne jede Farbwahrnehmung */
const helligkeitsUnterschied = (a, b) => Math.abs(lab(a)[0] - lab(b)[0]);

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
    expect(kleinsterAbstand(SCHEMES.standard)).toBeLessThan(12);
  });

  it('das zugängliche Schema hält alle Typen auseinander', () => {
    expect(kleinsterAbstand(SCHEMES.accessible)).toBeGreaterThanOrEqual(15);
  });

  it('trennt Produkt und Operator bei Rot-Grün-Schwäche, auch in der Helligkeit', () => {
    const paar = (schema, art) => [
      simuliere(schema.FPB_PRODUCT, art),
      simuliere(schema.FPB_PROCESS_OPERATOR, art)
    ];

    ['protanopie', 'deuteranopie'].forEach((art) => {
      const [standardA, standardB] = paar(SCHEMES.standard, art);
      const [neuA, neuB] = paar(SCHEMES.accessible, art);

      expect(abstand(neuA, neuB)).toBeGreaterThan(abstand(standardA, standardB));
      expect(abstand(neuA, neuB)).toBeGreaterThan(20);
      // der Unterschied liegt auch in der Helligkeit, trägt also ohne Farbe
      expect(helligkeitsUnterschied(neuA, neuB)).toBeGreaterThan(25);
    });

    // im Standardschema war genau das der Schwachpunkt
    const [altA, altB] = paar(SCHEMES.standard, 'deuteranopie');
    expect(helligkeitsUnterschied(altA, altB)).toBeLessThan(10);
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
