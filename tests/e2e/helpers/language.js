// tests/e2e/helpers/language.js
import fs from 'fs';
import path from 'path';
import { openLibraryPage, importModel } from '../library/libPage';
import basis from '../fixtures/temperieren.json';

/**
 * Tools for the German interface (016h F1, Tests): a translate of the host
 * that marks every text, a reader for what is still unmarked, and the
 * surfaces of the interface, each opened the same way for every check.
 *
 * Marked texts are wrapped in ⟦ ⟧. What a surface shows outside of the marks
 * and is not model data comes from FPB.js without passing translate().
 */

export const OPEN = '⟦';
export const CLOSE = '⟧';

/** The fixture model; surfaces may name another (see prepare) */
export const clone = () => JSON.parse(JSON.stringify(basis));

/** All strings of a model (names, ids, values): data, never translated */
export function modelData(json) {
  // names of languages, the product and file formats are no English to translate
  const found = new Set(['Deutsch', 'English', 'FPB.js', 'JSON', 'XML', 'SVG', 'PNG', 'PDF',
    '.json', '.xml', '.aml', '.svg', '.png', '.pdf']);
  const walk = (value) => {
    if (typeof value === 'string') {
      if (value.trim()) {
        // as written, with its line breaks as spaces, and line by line
        found.add(value.trim());
        found.add(value.replace(/\s+/g, ' ').trim());
        value.split(/\n/).map((line) => line.trim()).filter(Boolean).forEach((line) => found.add(line));
      }
    } else if (Array.isArray(value)) {
      value.forEach(walk);
    } else if (value && typeof value === 'object') {
      Object.keys(value).forEach((key) => walk(value[key]));
    }
  };
  walk(json);
  return [...found].sort((a, b) => b.length - a.length);
}

/**
 * Like createModeler, with a translate of the host in additionalModules that
 * marks every text (a host may replace translate, 016h V9).
 */
export async function createMarkedModeler(page, { options = {}, aml = false, sheets = false } = {}) {
  await createIn(page, { options, aml, sheets, marked: true });
}

/**
 * Create the modeler in the test page, with the panels; `marked` adds the
 * marking translate, `sheets` a container for the sheets of a phone.
 */
async function createIn(page, { options = {}, aml = false, sheets = false, marked = false } = {}) {
  await page.evaluate(async ({ options, aml, sheets, marked }) => {
    // only the fixed parts of a template are marked; the values put in stay
    // outside, so an English value from the code is found as well
    const mark = (text) => (text ? '⟦' + text + '⟧' : '');
    const markTemplate = (template, replacements) => {
      let out = '';
      let last = 0;
      template.replace(/{([^}]+)}/g, (whole, key, at) => {
        const value = replacements ? replacements[key] : undefined;
        out += mark(template.slice(last, at)) + (value === undefined || value === null ? mark(whole) : String(value));
        last = at + whole.length;
        return whole;
      });
      return out + mark(template.slice(last));
    };
    const markedModule = {
      translate: ['value', (template, replacements) => (typeof template === 'string'
        ? markTemplate(template, replacements)
        : template)]
    };
    const opts = Object.assign({
      container: document.getElementById('modeler'),
      propertiesContainer: document.getElementById('properties'),
      layerContainer: document.getElementById('layers')
    }, options);
    if (sheets) {
      const holder = document.createElement('div');
      holder.id = 'sheets';
      // the test page has no viewport of its own; a phone would lay it out 980 px wide
      const meta = document.createElement('meta');
      meta.name = 'viewport';
      meta.content = 'width=device-width, initial-scale=1';
      document.head.appendChild(meta);
      // a phone: canvas above, the row of the sheets below, the toolbar on the right
      holder.style.cssText = 'position:absolute;left:0;bottom:0;width:100%;height:45%;';
      document.getElementById('modeler').style.cssText = 'position:absolute;left:0;top:0;width:100%;height:55%;';
      document.getElementById('properties').style.cssText = 'position:absolute;left:0;top:0;width:0;height:0;overflow:hidden;';
      document.getElementById('layers').style.cssText = 'position:absolute;right:0;top:0;width:60px;height:55%;overflow:visible;z-index:5;';
      document.body.appendChild(holder);
      opts.sheets = { container: holder };
    }
    opts.additionalModules = [].concat(aml ? [window.FpbJSAml.AmlModule] : [], marked ? [markedModule] : []);
    window.fpb = await window.FpbJS.createFpbModeler(opts);
  }, { options, aml, sheets, marked });
}

