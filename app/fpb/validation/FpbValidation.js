import { checkModel, RULES, SEVERITY } from './ModelChecker';
import { collectProcessShapes } from '../help/processShapes';
import { goToElement } from '../help/navigation';
import { isReadOnly } from '../read-only/ReadOnly';
import { fill, translateMessage } from '../i18n/language';
import { markText } from '../i18n/markText';

const OVERLAY_TYPE = 'fpb-validation';
// the other elements a chosen finding is about (016b V8)
const INVOLVED_MARKER = 'fpb-finding-involved';
const DEBOUNCE = 250;
const RANK = { error: 0, warning: 1, info: 2 };
// Error and warning used to share the '!', so only their colour told them
// apart. Colour alone is no distinction for everyone (see core/colorScheme).
const SYMBOL = { error: '✕', warning: '!', info: 'i' };
const SEVERITY_LABEL = { error: markText('Error'), warning: markText('Warning'), info: markText('Note') };
const FILTERS = [
  { id: 'all', label: markText('All') },
  { id: 'error', label: markText('Errors') },
  { id: 'warning', label: markText('Warnings') },
  { id: 'info', label: markText('Notes') }
];

/** "1 error, 2 warnings, 0 notes" */
/** Errors and warnings as words ('2 errors, 1 warning'), for export and import */
export function describeErrorsAndWarnings(counts, translate) {
  const words = translate || fill;
  // the count as text: a translate in the style of diagram-js leaves {count} for 0
  const part = function (n, one, many) { return words(n === 1 ? one : many, { count: String(n) }); };
  return part(counts.error, markText('{count} error'), markText('{count} errors')) + ', ' +
    part(counts.warning, markText('{count} warning'), markText('{count} warnings'));
}

export function describeCounts(counts, translate) {
  const words = translate || fill;
  // the count as text: a translate in the style of diagram-js leaves {count} for 0
  const part = function (n, one, many) { return words(n === 1 ? one : many, { count: String(n) }); };
  return part(counts.error, markText('{count} error'), markText('{count} errors')) + ', ' +
    part(counts.warning, markText('{count} warning'), markText('{count} warnings')) + ', ' +
    part(counts.info, markText('{count} note'), markText('{count} notes'));
}

/**
 * Live model check against the VDI 3682 rule catalog (Feature 024 E).
 *
 * Runs after every change and after switching layers, marks elements of the
 * current layer with errors and warnings (notes only appear in the list) and
 * offers a list of all findings of all layers. Choosing a finding goes to the
 * element. Fires 'fpbValidation.changed' with { issues, counts }.
 */
export default function FpbValidation(eventBus, canvas, overlays, elementRegistry, modeling, selection, fpbjs, injector) {
  this._eventBus = eventBus;
  this._injector = injector;
  this._canvas = canvas;
  this._overlays = overlays;
  this._elementRegistry = elementRegistry;
  this._modeling = modeling;
  this._selection = selection;
  this._fpbjs = fpbjs;
  this._issues = [];
  this._showMarkers = true;
  this._timer = null;
  this._involved = [];

  const self = this;
  this._buildPanel();

  // list, markers and their texts in the new language (016h V3)
  eventBus.on('i18n.changed', function () {
    self._labelPanel();
    if (self.isPanelOpen()) {
      self._renderPanel();
    }
    self._renderMarkers();
  });

  eventBus.on('elements.changed', function () {
    self._schedule();
  });
  eventBus.on('root.set', function () {
    self._schedule();
  });
  eventBus.on('diagram.destroy', function () {
    clearTimeout(self._timer);
  });
  // the alignment of F9 changes the model; read-only offers none
  eventBus.on('readOnly.changed', function () {
    if (self.isPanelOpen()) {
      self._renderPanel();
    }
  });
  // on narrow touch screens the list is a sheet (016f E2): it goes into the
  // body of its sheet and back to the canvas when the sheet closes
  eventBus.on('sheets.changed', function (event) {
    const canvasContainer = self._canvas.getContainer();
    if (event.current === 'check' && event.body) {
      event.body.appendChild(self._panel);
      self._panel.classList.add('open');
      self._renderPanel();
    } else if (self._panel.parentNode !== canvasContainer) {
      self._panel.classList.remove('open');
      canvasContainer.appendChild(self._panel);
    } else if (event.active && self._panel.classList.contains('open')) {
      // turned upright with the floating list open: the list is a sheet now
      self._panel.classList.remove('open');
      self._panelChanged();
    }
  });
  // a chosen finding marks its other elements until the next selection
  eventBus.on('selection.changed', function () {
    if (!self._choosing) {
      self._clearInvolved();
    }
  });
}

