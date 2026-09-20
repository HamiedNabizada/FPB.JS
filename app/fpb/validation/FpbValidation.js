import { checkModel, RULES, SEVERITY } from './ModelChecker';
import { collectProcessShapes } from '../help/processShapes';
import { goToElement } from '../help/navigation';

const OVERLAY_TYPE = 'fpb-validation';
const DEBOUNCE = 250;
const RANK = { error: 0, warning: 1, info: 2 };
// Error and warning used to share the '!', so only their colour told them
// apart. Colour alone is no distinction for everyone (see core/colorScheme).
const SYMBOL = { error: '✕', warning: '!', info: 'i' };
const SEVERITY_LABEL = { error: 'Error', warning: 'Warning', info: 'Note' };

/** "1 error, 2 warnings, 0 notes" */
export function describeCounts(counts) {
  const part = function (n, one, many) { return n + ' ' + (n === 1 ? one : many); };
  return part(counts.error, 'error', 'errors') + ', ' + part(counts.warning, 'warning', 'warnings') + ', ' + part(counts.info, 'note', 'notes');
}

/**
 * Live model check against the VDI 3682 rule catalog (Feature 024 E).
 *
 * Runs after every change and after switching layers, marks elements of the
 * current layer with errors and warnings (notes only appear in the list) and
 * offers a list of all findings of all layers. Choosing a finding goes to the
 * element. Fires 'fpbValidation.changed' with { issues, counts }.
 */
export default function FpbValidation(eventBus, canvas, overlays, elementRegistry, modeling, selection, fpbjs) {
  this._eventBus = eventBus;
  this._canvas = canvas;
  this._overlays = overlays;
  this._elementRegistry = elementRegistry;
  this._modeling = modeling;
  this._selection = selection;
  this._fpbjs = fpbjs;
  this._issues = [];
  this._showMarkers = true;
  this._timer = null;

  const self = this;
  this._buildPanel();

  eventBus.on('elements.changed', function () {
    self._schedule();
  });
  eventBus.on('root.set', function () {
    self._schedule();
  });
  eventBus.on('diagram.destroy', function () {
    clearTimeout(self._timer);
  });
}

FpbValidation.$inject = ['eventBus', 'canvas', 'overlays', 'elementRegistry', 'modeling', 'selection', 'fpbjs'];

FpbValidation.prototype._schedule = function () {
  const self = this;
  clearTimeout(this._timer);
  this._timer = setTimeout(function () {
    self.run();
  }, DEBOUNCE);
};

/** Checks the whole model now and returns the findings. */
FpbValidation.prototype.run = function () {
  clearTimeout(this._timer);
  const project = this._fpbjs.getProjectDefinition();
  this._issues = project ? checkModel(collectProcessShapes(project)) : [];
  this._issues.sort(function (a, b) { return RANK[a.severity] - RANK[b.severity]; });
  this._renderMarkers();
  if (this.isPanelOpen()) {
    this._renderPanel();
  }
  this._eventBus.fire('fpbValidation.changed', { issues: this._issues, counts: this.getCounts() });
  return this._issues;
};

FpbValidation.prototype.getIssues = function () {
  return this._issues.slice();
};

FpbValidation.prototype.getCounts = function () {
  const counts = { error: 0, warning: 0, info: 0 };
  this._issues.forEach(function (issue) { counts[issue.severity]++; });
  return counts;
};

FpbValidation.prototype.setShowMarkers = function (show) {
  this._showMarkers = !!show;
  this._renderMarkers();
};

FpbValidation.prototype._renderMarkers = function () {
  this._overlays.remove({ type: OVERLAY_TYPE });
  if (!this._showMarkers) {
    return;
  }
  const root = this._canvas.getRootElement();
  const perElement = new Map();
  this._issues.forEach(function (issue) {
    if (issue.severity === SEVERITY.INFO || issue.process !== root || !issue.elementId) {
      return;
    }
    if (!perElement.has(issue.elementId)) {
      perElement.set(issue.elementId, []);
    }
    perElement.get(issue.elementId).push(issue);
  });

  const self = this;
  perElement.forEach(function (issues, elementId) {
    const element = self._elementRegistry.get(elementId);
    if (!element) {
      return;
    }
    const severity = issues.some(function (i) { return i.severity === SEVERITY.ERROR; }) ? SEVERITY.ERROR : SEVERITY.WARNING;
    const marker = document.createElement('div');
    marker.className = 'fpb-validation-marker fpb-validation-' + severity;
    marker.textContent = SYMBOL[severity];
    marker.title = issues.map(function (i) { return i.rule + ': ' + i.message; }).join('\n');
    marker.setAttribute('data-rules', issues.map(function (i) { return i.rule; }).join(' '));
    const position = element.waypoints ? { top: -8, left: -8 } : { top: -8, right: 8 };
    self._overlays.add(element, OVERLAY_TYPE, { position: position, html: marker });
  });
};

