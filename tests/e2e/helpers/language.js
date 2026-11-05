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
        found.add(value.trim());
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
    const roots = scope ? scope.flatMap((selector) => [...document.querySelectorAll(selector)]) : [document.body];
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
    roots.flatMap(withAttributes).forEach((element) => {
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
    const roots = scope ? scope.flatMap((selector) => [...document.querySelectorAll(selector)]) : [document.body];
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
    roots.flatMap(withAttributes).forEach((element) => {
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
