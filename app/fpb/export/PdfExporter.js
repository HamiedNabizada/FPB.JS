/**
 * PDF Exporter - Converts PNG data URLs to PDF documents via jsPDF.
 * Supports single-page and multi-layer (multi-page) export.
 */

import { jsPDF } from 'jspdf';

const PAGE_MARGIN = 10; // mm
const TITLE_HEIGHT = 12; // mm reserved for title text

/**
 * Export a single PNG image as a one-page PDF.
 *
 * @param {string} pngDataUrl - PNG as data URL
 * @param {Object} [options]
 * @param {string} [options.orientation='landscape'] - 'landscape' or 'portrait'
 * @param {string} [options.format='a4'] - Page format ('a4', 'a3', 'letter')
 * @param {string} [options.title='FPB Diagram'] - Title shown on the page
 * @returns {Blob} PDF as Blob
 */
export function exportPDF(pngDataUrl, options = {}) {
  const {
    orientation = 'landscape',
    format = 'a4',
    title = 'FPB Diagram'
  } = options;

  const pdf = new jsPDF({ orientation, unit: 'mm', format });

  pdf.setProperties({
    title,
    creator: 'FPB.JS',
    subject: 'VDI 3682 Formalized Process Description'
  });

  addImagePage(pdf, pngDataUrl, title);

  return pdf.output('blob');
}

/**
 * Export multiple layers as a multi-page PDF (one page per layer).
 *
 * @param {{ name: string, pngDataUrl: string }[]} layers - Array of layer images
 * @param {Object} [options]
 * @param {string} [options.orientation='landscape']
 * @param {string} [options.format='a4']
 * @param {string} [options.title='FPB Diagram'] - Document title (metadata only)
 * @returns {Blob} PDF as Blob
 */
export function exportMultiLayerPDF(layers, options = {}) {
  const {
    orientation = 'landscape',
    format = 'a4',
    title = 'FPB Diagram'
  } = options;

  const pdf = new jsPDF({ orientation, unit: 'mm', format });

  pdf.setProperties({
    title,
    creator: 'FPB.JS',
    subject: 'VDI 3682 Formalized Process Description'
  });

  layers.forEach((layer, index) => {
    if (index > 0) {
      pdf.addPage();
    }
    addImagePage(pdf, layer.pngDataUrl, layer.name);
  });

  return pdf.output('blob');
}

/**
 * Add a PNG image to the current PDF page, scaled to fit with a title.
 */
function addImagePage(pdf, pngDataUrl, title) {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  // Title
  pdf.setFontSize(14);
  pdf.text(title, pageWidth / 2, PAGE_MARGIN, { align: 'center' });

  // Available area for the image
  const availableWidth = pageWidth - 2 * PAGE_MARGIN;
  const availableHeight = pageHeight - PAGE_MARGIN - TITLE_HEIGHT - PAGE_MARGIN;

  // Get image dimensions and scale proportionally
  const imgProps = pdf.getImageProperties(pngDataUrl);
  const ratio = Math.min(
    availableWidth / imgProps.width,
    availableHeight / imgProps.height
  );

  const imgWidth = imgProps.width * ratio;
  const imgHeight = imgProps.height * ratio;

  // Center horizontally, place below title
  const x = (pageWidth - imgWidth) / 2;
  const y = PAGE_MARGIN + TITLE_HEIGHT;

  pdf.addImage(pngDataUrl, 'PNG', x, y, imgWidth, imgHeight);
}
