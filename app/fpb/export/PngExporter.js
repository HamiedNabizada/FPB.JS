/**
 * PNG Exporter - Converts SVG string to PNG data URL via Canvas API.
 * No external dependencies required.
 */

/**
 * Convert an SVG string to a PNG data URL.
 *
 * @param {string} svgString - The SVG markup to convert
 * @param {Object} [options]
 * @param {number} [options.scale=2] - Scale factor (2 = retina quality)
 * @param {string} [options.backgroundColor='#ffffff'] - Background fill color
 * @returns {Promise<string>} PNG as data URL (data:image/png;base64,...)
 */
export async function exportPNG(svgString, options = {}) {
  const { scale = 2, backgroundColor = '#ffffff' } = options;

  // 1. Create an Image from the SVG
  const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);

  const img = new Image();

  const loadPromise = new Promise((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Failed to load SVG as image'));
    img.src = url;
  });

  try {
    await loadPromise;

    // 2. Draw onto a scaled canvas
    const canvas = document.createElement('canvas');
    canvas.width = img.width * scale;
    canvas.height = img.height * scale;

    const ctx = canvas.getContext('2d');
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0);

    // 3. Export as PNG data URL
    return canvas.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
}