/** Wait until Preact and the event handlers have drawn */
export async function settle(page) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 60))));
}

/**
 * A page with a modeler for `surface`: marked (every text wrapped) or in a
 * language. The surface may ask for options, the AML module and a model of
 * its own (`model`: a JSON array, or 'empty' for none).
 */
export async function prepare(page, surface, { marked = false, language = 'en' } = {}) {
  if (surface.viewport) {
    await page.setViewportSize(surface.viewport);
  }
  const ctx = await openLibraryPage(page);
  if (surface.viewport) {
    await page.setViewportSize(surface.viewport);
  }
  if (surface.before) {
    await surface.before(page);
  }
  const options = Object.assign({}, surface.options || {});
  if (!marked) {
    options.language = language;
  }
  await createIn(page, { options, aml: Boolean(surface.aml), sheets: Boolean(surface.sheets), marked });
  const model = surface.model === undefined ? clone() : surface.model;
  if (model !== 'empty') {
    if (typeof model === 'function') {
      await model(page);
    } else if (!(await importModel(page, model))) {
      throw new Error('import of the model for ' + surface.name + ' did not finish');
    }
  }
  await settle(page);
  return ctx;
}

/**
 * What the surface shows outside of the marks and the model data: leftovers
 * of the visible text (innerText of each element of `scope`, by line) and of
 * the attributes title, aria-label, placeholder and alt of visible elements
 * in it. `scope` is a list of selectors; without it the whole body.
 */
export function unmarked(page, data, scope) {
  return page.evaluate(({ data, open, close, scope }) => {
    // 'self:<selector>': only the attributes of the element itself
    const all = (selector) => [...document.querySelectorAll(selector)];
    const roots = scope ? scope.filter((s) => !s.startsWith('self:')).flatMap(all) : [document.body];
    const selves = scope ? scope.filter((s) => s.startsWith('self:')).flatMap((s) => all(s.slice(5))) : [];
    const strip = (text) => {
      let rest = text;
      let before;
      do {
        before = rest;
        rest = rest.replace(new RegExp(open + '[^' + open + close + ']*' + close, 'g'), ' ');
      } while (rest !== before);
      // data as whole words only: a short value ("to") must not cut English apart
      data.forEach((value) => {
        const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        rest = rest.replace(new RegExp('(^|[^\\p{L}\\p{N}_])' + escaped + '(?=$|[^\\p{L}\\p{N}_])', 'gu'), '$1 ');
      });
      return rest;
    };
    const letters = /[A-Za-zÄÖÜäöüß]{2,}/;
    const found = [];

    // a drawing joins its labels in innerText: one line per text element there
    const linesOf = (root) => (root instanceof SVGElement
      ? [...root.querySelectorAll('text')].map((text) => text.textContent)
      : (root.innerText || root.textContent || '').split('\n'));
    roots.forEach((root) => {
      linesOf(root).map(strip).forEach((line) => {
        if (letters.test(line)) {
          found.push({ text: line.trim(), where: 'text' });
        }
      });
    });

    const visible = (element) => element.getClientRects().length > 0;
    const withAttributes = (root) => [root].concat([...root.querySelectorAll('[title], [aria-label], [placeholder], [alt]')]);
    roots.flatMap(withAttributes).concat(selves).forEach((element) => {
      if (!visible(element)) {
        return;
      }
      ['title', 'aria-label', 'placeholder', 'alt'].forEach((name) => {
        const value = element.getAttribute(name);
        if (value && letters.test(strip(value))) {
          const where = element.id ? '#' + element.id : element.tagName.toLowerCase() + '.' + String(element.className && element.className.baseVal !== undefined ? element.className.baseVal : element.className).split(' ').join('.');
          found.push({ text: name + '="' + value + '"', where });
        }
      });
    });
    return found;
  }, { data, open: OPEN, close: CLOSE, scope });
}