FpbValidation.$inject = ['eventBus', 'canvas', 'overlays', 'elementRegistry', 'modeling', 'selection', 'fpbjs', 'injector'];

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
    marker.title = issues.map(function (i) { return i.rule + ': ' + translateMessage(self._t(), i); }).join('\n');
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
      '<span class="fpb-validation-title"></span>' +
      '<button type="button" class="fpb-validation-close">&times;</button>' +
    '</div>' +
    '<div class="fpb-validation-summary"></div>' +
    // filter by severity, only for the list; the markers have their switch (016c T11)
    '<div class="fpb-validation-filter" role="group">' +
      FILTERS.map(function (f) {
        return '<button type="button" data-filter="' + f.id + '" aria-pressed="' + (f.id === 'all') + '"></button>';
      }).join('') +
    '</div>' +
    '<ul class="fpb-validation-list" role="list"></ul>' +
    '<label class="fpb-validation-toggle"><input type="checkbox" checked /> <span class="fpb-validation-toggle-text"></span></label>';
  this._canvas.getContainer().appendChild(panel);
  this._labelPanel();

  const self = this;
  panel.querySelector('.fpb-validation-close').addEventListener('click', function () {
    self.closePanel();
  });
  panel.querySelector('.fpb-validation-toggle input').addEventListener('change', function (event) {
    self.setShowMarkers(event.target.checked);
  });
  panel.querySelector('.fpb-validation-filter').addEventListener('click', function (event) {
    const button = event.target.closest('button[data-filter]');
    if (button) {
      self._filter = button.getAttribute('data-filter');
      self._renderPanel();
    }
  });
  panel.querySelector('.fpb-validation-list').addEventListener('click', function (event) {
    const item = event.target.closest('li[data-index]');
    if (item) {
      self._goTo(self._issues[Number(item.getAttribute('data-index'))]);
    }
  });
};

/** The sheets while they are in use (016f E2), else null */
FpbValidation.prototype._sheets = function () {
  const sheets = this._injector.get('fpbSheets', false);
  return sheets && sheets.isActive() ? sheets : null;
};

/**
 * Whether the modeler offers the list of findings. A host with a list of its
 * own (the AML editor plugin, 016f E3) turns it off with the option
 * `validation: { list: false }`; the check and its markers stay.
 */
FpbValidation.prototype.hasList = function () {
  const config = this._injector.get('config', false);
  const option = config && config.validation;
  return !(option && option.list === false);
};

FpbValidation.prototype.isPanelOpen = function () {
  if (!this.hasList()) {
    return false;
  }
  const sheets = this._sheets();
  return sheets ? sheets.current() === 'check' : this._panel.classList.contains('open');
};

FpbValidation.prototype.openPanel = function () {
  this.run();
  if (!this.hasList()) {
    return;
  }
  const sheets = this._sheets();
  if (sheets) {
    sheets.open('check', { title: markText('Model check (VDI 3682)') });
    return;
  }
  const opening = !this._panel.classList.contains('open');
  this._panel.classList.add('open');
  this._renderPanel();
  if (opening) {
    this._panelChanged();
  }
};

FpbValidation.prototype.closePanel = function () {
  const sheets = this._sheets();
  if (sheets && sheets.current() === 'check') {
    sheets.close();
    return;
  }
  if (this._panel.classList.contains('open')) {
    this._panel.classList.remove('open');
    this._panelChanged();
  }
};

/**
 * The floating list opened or closed (016g B5); a sheet of the list says so
 * with sheets.changed
 */
