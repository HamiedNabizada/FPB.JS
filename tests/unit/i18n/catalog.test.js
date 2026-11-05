import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { parseSync } from '@babel/core';

import de from '../../../app/fpb/i18n/de.js';

/**
 * The German catalog against the code (016h T2, T13, Tests "Katalog
 * vollständig"): every key the code hands to translate() or marks with
 * markText() has a German entry, and no entry is left that nothing asks for
 * (a changed English text leaves one behind). Keys inside `throw` are errors
 * for developers and stay English (016h T10). The converter of the AML
 * module speaks English on purpose (016h V6).
 */

const ROOT = path.resolve(__dirname, '../../..');

// every file but the converter of the AML module (016h V6)
const ALL = ['app/fpb', 'src', 'app/app.js'];
const COVERED = ALL;
const EXCLUDED = ['app/fpb/aml/mapper'];
// calls whose first argument is a key: translate, markText, and msg, the
// helper of the model check and the importer for { template, args }
const NAMES = ['translate', '_translate', 'markText', 'msg'];
// calls of the importer whose every argument is a key (message, details, hint)
const ALL_ARGS = ['logWarning', 'handleDataStructureError', 'handleProjectDefinitionError',
  'handleVisualInformationError', 'handleDependencyError'];

/** The keys an argument names: a text, or both sides of `a ? 'x' : 'y'` */
function literals(node) {
  if (!node) {
    return [];
  }
  if (node.type === 'StringLiteral') {
    return [node.value];
  }
  if (node.type === 'TemplateLiteral' && node.expressions.length === 0) {
    return [node.quasis[0].value.cooked];
  }
  if (node.type === 'ConditionalExpression') {
    return literals(node.consequent).concat(literals(node.alternate));
  }
  return [];
}

const relative = (file) => path.relative(ROOT, file).split(path.sep).join('/');
const excluded = (file) => EXCLUDED.some((part) => relative(file) === part || relative(file).startsWith(part + '/'));

function files(entries) {
  const found = [];
  const walk = (file) => {
    if (excluded(file)) {
      return;
    }
    const stat = fs.statSync(file);
    if (stat.isDirectory()) {
      fs.readdirSync(file).forEach((name) => walk(path.join(file, name)));
    } else if (/\.jsx?$/.test(file)) {
      found.push(file);
    }
  };
  entries.forEach((entry) => walk(path.join(ROOT, entry)));
  return found;
}

/** The literal first arguments of translate(), _translate() and markText() */
function keysOf(file) {
  const ast = parseSync(fs.readFileSync(file, 'utf8'), {
    filename: file,
    configFile: false,
    babelrc: false,
    sourceType: 'module',
    parserOpts: { plugins: ['jsx'] }
  });
  const keys = [];
  const visit = (node, inThrow) => {
    if (!node || typeof node.type !== 'string') {
      return;
    }
    const throwing = inThrow || node.type === 'ThrowStatement';
    if (node.type === 'CallExpression' && !throwing) {
      const callee = node.callee;
      const name = callee.type === 'Identifier' ? callee.name
        : callee.type === 'MemberExpression' && !callee.computed ? callee.property.name : null;
      const first = node.arguments[0];
      // translateIn(translate, 'context', 'text'): the key is "context: text"
      const [, context, text] = node.arguments;
      if (name === 'translateIn' && context && text && context.type === 'StringLiteral' && text.type === 'StringLiteral') {
        keys.push(context.value + ': ' + text.value);
      }
      if (NAMES.indexOf(name) !== -1 && first) {
        keys.push(...literals(first));
      }
      if (ALL_ARGS.indexOf(name) !== -1) {
        node.arguments.forEach((argument) => keys.push(...literals(argument)));
      }
    }
    Object.keys(node).forEach((key) => {
      if (key === 'loc' || key.endsWith('Comments')) {
        return;
      }
      const value = node[key];
      if (Array.isArray(value)) {
        value.forEach((child) => visit(child, throwing));
      } else if (value && typeof value.type === 'string') {
        visit(value, throwing);
      }
    });
  };
  visit(ast.program, false);
  return keys;
}

function keysIn(entries) {
  const keys = new Map();
  files(entries).forEach((file) => {
    keysOf(file).forEach((key) => {
      if (!keys.has(key)) {
        keys.set(key, relative(file));
      }
    });
  });
  return keys;
}

describe('German catalog', () => {

  it('every key has a German entry', () => {
    const missing = [];
    keysIn(COVERED).forEach((file, key) => {
      if (!Object.prototype.hasOwnProperty.call(de, key)) {
        missing.push(file + ': ' + key);
      }
    });
    expect(missing).toEqual([]);
  });

  it('every German entry is used', () => {
    const used = keysIn(ALL);
    expect(Object.keys(de).filter((key) => !used.has(key))).toEqual([]);
  });

  it('no key stands twice in the catalog', () => {
    const source = fs.readFileSync(path.join(ROOT, 'app/fpb/i18n/de.js'), 'utf8');
    const keys = (source.match(/^  '(?:[^'\\]|\\.)*':/gm) || []).map((line) => line.trim());
    expect(keys.filter((key, i) => keys.indexOf(key) !== i)).toEqual([]);
  });

  it('every German entry keeps the placeholders of its key', () => {
    const placeholders = (text) => (text.match(/{[^}]+}/g) || []).sort();
    const broken = Object.keys(de).filter((key) => placeholders(key).join() !== placeholders(de[key]).join());
    expect(broken).toEqual([]);
  });
});
