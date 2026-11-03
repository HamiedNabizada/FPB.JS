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
 * - readOnly: name → true for files whose writing is refused
 * - hold() and release(): writes wait in between, to change the model meanwhile
 * - next = 'deny': the next picker is refused by the browser
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
      granted: {},
      // a time per file, as the disk keeps it: changed by every write
      modified: {},
      clock: 1000,
      // files no permission lets FPB.js write
      readOnly: {},
      // while set, every write waits for release() before it ends
      gate: null,
      waiting: 0
    };
    fs.touch = (name) => {
      fs.modified[name] = ++fs.clock;
    };
    fs.hold = () => {
      fs.gate = new Promise((resolve) => {
        fs.release = () => {
          fs.gate = null;
          resolve();
        };
      });
    };
    Object.keys(fs.files).forEach(fs.touch);

    const handle = (name) => ({
      kind: 'file',
      name,
      async getFile() {
        return new File([fs.files[name] || ''], name, { lastModified: fs.modified[name] || 1 });
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
        if (!fs.granted[name] || fs.readOnly[name]) {
          throw new DOMException('Permission denied', 'NotAllowedError');
        }
        const parts = [];
        return {
          async write(data) {
            parts.push(data);
          },
          async close() {
            if (fs.gate) {
              fs.waiting++;
              await fs.gate;
              fs.waiting--;
            }
            const text = await new Blob(parts).text();
            fs.files[name] = text;
            fs.touch(name);
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
      // the browser refuses its picker (a frame, a policy)
      if (next === 'deny') {
        return Promise.reject(new DOMException('The picker is not allowed here.', 'SecurityError'));
      }
      if (kind === 'save') {
        fs.granted[next] = true;
      }
      return Promise.resolve(handle(next));
    };

    window.showSaveFilePicker = (options) => pick('save', options);
    window.showOpenFilePicker = (options) => pick('open', options).then((h) => [h]);
    // a dropped file and its handle are the same file on the disk
    DataTransferItem.prototype.getAsFileSystemHandle = function () {
      const file = this.getAsFile();
      if (file) {
        fs.modified[file.name] = file.lastModified;
      }
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

/** Another program writes a file on the disk */
export const changeOnDisk = (page, name, text) => page.evaluate(({ name, text }) => {
  window.__fs.files[name] = text;
  window.__fs.touch(name);
}, { name, text });

/** The answer of the next picker: a file name, or 'abort' */
export const nextPick = (page, answer) => page.evaluate((answer) => {
  window.__fs.next = answer;
}, answer);