/**
 * The texts a surface shows, in the order of the page: the lines of the
 * visible text and the attributes of visible elements; the message stack
 * is left out (messages keep their language, 016h V3).
 */
export function texts(page, scope) {
  return page.evaluate((scope) => {
    // 'self:<selector>': only the attributes of the element itself
    const all = (selector) => [...document.querySelectorAll(selector)];
    const roots = scope ? scope.filter((s) => !s.startsWith('self:')).flatMap(all) : [document.body];
    const selves = scope ? scope.filter((s) => s.startsWith('self:')).flatMap((s) => all(s.slice(5))) : [];
    const stack = document.querySelector('.fpb-notifications');
    const hidden = stack ? stack.style.display : null;
    if (stack) {
      stack.style.display = 'none';
    }
    const lines = roots.flatMap((root) => (root.innerText || root.textContent || '').split('\n'))
      .map((line) => line.trim()).filter(Boolean);
    if (stack) {
      stack.style.display = hidden;
    }
    const attributes = [];
    const withAttributes = (root) => [root].concat([...root.querySelectorAll('[title], [aria-label], [placeholder], [alt]')]);
    roots.flatMap(withAttributes).concat(selves).forEach((element) => {
      if (element.getClientRects().length === 0 || (stack && stack.contains(element))) {
        return;
      }
      ['title', 'aria-label', 'placeholder', 'alt'].forEach((name) => {
        if (element.hasAttribute(name)) {
          attributes.push(name + '=' + element.getAttribute(name));
        }
      });
    });
    return lines.concat(attributes);
  }, scope);
}

/**
 * Leave parts of a surface out of a check (`exclude`): hidden while `fn`
 * runs, shown again afterwards. For texts a later task of F1 translates.
 */
export async function without(page, selectors, fn) {
  if (!selectors || !selectors.length) {
    return fn();
  }
  const hide = (show) => page.evaluate(({ selectors, show }) => {
    selectors.forEach((selector) => document.querySelectorAll(selector).forEach((element) => {
      element.style.visibility = show ? '' : 'hidden';
      element.style.display = show ? '' : 'none';
    }));
  }, { selectors, show });
  await hide(false);
  try {
    return await fn();
  } finally {
    await hide(true);
  }
}

/** Focus each button of the toolbar in turn and collect what its tip shows */
async function eachToolbarTip(page, check) {
  const count = await page.locator('#layers button').count();
  for (let i = 0; i < count; i++) {
    const button = page.locator('#layers button').nth(i);
    if (!(await button.isVisible())) {
      continue;
    }
    await button.focus();
    await page.locator('.fpb-toolbar-tip:not([hidden])').waitFor({ state: 'visible', timeout: 2000 }).catch(() => {});
    await check(page);
  }
}

// elements of the fixture (temperieren.json), top layer
export const IDS = {
  product: 'c50336d6-9a7f-46e3-a7f5-e6187618dd69',
  energy: '6d5ba42c-ba5f-4348-abc3-3f7395b8ce2d',
  operator: '9833d9a9-1b88-4bfb-91b3-7ab5e2617045',
  decomposed: '9ca400c0-a373-48c0-9f13-37ce196cee29',
  resource: '9fe05bdc-4f2b-4ec5-8128-51dbc597eee2',
  systemLimit: '1557c2cf-1aeb-4ef2-93ad-6bd66bf0a6a7',
  flow: 'd5dc692d-61ac-4b4b-aea5-3d3044345aa7',
  parallelFlow: 'c0293fb1-f400-446b-8eb5-f0a071135619',
  alternativeFlow: '6551201a-9b9a-43fa-ad15-dc59a37933f7',
  usage: '0059ef37-ea80-4414-8e8d-8985a35e59bf'
};

