// tests/unit/export/PdfExporter.test.js
import { describe, it, expect } from 'vitest';
import zlib from 'node:zlib';

import { exportPDF } from '../../../app/fpb/export/PdfExporter.js';

/**
 * Testrunde 2026-11-07: ein PDF mit zwei Ebenen wog 13,9 MB, weil jsPDF die
 * Bildpunkte ungepackt ablegte. Ein Diagramm ist fast nur Weiß, gepackt wird
 * es klein.
 */

/** A PNG (RGBA) as data URL: white, with a black line across */
function png(width, height) {
  const chunk = (type, data) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(body) >>> 0);
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA, as a canvas gives it
  const rows = [];
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(1 + width * 4, 255);
    row[0] = 0; // no filter
    if (y === height / 2) {
      for (let x = 0; x < width; x++) row.fill(0, 1 + x * 4, 1 + x * 4 + 3);
    }
    rows.push(row);
  }
  const file = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  return 'data:image/png;base64,' + file.toString('base64');
}

describe('PdfExporter', () => {
  it('packt das Bild: ein weißes Diagramm wiegt nur einen Bruchteil seiner Bildpunkte', () => {
    const width = 1200;
    const height = 800;

    const blob = exportPDF(png(width, height), { title: 'Ebene' });

    // ungepackt allein die Farben: 1200 * 800 * 3 Byte = 2,8 MB
    expect(blob.size).toBeLessThan(width * height * 3 / 20);
  });
});
