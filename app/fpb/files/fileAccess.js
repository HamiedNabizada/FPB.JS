/**
 * Getting files out of the browser (016e D2).
 */

/**
 * Starts a download. The link goes on the page itself, not into a panel:
 * a host without layer panel downloads too.
 *
 * @param {string|Blob|Uint8Array} data
 * @param {string} fileName
 * @param {string} mime
 */
export function downloadFile(data, fileName, mime) {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.style.display = 'none';
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
    // after the browser has taken the file
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
