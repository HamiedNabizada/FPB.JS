import { isCmd, isKey } from 'diagram-js/lib/features/keyboard/KeyboardUtil';
import { collectEntries, findEntries } from './SearchIndex';
import { collectProcessShapes } from '../help/processShapes';

const MAX_RESULTS = 50;

/**
 * Search over all layers (Ctrl/Cmd+F on the canvas, or open()).
 *
 * The diagram-js search pad only finds elements on the canvas and restores the
 * root element with setRootElement when closed, which does not fit the layer
 * switch of FPB.JS. This search reads all layers, shows the layer of each hit
 * and switches there on selection. It reuses the search pad's markup and styles.
 */
export default function FpbSearch(eventBus, canvas, keyboard, selection, elementRegistry, modeling, fpbjs) {
  this._eventBus = eventBus;
  this._canvas = canvas;
  this._selection = selection;
  this._elementRegistry = elementRegistry;
  this._modeling = modeling;
  this._fpbjs = fpbjs;
  this._results = [];
  this._active = -1;

  const self = this;

  this._build();

  keyboard.addListener(function (context) {
    const event = context.keyEvent;
    if (isCmd(event) && isKey(['f', 'F'], event)) {
      self.open();
      return true;
    }
  });
}

FpbSearch.$inject = ['eventBus', 'canvas', 'keyboard', 'selection', 'elementRegistry', 'modeling', 'fpbjs'];

FpbSearch.prototype._build = function () {
  const container = this._container = document.createElement('div');
  container.className = 'djs-search-container fpb-search';
  container.innerHTML =
    '<div class="djs-search-input"><input type="text" placeholder="Search all layers" aria-label="Search all layers" /></div>' +
    '<div class="djs-search-results" role="listbox"></div>';
  this._input = container.querySelector('input');
  this._resultsNode = container.querySelector('.djs-search-results');
  this._canvas.getContainer().appendChild(container);

  const self = this;
  this._input.addEventListener('input', function () {
    self._search(self._input.value);
  });
  this._input.addEventListener('keydown', function (event) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      self._move(event.key === 'ArrowDown' ? 1 : -1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (self._results[self._active]) {
        self._choose(self._results[self._active]);
      }
    } else if (event.key === 'Escape') {
      event.preventDefault();
      self.close();
    }
  });
  this._resultsNode.addEventListener('mousedown', function (event) {
    // mousedown, not click: the input must not lose focus before the choice
    const node = event.target.closest('.djs-search-result');
    if (node) {
      event.preventDefault();
      self._choose(self._results[Number(node.getAttribute('data-index'))]);
    }
  });
  this._input.addEventListener('blur', function () {
    self.close();
  });
};

FpbSearch.prototype.isOpen = function () {
  return !!this._container && this._container.classList.contains('open');
};

FpbSearch.prototype.open = function () {
  if (!this._container) {
    return;
  }
  this._entries = collectEntries(collectProcessShapes(this._fpbjs.getProjectDefinition()));
  this._container.classList.add('open');
  this._input.value = '';
  this._search('');
  this._input.focus();
  this._eventBus.fire('fpbSearch.opened');
};

FpbSearch.prototype.close = function () {
  if (!this.isOpen()) {
    return;
  }
  this._container.classList.remove('open');
  this._results = [];
  this._resultsNode.innerHTML = '';
  this._eventBus.fire('fpbSearch.closed');
};

FpbSearch.prototype._search = function (pattern) {
  this._pattern = pattern;
  this._results = findEntries(this._entries || [], pattern, this._canvas.getRootElement()).slice(0, MAX_RESULTS);
  this._active = this._results.length ? 0 : -1;
  this._render();
};

FpbSearch.prototype._move = function (step) {
  if (!this._results.length) {
    return;
  }
  this._active = (this._active + step + this._results.length) % this._results.length;
  this._render();
  const node = this._resultsNode.querySelector('.djs-search-result-selected');
  if (node && node.scrollIntoView) {
    node.scrollIntoView({ block: 'nearest' });
  }
};

FpbSearch.prototype._render = function () {
  const self = this;
  this._resultsNode.innerHTML = '';
  if (this._pattern && this._pattern.trim() && !this._results.length) {
    const empty = document.createElement('div');
    empty.className = 'djs-search-result fpb-search-empty';
    empty.textContent = 'No element found';
    this._resultsNode.appendChild(empty);
    return;
  }
  this._results.forEach(function (entry, index) {
    const node = document.createElement('div');
    node.className = 'djs-search-result' + (index === self._active ? ' djs-search-result-selected' : '');
    node.setAttribute('data-index', String(index));
    node.setAttribute('role', 'option');

    const primary = document.createElement('div');
    primary.className = 'djs-search-result-primary';
    appendHighlighted(primary, entry.name || entry.id, self._pattern);

    const secondary = document.createElement('div');
    secondary.className = 'djs-search-result-secondary fpb-search-meta';
    secondary.textContent = entry.type + ' in ' + entry.layer;

    node.appendChild(primary);
    node.appendChild(secondary);
    self._resultsNode.appendChild(node);
  });
};

/**
 * Goes to the element: switches the layer if needed, then scrolls to it and
 * selects it.
 */
FpbSearch.prototype._choose = function (entry) {
  if (!entry) {
    return;
  }
  this.close();
  if (entry.process !== this._canvas.getRootElement()) {
    this._modeling.switchProcess(entry.process);
  }
  const element = this._elementRegistry.get(entry.id);
  if (element) {
    this._canvas.scrollToElement(element);
    this._selection.select(element);
  }
  this._canvas.focus();
};

function appendHighlighted(node, text, pattern) {
  const needle = (pattern || '').trim().toLowerCase();
  const at = needle ? text.toLowerCase().indexOf(needle) : -1;
  if (at < 0) {
    node.textContent = text;
    return;
  }
  node.appendChild(document.createTextNode(text.slice(0, at)));
  const mark = document.createElement('b');
  mark.className = 'djs-search-highlight';
  mark.textContent = text.slice(at, at + needle.length);
  node.appendChild(mark);
  node.appendChild(document.createTextNode(text.slice(at + needle.length)));
}
