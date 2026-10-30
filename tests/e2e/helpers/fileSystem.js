// tests/e2e/helpers/fileSystem.js

/**
 * File System Access in the tests (016e D2): Chromium has the real pickers,
 * but a test cannot answer them. installFakeFileSystem puts pickers and file
 * handles in their place that work on window.__fs:
 *
 * - files: name → text of the files the "disk" holds
 * - writes: [{ name, text }] in the order they were written
 * - pickers: [{ kind: 'open'|'save', suggestedName, extensions }]
 * - next: the answer of the next picker, a file name or 'abort'
 * - permission: what requestPermission answers ('granted' or 'denied')
 * - asked: how often a page asked for permission
 *
 * A file chosen in the save picker may be written at once, one chosen in the
 * open picker or dropped asks first, as in Chrome.
 */
export async function installFakeFileSystem(page, { files = {} } = {}) {
  await page.addInitScript((initial) => {
    const fs = window.__fs = {
      files: Object.assign({}, initial),
      writes: [],
      pickers: [],
      next: null,
      permission: 'granted',
      asked: 0,
      granted: {}
    };

    const handle = (name) => ({
      kind: 'file',
      name,
      async getFile() {
        return new File([fs.files[name] || ''], name);
      },
      async queryPermission() {
        return fs.granted[name] ? 'granted' : 'prompt';
      },
      async requestPermission() {
        fs.asked++;
        if (fs.permission === 'granted') {
          fs.granted[name] = true;
        }
        return fs.permission;
      },
      async createWritable() {
        if (!fs.granted[name]) {
          throw new DOMException('Permission denied', 'NotAllowedError');
        }
        const parts = [];
        return {
          async write(data) {
            parts.push(data);
          },
          async close() {
            const text = await new Blob(parts).text();
            fs.files[name] = text;
            fs.writes.push({ name, text });
          }
        };
      }
    });
    fs.handle = handle;

    const pick = (kind, options = {}) => {
      fs.pickers.push({
        kind,
        suggestedName: options.suggestedName || null,
        extensions: (options.types || []).map((type) => Object.values(type.accept).flat())
      });
      const next = fs.next;
      fs.next = null;
      if (!next || next === 'abort') {
        return Promise.reject(new DOMException('The user aborted a request.', 'AbortError'));
      }
      if (kind === 'save') {
        fs.granted[next] = true;
      }
      return Promise.resolve(handle(next));
    };

    window.showSaveFilePicker = (options) => pick('save', options);
    window.showOpenFilePicker = (options) => pick('open', options).then((h) => [h]);
    DataTransferItem.prototype.getAsFileSystemHandle = function () {
      const file = this.getAsFile();
      return Promise.resolve(file ? handle(file.name) : null);
    };
  }, files);
}

/** A browser without File System Access, as Firefox and Safari */
export async function withoutFileSystem(page) {
  await page.addInitScript(() => {
    window.showSaveFilePicker = undefined;
    window.showOpenFilePicker = undefined;
  });
}

export const fileSystem = (page) => page.evaluate(() => {
  const fs = window.__fs;
  return { files: fs.files, writes: fs.writes, pickers: fs.pickers, asked: fs.asked };
});

/** The answer of the next picker: a file name, or 'abort' */
export const nextPick = (page, answer) => page.evaluate((answer) => {
  window.__fs.next = answer;
}, answer);
