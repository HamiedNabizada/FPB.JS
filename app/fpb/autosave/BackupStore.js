/**
 * Where the browser backups live: one record per tab,
 * { id, savedAt, title, model }.
 *
 * IndexedDB when the browser has it (room for many large models), else
 * localStorage (about 5 MB for the whole site). Both stay in the browser.
 * All methods return promises.
 */
export function createBackupStore(name) {
  if (typeof indexedDB !== 'undefined' && indexedDB) {
    return new IndexedDbStore(name);
  }
  return new LocalStorageStore(name);
}

const STORE = 'backups';

function IndexedDbStore(name) {
  this._name = name;
  this._db = null;
}

IndexedDbStore.prototype._open = function () {
  if (!this._db) {
    this._db = new Promise((resolve, reject) => {
      const request = indexedDB.open(this._name, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore(STORE, { keyPath: 'id' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('IndexedDB is blocked'));
    });
    // a failed open may succeed later (e.g. after a blocked upgrade)
    this._db.catch(() => { this._db = null; });
  }
  return this._db;
};

IndexedDbStore.prototype._run = function (mode, work) {
  return this._open().then((db) => new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, mode);
    const result = work(transaction.objectStore(STORE));
    transaction.oncomplete = () => resolve(result && 'result' in result ? result.result : undefined);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error || new Error('IndexedDB transaction aborted'));
  }));
};

IndexedDbStore.prototype.list = function () {
  return this._run('readonly', (store) => store.getAll()).then((records) => records || []);
};

IndexedDbStore.prototype.get = function (id) {
  return this._run('readonly', (store) => store.get(id));
};

IndexedDbStore.prototype.put = function (record) {
  return this._run('readwrite', (store) => { store.put(record); });
};

IndexedDbStore.prototype.remove = function (id) {
  return this._run('readwrite', (store) => { store.delete(id); });
};


function LocalStorageStore(name) {
  this._prefix = name + '.backup.';
}

LocalStorageStore.prototype._keys = function () {
  const keys = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (key && key.indexOf(this._prefix) === 0) {
      keys.push(key);
    }
  }
  return keys;
};

LocalStorageStore.prototype.list = function () {
  return Promise.resolve().then(() => this._keys()
    .map((key) => parse(window.localStorage.getItem(key)))
    .filter(Boolean));
};

LocalStorageStore.prototype.get = function (id) {
  return Promise.resolve().then(() => parse(window.localStorage.getItem(this._prefix + id)));
};

LocalStorageStore.prototype.put = function (record) {
  return Promise.resolve().then(() => {
    window.localStorage.setItem(this._prefix + record.id, JSON.stringify(record));
  });
};

LocalStorageStore.prototype.remove = function (id) {
  return Promise.resolve().then(() => {
    window.localStorage.removeItem(this._prefix + id);
  });
};

function parse(raw) {
  try {
    const record = raw && JSON.parse(raw);
    return record && record.id && Array.isArray(record.model) ? record : null;
  } catch (error) {
    return null;
  }
}

/** In-memory store with the same interface, for tests */
export function createMemoryStore() {
  const records = new Map();
  return {
    records,
    list: () => Promise.resolve([...records.values()]),
    get: (id) => Promise.resolve(records.get(id)),
    put: (record) => Promise.resolve(void records.set(record.id, record)),
    remove: (id) => Promise.resolve(void records.delete(id))
  };
}