FpbValidation.prototype._panelChanged = function () {
  this._eventBus.fire('fpbValidation.panelChanged', { open: this._panel.classList.contains('open') });
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
  const translate = this._t();
  this._panel.querySelector('.fpb-validation-summary').textContent = this._issues.length
    ? describeCounts(counts, translate)
    : translate('No findings.');

  const filter = this._filter || 'all';
  this._panel.querySelectorAll('.fpb-validation-filter button').forEach(function (button) {
    const f = FILTERS.find(function (x) { return x.id === button.getAttribute('data-filter'); });
    button.textContent = translate(f.label) + ' ' + (f.id === 'all' ? counts.error + counts.warning + counts.info : counts[f.id]);
    button.setAttribute('aria-pressed', String(f.id === filter));
  });

  const list = this._panel.querySelector('.fpb-validation-list');
  list.innerHTML = '';
  const self = this;
  const root = this._canvas.getRootElement();
  this._issues.forEach(function (issue, index) {
    if (filter !== 'all' && issue.severity !== filter) {
      return;
    }
    const item = document.createElement('li');
    item.className = 'fpb-validation-item fpb-validation-' + issue.severity;
    item.setAttribute('data-index', String(index));
    item.setAttribute('data-rule', issue.rule);

    const head = document.createElement('div');
    head.className = 'fpb-validation-item-head';
    // The severity in words, not only as the colour of the left border
    head.textContent = translate(SEVERITY_LABEL[issue.severity]) + ' · ' + issue.rule + ' ' + translate(RULES[issue.rule].title);
    const text = document.createElement('div');
    text.className = 'fpb-validation-item-text';
    text.textContent = translateMessage(translate, issue) + (issue.process !== root ? ' ' + translate('(in {layer})', { layer: self._layerName(issue.process) }) : '');

    item.appendChild(head);
    item.appendChild(text);

    // involved elements on other layers (F5, F8): one link per layer (016b V8)
    const elsewhere = [];
    (issue.involved || []).forEach(function (x) {
      if (x.process !== issue.process && elsewhere.indexOf(x.process) === -1) {
        elsewhere.push(x.process);
      }
    });
    elsewhere.forEach(function (process) {
      const link = document.createElement('button');
      link.type = 'button';
      link.className = 'fpb-validation-elsewhere';
      link.textContent = translate('Also in {layer}', { layer: self._layerName(process) });
      // the list's own click handler would go to the element of the finding
      link.addEventListener('click', function (event) {
        event.stopPropagation();
        self._goTo(issue, process);
      });
      item.appendChild(link);
    });
    // F9: the copies of a boundary state differ; the user chooses which
    // copy holds the right values
    if (issue.variants && issue.variants.length > 1 && !isReadOnly(self._injector)) {
      const choices = document.createElement('div');
      choices.className = 'fpb-validation-choices';
      issue.variants.forEach(function (variant) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'fpb-validation-choice';
        button.textContent = translate('Use the values of the {layer}', { layer: self._layerName(variant.process) });
        button.addEventListener('click', function (event) {
          event.stopPropagation();
          self._modeling.alignStateCopies(variant.id, variant.process);
        });
        choices.appendChild(button);
      });
      item.appendChild(choices);
    }
    list.appendChild(item);
  });
  // a filter that finds nothing says so, instead of an empty list (016g B4)
  if (this._issues.length && !list.children.length) {
    const empty = document.createElement('li');
    empty.className = 'fpb-validation-empty';
    empty.textContent = translate('No findings of this kind.');
    list.appendChild(empty);
  }
};

FpbValidation.prototype._clearInvolved = function () {
  const registry = this._elementRegistry;
  const canvas = this._canvas;
  // elements of a layer left meanwhile are no longer on the canvas
  this._involved.forEach(function (x) {
    if (registry.get(x.id)) {
      canvas.removeMarker(x, INVOLVED_MARKER);
    }
  });
  this._involved = [];
};

FpbValidation.prototype._layerName = function (process) {
  const translate = this._t();
  const bo = process && process.businessObject;
  if (bo && bo.isDecomposedProcessOperator) {
    return translate('decomposition of {name}', { name: bo.isDecomposedProcessOperator.name || translate('unnamed operator') });
  }
  return translate('top level');
};

/** The translate of the modeler */
FpbValidation.prototype._t = function () {
  return this._injector.get('translate');
};

/** The fixed texts of the list in the language in effect */
FpbValidation.prototype._labelPanel = function () {
  const translate = this._t();
  const panel = this._panel;
  panel.querySelector('.fpb-validation-title').textContent = translate('Model check (VDI 3682)');
  const close = panel.querySelector('.fpb-validation-close');
  close.setAttribute('title', translate('Close'));
  close.setAttribute('aria-label', translate('Close'));
  panel.querySelector('.fpb-validation-filter').setAttribute('aria-label', translate('Show findings'));
  panel.querySelector('.fpb-validation-toggle-text').textContent = translate('Show markers on the elements');
};

FpbValidation.prototype._goTo = function (issue, process) {
  if (!issue) {
    return;
  }
  const target = process || issue.process;
  const element = goToElement({
    canvas: this._canvas,
    modeling: this._modeling,
    elementRegistry: this._elementRegistry,
    selection: this._selection
  }, target, target === issue.process ? issue.elementId : null);

  // every element of the finding on this layer (016b V8): the element of the
  // finding is selected, so the properties panel shows the finding (V7); the
  // others are marked (decided by the user 2026-10-19)
  const registry = this._elementRegistry;
  const here = (issue.involved || [])
    .filter(function (x) { return x.process === target; })
    .map(function (x) { return registry.get(x.id); })
    .filter(Boolean);
  const chosen = element || here[0] || null;

  this._choosing = true;
  try {
    this._selection.select(chosen ? [chosen] : []);
  } finally {
    this._choosing = false;
  }
  this._clearInvolved();
  this._involved = here.filter(function (x) { return x !== chosen; });
  const canvas = this._canvas;
  this._involved.forEach(function (x) { canvas.addMarker(x, INVOLVED_MARKER); });
  if (here.length) {
    canvas.scrollToElement(here.length === 1 ? here[0] : here);
  }

  // the new properties panel opens at the findings of the element (016b V7)
  this._eventBus.fire('propertiesPanel.open', { entry: 'findings' });
};
