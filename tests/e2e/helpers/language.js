// tests/e2e/helpers/language.js
import { openLibraryPage, createModeler, importModel } from '../library/libPage';
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
  const found = new Set(['Deutsch', 'English']);
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
export async function createMarkedModeler(page, { options = {}, aml = false } = {}) {
  await page.evaluate(async ({ options, aml }) => {
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
    const marked = {
      translate: ['value', (template, replacements) => (typeof template === 'string'
        ? markTemplate(template, replacements)
        : template)]
    };
    const opts = Object.assign({
      container: document.getElementById('modeler'),
      propertiesContainer: document.getElementById('properties'),
      layerContainer: document.getElementById('layers')
    }, options);
    opts.additionalModules = [].concat(aml ? [window.FpbJSAml.AmlModule] : [], [marked]);
    window.fpb = await window.FpbJS.createFpbModeler(opts);
  }, { options, aml });
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
  if (marked) {
    await createMarkedModeler(page, { options, aml: Boolean(surface.aml) });
  } else {
    options.language = language;
    await createModeler(page, { panels: true, options, aml: Boolean(surface.aml) });
  }
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
      data.forEach((value) => {
        rest = rest.split(value).join(' ');
      });
      return rest;
    };
    const letters = /[A-Za-zÄÖÜäöüß]{2,}/;
    const found = [];

    roots.forEach((root) => {
      strip(root.innerText || root.textContent || '').split('\n').forEach((line) => {
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