/** Select an element; the context pad of diagram-js opens for it */
async function contextPad(page, id) {
  await page.evaluate((id) => {
    window.fpb.get('selection').select(null);
    window.fpb.select(id);
  }, id);
  await page.locator('.djs-context-pad.open').waitFor({ state: 'visible', timeout: 3000 });
}

/** Open the popup menu behind an entry of the context pad */
async function padMenu(page, id, action) {
  await contextPad(page, id);
  await page.locator('.djs-context-pad [data-action="' + action + '"]').click();
  await page.locator('.djs-popup').waitFor({ state: 'visible', timeout: 3000 });
}

/** Search all layers for `pattern` */
async function search(page, pattern) {
  await page.evaluate(() => window.fpb.get('fpbSearch').open());
  await page.locator('.fpb-search input').fill(pattern);
}

/** The hints of ModelingFeedback when a move or create is refused */
async function dragHints(page, ids) {
  await page.evaluate((ids) => {
    const registry = window.fpb.get('elementRegistry');
    const root = window.fpb.get('canvas').getRootElement();
    const at = { x: 200, y: 200 };
    window.fpb.fire('shape.move.rejected', Object.assign({ context: { shape: registry.get(ids.operator), target: root } }, at));
    window.fpb.fire('shape.move.rejected', Object.assign({ context: { shape: registry.get(ids.product), target: root } }, { x: 200, y: 260 }));
    window.fpb.fire('shape.move.rejected', Object.assign({ context: { shape: registry.get(ids.resource), target: registry.get(ids.systemLimit) } }, { x: 200, y: 320 }));
    window.fpb.fire('illegalMove', { movedElement: registry.get(ids.resource), targetElement: registry.get(ids.product), position: { x: 200, y: 380 } });
    window.fpb.fire('illegalCreate', { movedElement: registry.get(ids.operator), targetElement: registry.get(ids.resource), position: { x: 200, y: 440 } });
  }, ids);
}

/** Show an element (or nothing: the layer) in the properties panel */
async function panelOf(page, ids) {
  await page.evaluate((ids) => {
    const selection = window.fpb.get('selection');
    const registry = window.fpb.get('elementRegistry');
    window.fpb.fire('propertiesPanel.open');
    selection.select(ids.map((id) => registry.get(id)));
  }, ids);
  await page.locator('#properties .fpb-properties-body').waitFor({ timeout: 3000 });
  await settle(page);
}

/** The first characteristic of the product, opened, one tab after the other */
async function eachCharacteristicTab(page, check) {
  await page.locator('#properties .fpb-characteristic-row-name').first().click();
  const tabs = page.locator('#properties .fpb-characteristic-tab');
  await tabs.first().waitFor({ timeout: 3000 });
  const count = await tabs.count();
  for (let i = 0; i < count; i++) {
    await tabs.nth(i).click();
    await check(page);
  }
}

const EXAMPLES = path.join(__dirname, '..', '..', '..', 'app', 'examples');

/** An AML file of the web app's examples */
export const amlFile = (name) => fs.readFileSync(path.join(EXAMPLES, name), 'utf8');

