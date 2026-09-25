/**
 * Which tabs of this site are open right now, so a tab offers only the
 * backups of tabs that are gone (closed, reloaded, crashed) and never the
 * backup of a model that is still open elsewhere.
 *
 * Every page load is a new tab id. With Web Locks each tab holds a lock
 * named after its id for as long as the page lives; the browser releases it
 * on close, reload and crash, so the answer is exact. Without Web Locks a
 * heartbeat in localStorage stands in: removed when the page hides, stale
 * after HEARTBEAT_STALE when the page died without saying so.
 */

const HEARTBEAT_EVERY = 5000;
const HEARTBEAT_STALE = 15000;

export function createTabPresence(name) {
  const id = newId();

  if (typeof navigator !== 'undefined' && navigator.locks && navigator.locks.request) {
    return new LockPresence(name, id);
  }
  return new HeartbeatPresence(name, id);
}

function newId() {
  const random = Math.random().toString(36).slice(2, 10);
  return Date.now().toString(36) + '-' + random;
}


function LockPresence(name, id) {
  this.id = id;
  this._prefix = name + '.tab.';
  this._release = null;
}

/** Resolves once this tab holds its lock */
LockPresence.prototype.start = function () {
  return new Promise((resolve) => {
    navigator.locks.request(this._prefix + this.id, () => {
      resolve();
      // held until stop() or the page goes away
      return new Promise((release) => { this._release = release; });
    });
  });
};

/** Ids of the tabs that are open now (including this one) */
LockPresence.prototype.aliveIds = function () {
  return navigator.locks.query().then((state) => {
    const prefix = this._prefix;
    return new Set((state.held || [])
      .map((lock) => lock.name)
      .filter((lockName) => lockName && lockName.indexOf(prefix) === 0)
      .map((lockName) => lockName.slice(prefix.length)));
  });
};

LockPresence.prototype.stop = function () {
  if (this._release) {
    this._release();
    this._release = null;
  }
};


function HeartbeatPresence(name, id) {
  this.id = id;
  this._prefix = name + '.alive.';
  this._timer = null;
  this._onHide = () => this._remove();
}

HeartbeatPresence.prototype._beat = function () {
  try {
    window.localStorage.setItem(this._prefix + this.id, String(Date.now()));
  } catch (error) {
    // without storage there is no backup either
  }
};

HeartbeatPresence.prototype._remove = function () {
  try {
    window.localStorage.removeItem(this._prefix + this.id);
  } catch (error) {
    // see _beat
  }
};

HeartbeatPresence.prototype.start = function () {
  this._beat();
  this._timer = setInterval(() => this._beat(), HEARTBEAT_EVERY);
  window.addEventListener('pagehide', this._onHide);
  return Promise.resolve();
};

HeartbeatPresence.prototype.aliveIds = function () {
  const alive = new Set([this.id]);
  const now = Date.now();
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key && key.indexOf(this._prefix) === 0) {
        const at = Number(window.localStorage.getItem(key));
        if (now - at < HEARTBEAT_STALE) {
          alive.add(key.slice(this._prefix.length));
        }
      }
    }
  } catch (error) {
    // treat the others as gone
  }
  return Promise.resolve(alive);
};

HeartbeatPresence.prototype.stop = function () {
  clearInterval(this._timer);
  window.removeEventListener('pagehide', this._onHide);
  this._remove();
};
