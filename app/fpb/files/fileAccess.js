/**
 * Getting files out of the browser (016e D2): downloads, and in Chrome and
 * Edge the File System Access API, which writes into a file the user chose.
 */

/**
 * Can FPB.js write into a file the user chose? Only with the pickers of the
 * File System Access API and only in the top window: in a frame the browser
 * refuses them or the host does not expect them (016e T8). Asked at the time
 * of the call, not once at start.
 */
export function canWriteFiles(win = window) {
  try {
    return typeof win.showSaveFilePicker === 'function' && win.top === win;
  } catch (error) {
    // a foreign frame does not even let us look at the top
    return false;
  }
}

/** A file to open, chosen by the user; null when the user cancels */
export function pickFileToOpen(types) {
  return window.showOpenFilePicker({ types, multiple: false }).then(
    (handles) => handles[0] || null,
    cancelled
  );
}

/** A place to save, chosen by the user; null when the user cancels */
export function pickFileToSave(suggestedName, types) {
  return window.showSaveFilePicker({ suggestedName, types, excludeAcceptAllOption: true }).then(
    (handle) => handle,
    cancelled
  );
}

function cancelled(error) {
  if (error && error.name === 'AbortError') {
    return null;
  }
  throw error;
}

/**
 * Writes into a chosen file. A file the user opened was granted for reading
 * only: the browser asks once whether FPB.js may write to it. Rejects with
 * an error named NotAllowedError when that is refused.
 */
export async function writeFile(handle, data) {
  const mode = { mode: 'readwrite' };
  let permission = handle.queryPermission ? await handle.queryPermission(mode) : 'granted';
  if (permission !== 'granted' && handle.requestPermission) {
    permission = await handle.requestPermission(mode);
  }
  if (permission !== 'granted') {
    const error = new Error('Writing to ' + handle.name + ' was not allowed');
    error.name = 'NotAllowedError';
    throw error;
  }
  const writable = await handle.createWritable();
  await writable.write(data instanceof Blob ? data : new Blob([data]));
  await writable.close();
}

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