/** What an AML file holds as names and values: data, never translated */
export function amlData(text) {
  const found = new Set();
  (text.match(/="[^"]*"/g) || []).forEach((m) => found.add(m.slice(2, -1)));
  (text.match(/>[^<]+</g) || []).forEach((m) => found.add(m.slice(1, -1).trim()));
  return [...found].filter((s) => s.trim()).sort((a, b) => b.length - a.length);
}

/** A model for prepare(): the AML file imported, its index read */
export const amlModel = (name) => async (page) => {
  await page.evaluate((text) => new Promise((resolve, reject) => {
    const done = () => {
      window.fpb.off('import.done', done);
      resolve();
    };
    window.fpb.on('import.done', done);
    window.fpb.importAML(text, { fileName: 'Showcase.aml' }).catch(reject);
  }), amlFile(name));
  await page.waitForFunction(() => window.fpb.get('amlSupport').getIndex());
};

/** The first element on the canvas that carries more from the AML file */
async function panelOfAmlElement(page) {
  const id = await page.evaluate(() => {
    const aml = window.fpb.get('amlSupport');
    const found = window.fpb.get('elementRegistry').filter((e) => e.businessObject && aml.getForeignContent(e.id));
    return found.length ? found[0].id : null;
  });
  if (!id) {
    throw new Error('no element with AML content on the canvas');
  }
  await panelOf(page, [id]);
}

// the layer below "Erhitzen" in the fixture
export const CHILD = '9ca400c0-a373-48c0-9f13-37ce196cee29';
const CHILD_LIMIT = 'deba3596-38ca-4bca-a85e-3d0b5dfba666';
const MAIN = basis[0].entryPoint;

const DIALOG = 'dialog.fpb-dialog[open]';

/** Wait for an open dialog of FPB.js */
const dialogOpen = (page) => page.locator(DIALOG).first().waitFor({ timeout: 3000 });

/** Each tab of the dialog "Information" in turn */
async function eachInfoTab(page, check) {
  const tabs = page.locator(DIALOG + ' .fpb-info-tab');
  const count = await tabs.count();
  for (let i = 0; i < count; i++) {
    await tabs.nth(i).click();
    await settle(page);
    await check(page);
  }
}

/** Each format of the export dialog in turn, then a file name that is not allowed */
async function eachExportFormat(page, check) {
  const formats = page.locator(DIALOG + ' input[name="exportFormat"]');
  const count = await formats.count();
  for (let i = 0; i < count; i++) {
    await formats.nth(i).check();
    await settle(page);
    await check(page);
  }
  await page.locator('#exportFileName').fill('con');
  await settle(page);
  await check(page);
}

/** Ask the question of deleting the elements, as the Delete key does */
async function askDelete(page, ids, layer) {
  await page.evaluate(({ ids, layer }) => {
    if (layer) {
      window.fpb.switchProcess(layer);
    }
    const registry = window.fpb.get('elementRegistry');
    window.fpb.get('fpbDelete').remove(ids.map((id) => registry.get(id)));
  }, { ids, layer });
  await dialogOpen(page);
}

const questionSurface = (name, open, more = {}) => Object.assign({
  name: 'question ' + name,
  scope: [DIALOG],
  // a question keeps the text it was asked with; it is modal, so the
  // language cannot change from the interface while it is open (016h V3)
  noSwitch: true,
  open
}, more);

/**
 * The fixture with findings of all kinds: an energy without a name (note),
 * moved out of the system limit (error), and an operator without its
 * output (warning)
 */
function findingsModel() {
  const json = clone();
  const top = json[1];
  top.elementDataInformation.find((e) => e.id === IDS.energy).name = '';
  const shape = top.elementVisualInformation.find((e) => e.id === IDS.energy);
  shape.x = -400;
  shape.y = -400;
  return json;
}

/** The fixture with what the JSON import reports: a missing sub-process, an element twice */
function brokenModel() {
  const json = clone();
  const top = json[1];
  top.process.consistsOfProcesses = (top.process.consistsOfProcesses || []).concat(['nowhere']);
  const product = top.elementDataInformation.find((e) => e.id === IDS.product);
  top.elementDataInformation.push(Object.assign({}, product, { id: 'ghost' }));
  return json;
}

/** Each filter of the list of the model check in turn */
async function eachFilter(page, check) {
  const filters = page.locator('.fpb-validation-filter button');
  const count = await filters.count();
  for (let i = 0; i < count; i++) {
    await filters.nth(i).click();
    await settle(page);
    await check(page);
  }
}

const panelSurface = (name, ids, more = {}) => Object.assign({
  name: 'panel ' + name,
  scope: ['#properties'],
  open: (page) => panelOf(page, ids)
}, more);

const contextPadSurface = (kind) => ({
  name: 'context pad ' + kind,
  scope: ['.djs-context-pad'],
  closesOnSwitch: true,
  open: (page) => contextPad(page, IDS[kind])
});

/**
 * The surfaces of the interface (016h V5). Each task of F1 adds the ones
 * it translates. `scope` lists the selectors of what the surface shows
 * (without it: the whole page). `open` brings the surface up on a prepared
 * page;
 * `closesOnSwitch` marks surfaces that close when the language changes and
 * are opened again for the comparison (016h V3).
 */
export const SURFACES = [
  {
    name: 'toolbar',
    scope: ['#layers'],
    open: async () => {}
  },
  {
    name: 'toolbar tips',
    scope: ['.fpb-toolbar-tips'],
    open: async () => {},
    each: eachToolbarTip
  },
  // the canvas: palette, the label of the drawing area, and each element
  // described for screen readers (Task 3)
  {
    name: 'canvas and palette',
    scope: ['self:.djs-container', '.djs-palette', '.djs-container > svg'],
    open: async () => {}
  },
  ...['product', 'energy', 'operator', 'decomposed', 'resource', 'systemLimit', 'flow', 'parallelFlow', 'usage'].map(contextPadSurface),
  {
    name: 'change type menu of a state',
    scope: ['.djs-popup'],
    closesOnSwitch: true,
    open: (page) => padMenu(page, IDS.product, 'change_type')
  },
  {
    name: 'change type menu of a branching',
    scope: ['.djs-popup'],
    closesOnSwitch: true,
    open: (page) => padMenu(page, IDS.parallelFlow, 'change_type')
  },
  {
    name: 'append menu',
    scope: ['.djs-popup'],
    closesOnSwitch: true,
    open: (page) => padMenu(page, IDS.operator, 'append')
  },
  {
    name: 'search with results',
    scope: ['.fpb-search'],
    closesOnSwitch: true,
    open: (page) => search(page, 'r')
  },
  {
    name: 'search without results',
    scope: ['.fpb-search'],
    closesOnSwitch: true,
    open: (page) => search(page, 'zzzz')
  },
  {
    name: 'decomposition preview',
    scope: ['.fpb-decomposition-preview'],
    closesOnSwitch: true,
    open: async (page) => {
      await page.mouse.move(5, 5);
      await page.hover('[data-element-id="' + IDS.decomposed + '"]');
      await page.locator('.fpb-decomposition-preview').waitFor({ state: 'visible', timeout: 3000 });
    }
  },
  {
    name: 'drag hints',
    scope: ['.djs-tooltip-container'],
    closesOnSwitch: true,
    open: (page) => dragHints(page, IDS)
  },
  // the properties panel for each kind of element (Task 4)
  panelSurface('layer', []),
  panelSurface('product with a characteristic', [IDS.product], { each: eachCharacteristicTab }),
  panelSurface('energy', [IDS.energy]),
  panelSurface('operator', [IDS.operator]),
  panelSurface('decomposed operator', [IDS.decomposed]),
  panelSurface('technical resource', [IDS.resource]),
  panelSurface('system limit', [IDS.systemLimit]),
  panelSurface('flow', [IDS.flow]),
  panelSurface('parallel flow', [IDS.parallelFlow]),
  panelSurface('usage', [IDS.usage]),
  panelSurface('several elements', [IDS.product, IDS.energy]),
  panelSurface('element with a finding', [], {
    // a state without a name gets a finding of the model check
    model: (page) => page.evaluate(async (json) => {
      json[1].elementDataInformation.find((e) => e.$type === 'fpb:Energy').name = '';
      await new Promise((resolve) => {
        const done = () => {
          window.fpb.off('import.done', done);
          resolve();
        };
        window.fpb.on('import.done', done);
        window.fpb.importJSON(json);
      });
    }, clone()),
    open: (page) => panelOf(page, [IDS.energy])
  }),
  panelSurface('AML section', [], {
    aml: true,
    model: amlModel('Showcase-A-WaermetauscherMitRegelung.aml'),
    data: amlData(amlFile('Showcase-A-WaermetauscherMitRegelung.aml')),
    open: panelOfAmlElement
  }),
  // dialogs, questions, files, messages, AML file (Task 5)
  {
    name: 'information',
    scope: [DIALOG],
    open: async (page) => {
      await page.evaluate(() => window.fpb.get('fpbInfo').open());
      await dialogOpen(page);
    },
    each: eachInfoTab
  },
  {
    name: 'export dialog',
    scope: [DIALOG],
    aml: true,
    // the file name the check types
    data: ['con'],
    open: async (page) => {
      await page.evaluate(() => window.fpb.get('fpbFiles').export());
      await dialogOpen(page);
    },
    each: eachExportFormat
  },
  {
    name: 'open dialog',
    scope: [DIALOG],
    aml: true,
    open: async (page) => {
      await page.evaluate(() => window.fpb.get('fpbFiles').open());
      await dialogOpen(page);
    }
  },
  {
    name: 'start card',
    scope: ['.fpb-start-card'],
    model: 'empty',
    open: (page) => page.locator('.fpb-start-card').waitFor({ timeout: 3000 })
  },
  {
    name: 'AML file overview',
    scope: [DIALOG],
    aml: true,
    model: amlModel('Showcase-A-WaermetauscherMitRegelung.aml'),
    data: amlData(amlFile('Showcase-A-WaermetauscherMitRegelung.aml')).concat(['Showcase.aml']),
    // names and paths as the overview reads them from the file
    pageData: (page) => page.evaluate(() => {
      const found = [];
      const walk = (value) => {
        if (typeof value === 'string') {
          found.push(value);
        } else if (value && typeof value === 'object') {
          Object.keys(value).forEach((key) => walk(value[key]));
        }
      };
      walk(window.fpb.get('amlSupport').getOverview());
      return found;
    }),
    open: async (page) => {
      await page.evaluate(() => window.fpb.get('amlOverview').open());
      await dialogOpen(page);
    }
  },
  {
    name: 'messages of an AML import',
    scope: ['.fpb-notifications'],
    aml: true,
    noSwitch: true,
    model: amlModel('Showcase-A-WaermetauscherMitRegelung.aml'),
    data: amlData(amlFile('Showcase-A-WaermetauscherMitRegelung.aml')),
    open: (page) => page.locator('.fpb-notifications .fpb-notification-title').first().waitFor({ timeout: 3000 })
  },
  {
    name: 'message for a wrong file',
    scope: ['.fpb-notifications'],
    noSwitch: true,
    open: async (page) => {
      await page.evaluate(() => window.fpb.get('fpbFiles').openFile(new File(['x'], 'notes.txt', { type: 'text/plain' })));
      await page.locator('.fpb-notifications .fpb-notification-title').first().waitFor({ timeout: 3000 });
    }
  },
  questionSurface('new model', async (page) => {
    await page.locator('#newModelButton').click();
    await dialogOpen(page);
  }, { options: { showNewModel: true } }),
  questionSurface('delete a decomposed operator', (page) => askDelete(page, [IDS.decomposed])),
  questionSurface('delete two elements, one decomposed', (page) => askDelete(page, [IDS.decomposed, IDS.operator])),
  questionSurface('delete a boundary state', (page) => askDelete(page, [IDS.product], CHILD)),
  questionSurface('remove a decomposition', (page) => askDelete(page, [CHILD_LIMIT], CHILD)),
  questionSurface('delete with links from outside', async (page) => {
    await page.evaluate(({ main, id }) => window.fpb.setAmlLinks([{ processId: main, elementId: id, name: 'Prüfen', link: 'L1', owner: 'Plant' }]), { main: MAIN, id: IDS.operator });
    await askDelete(page, [IDS.operator]);
  }, { data: ['L1', 'Plant'] }),
  // model check, layers, read-only, import messages (Task 6)
  {
    name: 'model check list',
    scope: ['.fpb-validation-panel'],
    model: findingsModel(),
    open: async (page) => {
      await page.evaluate(() => window.fpb.get('fpbValidation').openPanel());
      await page.locator('.fpb-validation-panel.open').waitFor({ timeout: 3000 });
    },
    each: eachFilter
  },
  {
    name: 'model check markers',
    scope: ['.fpb-validation-marker'],
    model: findingsModel(),
    open: (page) => page.locator('.fpb-validation-marker').first().waitFor({ timeout: 3000 })
  },
  panelSurface('element outside the system limit', [IDS.energy], { model: findingsModel() }),
  {
    name: 'breadcrumbs',
    scope: ['.fpb-breadcrumbs'],
    open: async (page) => {
      await page.evaluate((layer) => window.fpb.switchProcess(layer), CHILD);
      await page.locator('.fpb-breadcrumbs:not([hidden])').waitFor({ timeout: 3000 });
    }
  },
  {
    name: 'layers card',
    scope: ['#layers'],
    open: async (page) => {
      await page.locator('#openLayerButton').click();
      await page.locator('#layers .fpb-layers:not([hidden])').waitFor({ timeout: 3000 });
    }
  },
  {
    name: 'toolbar and panel in read-only mode',
    scope: ['#layers', '#properties'],
    options: { readOnly: true },
    open: (page) => panelOf(page, [IDS.product])
  },
  {
    name: 'messages of a JSON import',
    scope: ['.fpb-notifications'],
    noSwitch: true,
    model: brokenModel(),
    data: ['ghost', 'twice', 'nowhere'],
    open: (page) => page.locator('.fpb-notifications .fpb-notification-title').first().waitFor({ timeout: 3000 })
  },
  questionSurface('state on the boundary', async (page) => {
    await page.evaluate(({ layer, id }) => {
      window.fpb.switchProcess(layer);
      const updater = window.fpb.get('shapeUpdater');
      const element = window.fpb.get('elementRegistry').get(id);
      updater._queueBoundary('stateMovedOnBoundary', { element, oldPosition: { x: element.x, y: element.y }, borderPosition: 'onUpperBorder' }, window.fpb.get('canvas').getRootElement());
      updater._askForBoundary();
    }, { layer: CHILD, id: IDS.product });
    await dialogOpen(page);
  })
];

/**
 * Surfaces of a phone (016f E2): the sheets. german.spec runs them with the
 * device of a phone.
 */
export const PHONE_SURFACES = [
  {
    name: 'sheet of the properties',
    scope: ['#sheets'],
    sheets: true,
    viewport: { width: 393, height: 727 },
    open: async (page) => {
      await page.evaluate((id) => window.fpb.select(id), IDS.product);
      await page.locator('#propertiesSheetButton').click();
      await page.locator('#sheets .fpb-sheet').waitFor({ timeout: 3000 });
    }
  },
  {
    name: 'sheet of the layers',
    scope: ['#sheets'],
    sheets: true,
    viewport: { width: 393, height: 727 },
    open: async (page) => {
      await page.locator('#openLayerButton').click();
      await page.locator('#sheets .fpb-sheet').waitFor({ timeout: 3000 });
    }
  },
  {
    name: 'sheet of the model check',
    scope: ['#sheets'],
    sheets: true,
    viewport: { width: 393, height: 727 },
    model: findingsModel(),
    open: async (page) => {
      await page.locator('#openValidationButton').click();
      await page.locator('#sheets .fpb-sheet').waitFor({ timeout: 3000 });
    }
  }
];

/** The surface with this name */
export const surface = (name) => {
  const found = SURFACES.find((s) => s.name === name);
  if (!found) {
    throw new Error('no surface ' + name);
  }
  return found;
};