// list of findings //////////////////////////////////////////////////////

FpbValidation.prototype._buildPanel = function () {
  const panel = this._panel = document.createElement('div');
  panel.className = 'fpb-validation-panel';
  panel.innerHTML =
    '<div class="fpb-validation-header">' +
      '<span class="fpb-validation-title">Model check (VDI 3682)</span>' +
      '<button type="button" class="fpb-validation-close" title="Close" aria-label="Close">&times;</button>' +
    '</div>' +
    '<div class="fpb-validation-summary"></div>' +
    '<label class="fpb-validation-toggle"><input type="checkbox" checked /> Show markers on the elements</label>' +
    '<ul class="fpb-validation-list" role="list"></ul>';
  this._canvas.getContainer().appendChild(panel);

  const self = this;
  panel.querySelector('.fpb-validation-close').addEventListener('click', function () {
    self.closePanel();
  });
  panel.querySelector('.fpb-validation-toggle input').addEventListener('change', function (event) {
    self.setShowMarkers(event.target.checked);
  });
  panel.querySelector('.fpb-validation-list').addEventListener('click', function (event) {
    const item = event.target.closest('li[data-index]');
    if (item) {
      self._goTo(self._issues[Number(item.getAttribute('data-index'))]);
    }
  });
};

FpbValidation.prototype.isPanelOpen = function () {
  return this._panel.classList.contains('open');
};

FpbValidation.prototype.openPanel = function () {
  this.run();
  this._panel.classList.add('open');
  this._renderPanel();
};

FpbValidation.prototype.closePanel = function () {
  this._panel.classList.remove('open');
};

FpbValidation.prototype.togglePanel = function () {
  if (this.isPanelOpen()) {
    this.closePanel();
  } else {
    this.openPanel();
  }
};

FpbValidation.prototype._renderPanel = function () {
  const counts = this.getCounts();
  this._panel.querySelector('.fpb-validation-summary').textContent = this._issues.length
    ? describeCounts(counts)
    : 'No findings.';

  const list = this._panel.querySelector('.fpb-validation-list');
  list.innerHTML = '';
  const self = this;
  const root = this._canvas.getRootElement();
  this._issues.forEach(function (issue, index) {
    const item = document.createElement('li');
    item.className = 'fpb-validation-item fpb-validation-' + issue.severity;
    item.setAttribute('data-index', String(index));
    item.setAttribute('data-rule', issue.rule);

    const head = document.createElement('div');
    head.className = 'fpb-validation-item-head';
    // The severity in words, not only as the colour of the left border
    head.textContent = SEVERITY_LABEL[issue.severity] + ' · ' + issue.rule + ' ' + RULES[issue.rule].title;
    const text = document.createElement('div');
    text.className = 'fpb-validation-item-text';
    text.textContent = issue.message + (issue.process !== root ? ' (in ' + self._layerName(issue.process) + ')' : '');

    item.appendChild(head);
    item.appendChild(text);
    list.appendChild(item);
  });
};

FpbValidation.prototype._layerName = function (process) {
  const bo = process && process.businessObject;
  if (bo && bo.isDecomposedProcessOperator) {
    return 'decomposition of ' + (bo.isDecomposedProcessOperator.name || 'unnamed operator');
  }
  return 'top level';
};

FpbValidation.prototype._goTo = function (issue) {
  if (!issue) {
    return;
  }
  goToElement({
    canvas: this._canvas,
    modeling: this._modeling,
    elementRegistry: this._elementRegistry,
    selection: this._selection
  }, issue.process, issue.elementId);
};
