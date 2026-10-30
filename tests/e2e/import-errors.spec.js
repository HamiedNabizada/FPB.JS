// tests/e2e/import-errors.spec.js
import { test, expect } from './support/test';
import { ImportPage } from './pages/ImportPage';
import { ModelBuilder } from './helpers/modelBuilder';

/**
 * Validation and error paths of the JSON importer (JSONImporter, ImportUtils,
 * ImportErrors), fed through the same event as the dialog and the API.
 *
 * Every test first loads a valid "old" model. A file the importer rejects must
 * fire `import.error` and leave that model untouched (data store AND canvas);
 * a file it can repair must load, with each repair named in `import.report`
 * (message, hint) as documented in FPB.JS_Docs/Import-Export.md.
 */

/** A small but complete model: 3 states, operator, resource, flows, usage. */
function smallModel(prefix = 'new', name = 'Neues Projekt') {
  const m = new ModelBuilder(name);
  const p = m.process(`${prefix}-root`, `${prefix} Systemgrenze`);
  const a = p.product('Rohteil', { x: 300, y: 75 });
  const e = p.state('fpb:Energy', 'Strom', { x: 450, y: 75 });
  const op = p.operator('Bearbeiten', { x: 250, y: 250 });
  const b = p.product('Fertigteil', { x: 300, y: 575 });
  const tr = p.resource('Maschine', { x: 800, y: 250 });
  const f1 = p.flow(a, op);
  const f2 = p.flow(e, op);
  const f3 = p.flow(op, b);
  const u = p.usage(op, tr);
  return { m, p, ids: { a, e, op, b, tr, f1, f2, f3, u } };
}

const processEntry = (data) => data.find((entry) => entry.process);
const systemLimitData = (entry) => entry.elementDataInformation.find((e) => e.$type === 'fpb:SystemLimit');

/** Import and collect what the importer says, until it is done or failed. */
async function attempt(page, data) {
  return page.evaluate((d) => new Promise((resolve) => {
    const bus = window.fpbjs.get('eventBus');
    const out = { errors: [], reports: [], done: 0, pageErrors: [] };
    let timer = null;
    const finish = () => {
      bus.off('import.error', onError);
      bus.off('import.report', onReport);
      bus.off('import.done', onDone);
      window.removeEventListener('error', onPageError);
      resolve(out);
    };
    const settle = () => {
      clearTimeout(timer);
      timer = setTimeout(finish, 600);
    };
    const onError = (e) => {
      out.errors.push({ message: e.message, details: e.details, errorType: e.errorType, timestamp: e.timestamp });
      settle();
    };
    const onReport = (e) => out.reports.push((e.warnings || []).map((w) => ({ message: w.message, details: w.details, hint: w.hint })));
    const onDone = () => {
      out.done++;
      settle();
    };
    const onPageError = (e) => out.pageErrors.push(String(e.message));
    bus.on('import.error', onError);
    bus.on('import.report', onReport);
    bus.on('import.done', onDone);
    window.addEventListener('error', onPageError);
    try {
      bus.fire('FPBJS.import', { data: d });
    } catch (error) {
      out.thrown = String(error && error.message);
    }
    timer = setTimeout(finish, 8000);
  }), data);
}

/** What the user has: data store content and what the canvas shows. */
async function snapshot(page) {
  return page.evaluate(() => {
    const entries = window.fpbjs.getProcesses();
    const project = entries.find((e) => e && e.$type === 'fpb:Project');
    return {
      project: project ? project.name : null,
      processes: entries.filter((e) => e && e.process).map((e) => e.process.id).sort(),
      root: window.fpbjs.get('canvas').getRootElement().id,
      canvas: window.fpbjs.get('elementRegistry')
        .filter((e) => e.type !== 'label' && e.businessObject && e.businessObject.$type !== 'fpb:Process')
        .map((e) => e.id).sort(),
    };
  });
}

async function withOldModel(page) {
  const importer = new ImportPage(page);
  await importer.goto();
  const old = await attempt(page, smallModel('old', 'Altes Projekt').m.build());
  expect(old.done).toBe(1);
  const before = await snapshot(page);
  expect(before.project).toBe('Altes Projekt');
  expect(before.root).toBe('old-root');
  return { importer, before };
}

const warnings = (result) => result.reports.flat();

test.describe('Import errors - rejected files leave the previous model untouched', () => {

  const rejected = [
    ['an object instead of an array', () => ({ project: 'x' }), 'INVALID_DATA_STRUCTURE', 'expected array'],
    ['null', () => null, 'INVALID_DATA_STRUCTURE', 'expected array'],
    ['a string', () => 'not a model', 'INVALID_DATA_STRUCTURE', 'expected array'],
    ['an empty array', () => [], 'INVALID_DATA_STRUCTURE', 'Empty data array'],
    ['no project definition', () => smallModel().m.build().slice(1), 'MISSING_PROJECT_DEFINITION', 'valid FPB.JS project structure'],
    ['a project without name', () => {
      const d = smallModel().m.build();
      delete d[0].name;
      return d;
    }, 'MISSING_PROJECT_DEFINITION', 'valid FPB.JS project structure'],
    ['a project without targetNamespace', () => {
      const d = smallModel().m.build();
      d[0].targetNamespace = '';
      return d;
    }, 'MISSING_PROJECT_DEFINITION', 'valid FPB.JS project structure'],
    ['a process without elementDataInformation', () => {
      const d = smallModel().m.build();
      delete processEntry(d).elementDataInformation;
      return d;
    }, 'MISSING_VISUAL_INFORMATION', 'data information'],
  ];

  for (const [title, make, errorType, detail] of rejected) {
    test(`rejects ${title}`, async ({ page }) => {
      const { before } = await withOldModel(page);

      const result = await attempt(page, make());

      expect(result.thrown).toBeUndefined();
      expect(result.pageErrors).toEqual([]);
      expect(result.done).toBe(0);
      expect(result.errors.length).toBeGreaterThanOrEqual(1);
      expect(result.errors[0]).toEqual(expect.objectContaining({ errorType }));
      expect(result.errors[0].message).toEqual(expect.any(String));
      expect(String(result.errors[0].details)).toContain(detail);
      expect(Date.parse(result.errors[0].timestamp)).not.toBeNaN();
      expect(await snapshot(page)).toEqual(before);
    });
  }

  /**
   * Structures the validation does not check for. They must still end as an
   * import error (whatever its type) with the previous model left alone.
   */
  const malformed = [
    ['a process without elementsContainer', (d) => {
      delete processEntry(d).process.elementsContainer;
    }],
    ['elementDataInformation that is not a list', (d) => {
      processEntry(d).elementDataInformation = { id: 'not-a-list' };
    }],
    ['a null entry after the project', (d) => {
      d.splice(1, 0, null);
    }],
    ['a null entry before the project', (d) => {
      d.unshift(null);
    }],
  ];

  const ERROR_TYPES = ['INVALID_DATA_STRUCTURE', 'MISSING_PROJECT_DEFINITION', 'MISSING_VISUAL_INFORMATION',
    'DEPENDENCY_RESOLUTION_FAILED', 'UNEXPECTED_ERROR'];

  for (const [title, spoil] of malformed) {
    test(`${title} fails as an import error, not a crash`, async ({ page }) => {
      const { before } = await withOldModel(page);
      const d = smallModel().m.build();
      spoil(d);

      const result = await attempt(page, d);

      expect(result.thrown).toBeUndefined();
      expect(result.pageErrors).toEqual([]);
      expect(result.done).toBe(0);
      expect(result.errors.length).toBeGreaterThanOrEqual(1);
      expect(ERROR_TYPES).toContain(result.errors[0].errorType);
      expect(result.errors[0].message).toEqual(expect.any(String));
      expect(result.errors[0].details).toEqual(expect.any(String));
      expect(await snapshot(page)).toEqual(before);
    });
  }

  test('shows a rejected file as an error notification', async ({ page }) => {
    await withOldModel(page);
    await attempt(page, smallModel().m.build().slice(1));

    const alert = page.locator('.fpb-notification--error');
    await expect(alert).toBeVisible();
    await expect(alert).toContainText('Import Error');
    await expect(alert).toContainText('No project definition found');
    await alert.getByRole('button', { name: 'Dismiss' }).click();
    await expect(alert).toHaveCount(0);
  });

  // final review 016e D1: errors stay until closed, but not past the next
  // import, which would otherwise look like it failed too
  test('the error of a rejected file goes when the next import starts', async ({ page }) => {
    await withOldModel(page);
    await attempt(page, smallModel().m.build().slice(1));
    const alert = page.locator('.fpb-notification--error');
    await expect(alert).toBeVisible();

    const result = await attempt(page, smallModel('fixed', 'Repariert').m.build());
    expect(result.done).toBe(1);
    await expect(alert).toHaveCount(0);
  });

  test('fires import.error once per rejected import', async ({ page }) => {
    await withOldModel(page);

    const result = await attempt(page, []);

    expect(result.errors).toHaveLength(1);
  });

  test('entries without a process key are skipped, the rest is imported', async ({ page }) => {
    await withOldModel(page);
    const d = smallModel().m.build();
    d.push({ comment: 'written by some other tool' });

    const result = await attempt(page, d);

    expect(result.errors).toEqual([]);
    expect(result.done).toBe(1);
    const after = await snapshot(page);
    expect(after.processes).toEqual(['new-root']);
    expect(after.root).toBe('new-root');
  });

});

test.describe('Import errors - model and canvas never go out of sync', () => {

  /**
   * Either the file is rejected (old model stays in store and on canvas) or it
   * is shown: a data store with the new processes behind a canvas that still
   * shows the old model is the half-imported state the import must not leave.
   */
  async function expectConsistent(page, before, result) {
    const after = await snapshot(page);
    if (result.errors.length > 0) {
      expect(after).toEqual(before);
    } else {
      expect(after.processes).toContain(after.root);
      expect(after.canvas.filter((id) => before.canvas.includes(id))).toEqual([]);
    }
  }

  test('a file with a project but no processes', async ({ page }) => {
    const { before } = await withOldModel(page);

    const result = await attempt(page, smallModel().m.build().slice(0, 1));

    expect(result.thrown).toBeUndefined();
    expect(result.errors.length + result.done).toBeGreaterThan(0);
    await expectConsistent(page, before, result);
  });

  test('a project without entryPoint', async ({ page }) => {
    const { before } = await withOldModel(page);
    const d = smallModel().m.build();
    delete d[0].entryPoint;

    const result = await attempt(page, d);

    expect(result.errors.length + result.done).toBeGreaterThan(0);
    await expectConsistent(page, before, result);
  });

  test('an entryPoint that names no process', async ({ page }) => {
    const { before } = await withOldModel(page);
    const d = smallModel().m.build();
    d[0].entryPoint = 'no-such-process';

    const result = await attempt(page, d);

    expect(result.errors.length + result.done).toBeGreaterThan(0);
    await expectConsistent(page, before, result);
  });

  for (const [title, spoil] of [
    ['an entryPoint that names no process', (d) => { d[0].entryPoint = 'no-such-process'; }],
    ['a project without entryPoint', (d) => { delete d[0].entryPoint; }],
  ]) {
    test(`${title} is never passed over in silence`, async ({ page }) => {
      // Rejected, or a layer of the new model is shown, or (documented) the
      // failed switch to the entry layer is named in the report.
      await withOldModel(page);
      const d = smallModel().m.build();
      spoil(d);

      const result = await attempt(page, d);

      expect(result.thrown).toBeUndefined();
      if (result.errors.length > 0) {
        expect(result.done).toBe(0);
        return;
      }
      expect(result.done).toBe(1);
      const after = await snapshot(page);
      if (!after.processes.includes(after.root)) {
        expect(warnings(result)).toEqual([expect.objectContaining({
          message: 'The entry layer could not be opened after the import',
          details: expect.any(String),
          hint: expect.stringContaining('Open a layer in the layer panel')
        })]);
      }
    });
  }

  test('duplicate element ids inside one process', async ({ page }) => {
    const { before } = await withOldModel(page);
    const { m, ids } = smallModel();
    const d = m.build();
    const entry = processEntry(d);
    const copy = JSON.parse(JSON.stringify(entry.elementDataInformation.find((e) => e.id === ids.a)));
    copy.name = 'Doppelt';
    entry.elementDataInformation.push(copy);
    systemLimitData(entry).elementsContainer.push(ids.a);

    const result = await attempt(page, d);

    expect(result.done + result.errors.length).toBeGreaterThan(0);
    await expectConsistent(page, before, result);
    if (result.done) {
      // the duplicate is named in the report and the model is on the canvas
      expect(warnings(result).some((w) => w.message.includes(ids.a))).toBe(true);
      expect((await snapshot(page)).canvas).toEqual(expect.arrayContaining(Object.values(ids)));
    }
  });

});

test.describe('Import errors - repaired files load with a report', () => {

  async function importRepaired(page, data) {
    await withOldModel(page);
    const result = await attempt(page, data);
    expect(result.thrown).toBeUndefined();
    expect(result.pageErrors).toEqual([]);
    expect(result.errors).toEqual([]);
    expect(result.done).toBe(1);
    const after = await snapshot(page);
    expect(after.project).toBe('Neues Projekt');
    expect(after.root).toBe('new-root');
    return { result, after };
  }

  test('a flow with a dangling source is removed and reported', async ({ page }) => {
    const { m, ids } = smallModel();
    const d = m.build();
    processEntry(d).elementDataInformation.find((e) => e.id === ids.f1).sourceRef = 'ghost-state';

    const { result, after } = await importRepaired(page, d);

    expect(warnings(result)).toEqual([{
      message: 'Flow from ghost-state to Bearbeiten references a missing source (ghost-state) - removed',
      details: null,
      hint: 'Add the source element with this id to the process or delete the connection from the file.'
    }]);
    expect(after.canvas).not.toContain(ids.f1);
    expect(after.canvas).toEqual(expect.arrayContaining([ids.a, ids.op, ids.f2, ids.f3, ids.u]));
    // the operator no longer lists the removed flow
    const incoming = await page.evaluate((id) => window.fpbjs.get('elementRegistry').get(id).businessObject.incoming
      .map((x) => (typeof x === 'string' ? 'STRING:' + x : x.id)), ids.op);
    expect(incoming.sort()).toEqual([ids.f2].sort());
  });

  test('a usage with a dangling target is removed and reported', async ({ page }) => {
    const { m, ids } = smallModel();
    const d = m.build();
    processEntry(d).elementDataInformation.find((e) => e.id === ids.u).targetRef = 'ghost-resource';

    const { result, after } = await importRepaired(page, d);

    expect(warnings(result)).toEqual([expect.objectContaining({
      message: 'Usage from Bearbeiten to ghost-resource references a missing target (ghost-resource) - removed',
      hint: expect.stringContaining('Add the target element')
    })]);
    expect(after.canvas).not.toContain(ids.u);
    expect(after.canvas).toContain(ids.tr);
  });

  test('an id in a container without data is skipped and reported', async ({ page }) => {
    const { m } = smallModel();
    const d = m.build();
    systemLimitData(processEntry(d)).elementsContainer.push('ghost-element');
    processEntry(d).process.elementsContainer.push('ghost-outer');

    const { result } = await importRepaired(page, d);

    const messages = warnings(result).map((w) => w.message);
    expect(messages).toContain('Element ghost-element is listed in a container but has no data - skipped');
    expect(messages).toContain('Element ghost-outer is listed in a container but has no data - skipped');
    warnings(result).forEach((w) => expect(w.hint).toContain('elementDataInformation'));
  });

  test('an unknown sub-process in consistsOfProcesses is dropped and reported', async ({ page }) => {
    const { m } = smallModel();
    const d = m.build();
    processEntry(d).process.consistsOfProcesses = ['ghost-process'];

    const { result } = await importRepaired(page, d);

    expect(warnings(result)).toEqual([expect.objectContaining({
      message: 'Process new-root lists missing sub-process ghost-process - dropped',
      hint: expect.stringContaining('consistsOfProcesses')
    })]);
    const children = await page.evaluate(() => window.fpbjs.get('canvas').getRootElement().businessObject.consistsOfProcesses);
    expect(children).toEqual([]);
  });

  test('a decomposedView to a missing process is cleared and reported', async ({ page }) => {
    const { m, ids } = smallModel();
    const d = m.build();
    processEntry(d).elementDataInformation.find((e) => e.id === ids.op).decomposedView = 'ghost-process';

    const { result } = await importRepaired(page, d);

    expect(warnings(result)).toEqual([expect.objectContaining({
      message: 'ProcessOperator "Bearbeiten" references a missing sub-process (ghost-process) - decomposition link cleared'
    })]);
    const view = await page.evaluate((id) => window.fpbjs.get('elementRegistry').get(id).businessObject.decomposedView, ids.op);
    expect(view).toBeNull();
  });

  test('a missing tandem partner is dropped and reported', async ({ page }) => {
    const m = new ModelBuilder('Neues Projekt');
    const p = m.process('new-root', 'Verzweigung');
    const op = p.operator('Teilen', { x: 250, y: 200 });
    const a = p.product('Ein', { x: 300, y: 75 });
    const b1 = p.product('Aus1', { x: 200, y: 575 });
    const b2 = p.product('Aus2', { x: 400, y: 575 });
    p.flow(a, op);
    const [pf1, pf2] = p.branch(op, [b1, b2], 'fpb:ParallelFlow');
    p.item(pf1).inTandemWith.push('ghost-flow');

    const { result } = await importRepaired(page, m.build());

    expect(warnings(result)).toEqual([expect.objectContaining({
      message: 'ParallelFlow from Teilen to Aus1 lists a missing tandem partner (ghost-flow) - dropped'
    })]);
    const tandem = await page.evaluate((id) => window.fpbjs.get('elementRegistry').get(id).businessObject.inTandemWith
      .map((x) => (typeof x === 'string' ? 'STRING:' + x : x.id)), pf1);
    expect(tandem).toEqual([pf2]);
  });

  test('a file without any visual information is laid out and reported', async ({ page }) => {
    const { m, ids } = smallModel();

    const { result, after } = await importRepaired(page, m.build({ layout: false }));

    expect(warnings(result)).toEqual([expect.objectContaining({
      message: 'Process "new Systemgrenze" carried no layout - all 10 elements were arranged automatically',
      hint: 'Move elements as needed and download the file again to keep the layout.'
    })]);
    expect(after.canvas).toEqual(expect.arrayContaining(Object.values(ids)));
  });

  test('a file with one shape position missing is completed and reported', async ({ page }) => {
    const { m, ids } = smallModel();
    const d = m.build();
    processEntry(d).elementVisualInformation = processEntry(d).elementVisualInformation.filter((v) => v.id !== ids.e);

    const { result, after } = await importRepaired(page, d);

    const [warning] = warnings(result);
    expect(warning.message).toMatch(/^Process "new Systemgrenze" carried an incomplete layout - \d+ elements were placed automatically$/);
    expect(after.canvas).toContain(ids.e);
    // the other shapes kept their position
    const pos = await page.evaluate((id) => {
      const s = window.fpbjs.get('elementRegistry').get(id);
      return { x: s.x, y: s.y };
    }, ids.op);
    expect(pos).toEqual({ x: 250, y: 250 });
  });

  test('connections without waypoints are routed without a layout note for shapes', async ({ page }) => {
    const { m, ids } = smallModel();

    const { result, after } = await importRepaired(page, m.build({ layout: 'shapes' }));

    expect(warnings(result)).toEqual([expect.objectContaining({
      message: expect.stringContaining('carried an incomplete layout')
    })]);
    const routes = await page.evaluate((list) => list.map((id) => window.fpbjs.get('elementRegistry').get(id).waypoints.length),
      [ids.f1, ids.f2, ids.f3, ids.u]);
    routes.forEach((n) => expect(n).toBeGreaterThanOrEqual(2));
    expect(after.canvas).toEqual(expect.arrayContaining(Object.values(ids)));
  });

  test('elements without names and identification still load', async ({ page }) => {
    const { m, ids } = smallModel();
    const d = m.build();
    processEntry(d).elementDataInformation.forEach((e) => {
      delete e.name;
      delete e.identification;
    });

    const { after } = await importRepaired(page, d);

    expect(after.canvas).toEqual(expect.arrayContaining(Object.values(ids)));
    // no empty label is drawn for a nameless element
    const emptyLabels = await page.evaluate(() => window.fpbjs.get('elementRegistry')
      .filter((e) => e.type === 'label' && !(e.businessObject && e.businessObject.name)).length);
    expect(emptyLabels).toBe(0);
  });

  test('a characteristic with nothing but its type gets empty parts', async ({ page }) => {
    const { m, ids } = smallModel();
    const d = m.build();
    processEntry(d).elementDataInformation.find((e) => e.id === ids.a).characteristics = [{ $type: 'fpbch:Characteristics' }];

    await importRepaired(page, d);

    const ch = await page.evaluate((id) => {
      const c = window.fpbjs.get('elementRegistry').get(id).businessObject.characteristics;
      return c.map((x) => ({
        category: x.category.$type,
        descriptive: x.descriptiveElement.$type,
        setpoint: x.descriptiveElement.setpointValue.$type,
        limits: x.descriptiveElement.validityLimits.length,
        actual: x.descriptiveElement.actualValues.length,
        relational: x.relationalElement.$type,
      }));
    }, ids.a);
    expect(ch).toEqual([{
      category: 'fpb:Identification',
      descriptive: 'fpbch:DescriptiveElement',
      setpoint: 'fpbch:ValueWithUnit',
      limits: 0,
      actual: 0,
      relational: 'fpbch:RelationalElement'
    }]);
  });

  const readCharacteristic = (page, id) => page.evaluate((elementId) => {
    const c = window.fpbjs.get('elementRegistry').get(elementId).businessObject.characteristics[0].descriptiveElement;
    return {
      actual: c.actualValues.map((v) => `${v.value} ${v.unit}`),
      limits: c.validityLimits.map((l) => `${l.limitType}:${l.from}-${l.to}`),
    };
  }, id);

  test('actualValues as a single object become a list of one', async ({ page }) => {
    const { m, p, ids } = smallModel();
    p.characteristic(ids.a, { actualValues: { $type: 'fpbch:ValueWithUnit', value: '5', unit: 'K' } });

    await importRepaired(page, m.build());

    expect((await readCharacteristic(page, ids.a)).actual).toEqual(['5 K']);
  });

  test('actualValues as a list keep every entry, entries without type are dropped', async ({ page }) => {
    const { m, p, ids } = smallModel();
    p.characteristic(ids.a, {
      actualValues: [
        { $type: 'fpbch:ValueWithUnit', value: '1', unit: 'mm' },
        { value: 'untyped', unit: '?' },
        null,
        { $type: 'fpbch:ValueWithUnit', value: '2', unit: 'mm' },
      ]
    });

    await importRepaired(page, m.build());

    expect((await readCharacteristic(page, ids.a)).actual).toEqual(['1 mm', '2 mm']);
  });

  test('validityLimits as a single object become a list of one', async ({ page }) => {
    const { m, p, ids } = smallModel();
    p.characteristic(ids.op, { validityLimits: { $type: 'fpbch:ValidityLimits', limitType: 'max', from: 0, to: 99 } });

    await importRepaired(page, m.build());

    expect((await readCharacteristic(page, ids.op)).limits).toEqual(['max:0-99']);
  });

  test('an element of an unknown type is reported, not dropped silently', async ({ page }) => {
    const { m } = smallModel();
    const d = m.build();
    processEntry(d).elementDataInformation.push({ $type: 'fpb:Unicorn', id: 'unicorn-1', name: 'Einhorn' });
    processEntry(d).process.elementsContainer.push('unicorn-1');

    const { result } = await importRepaired(page, d);

    expect(warnings(result).some((w) => w.message.includes('unicorn-1'))).toBe(true);
  });

  test('an element of an unknown type inside the SystemLimit is reported, not dropped silently', async ({ page }) => {
    const { m } = smallModel();
    const d = m.build();
    processEntry(d).elementDataInformation.push({ $type: 'fpb:Unicorn', id: 'unicorn-2', name: 'Einhorn' });
    systemLimitData(processEntry(d)).elementsContainer.push('unicorn-2');

    const { result, after } = await importRepaired(page, d);

    expect(after.canvas).not.toContain('unicorn-2');
    expect(warnings(result).some((w) => w.message.includes('unicorn-2'))).toBe(true);
  });

  test('elementVisualInformation that is not a list counts as missing layout', async ({ page }) => {
    const { m, ids } = smallModel();
    const d = m.build();
    processEntry(d).elementVisualInformation = { id: 'not-a-list' };

    const { result, after } = await importRepaired(page, d);

    expect(warnings(result)).toEqual([expect.objectContaining({
      message: 'Process "new Systemgrenze" carried no layout - all 10 elements were arranged automatically'
    })]);
    expect(after.canvas).toEqual(expect.arrayContaining(Object.values(ids)));
  });

  test('an element without $type is reported by its own id', async ({ page }) => {
    const { m, ids } = smallModel();
    const d = m.build();
    delete processEntry(d).elementDataInformation.find((e) => e.id === ids.e).$type;

    const { result } = await importRepaired(page, d);

    const own = warnings(result).filter((w) => w.message.includes(ids.e) && !/^Flow /.test(w.message));
    expect(own.length).toBeGreaterThan(0);
  });

});

test.describe('Import errors - the caller keeps its data', () => {

  async function unchanged(page, data) {
    return page.evaluate((d) => new Promise((resolve) => {
      const before = JSON.stringify(d);
      const bus = window.fpbjs.get('eventBus');
      const end = () => resolve(JSON.stringify(d) === before);
      bus.once('import.done', () => setTimeout(end, 100));
      bus.once('import.error', () => setTimeout(end, 100));
      bus.fire('FPBJS.import', { data: d });
      setTimeout(end, 8000);
    }), data);
  }

  test('a file that needs layout is not modified', async ({ page }) => {
    await new ImportPage(page).goto();
    expect(await unchanged(page, smallModel().m.build({ layout: false }))).toBe(true);
  });

  test('a file with dangling references is not modified', async ({ page }) => {
    await new ImportPage(page).goto();
    const { m, ids } = smallModel();
    const d = m.build();
    processEntry(d).elementDataInformation.find((e) => e.id === ids.f1).targetRef = 'ghost';
    systemLimitData(processEntry(d)).elementsContainer.push('ghost-element');
    expect(await unchanged(page, d)).toBe(true);
  });

  test('a rejected file is not modified', async ({ page }) => {
    await new ImportPage(page).goto();
    expect(await unchanged(page, smallModel().m.build().slice(1))).toBe(true);
  });

  test('data with cycles and functions is copied, imported and left alone', async ({ page }) => {
    const importer = new ImportPage(page);
    await importer.goto();
    const result = await page.evaluate((d) => new Promise((resolve) => {
      // a cycle makes JSON copying fail, the importer then copies structurally
      d[0].self = d[0];
      d[0].helper = () => 42;
      const entry = d.find((e) => e.process);
      const counts = () => d.map((e) => (e.elementDataInformation || []).length + (e.elementVisualInformation || []).length);
      const before = counts();
      const bus = window.fpbjs.get('eventBus');
      const out = { errors: [] };
      bus.once('import.error', (e) => out.errors.push(e.message));
      bus.once('import.done', () => setTimeout(() => {
        out.sameCounts = JSON.stringify(counts()) === JSON.stringify(before);
        out.cycleKept = d[0].self === d[0];
        out.functionKept = typeof d[0].helper === 'function';
        out.idsStillStrings = entry.process.elementsContainer.every((x) => typeof x === 'string');
        out.root = window.fpbjs.get('canvas').getRootElement().id;
        resolve(out);
      }, 100));
      bus.fire('FPBJS.import', { data: d });
      setTimeout(() => resolve(out), 8000);
    }), smallModel().m.build());

    expect(result).toEqual({
      errors: [],
      sameCounts: true,
      cycleKept: true,
      functionKept: true,
      idsStillStrings: true,
      root: 'new-root'
    });
  });

  test('the same object imported twice gives the same model', async ({ page }) => {
    await new ImportPage(page).goto();
    const ids = await page.evaluate((d) => {
      const bus = window.fpbjs.get('eventBus');
      const once = () => new Promise((resolve) => {
        bus.once('import.done', () => setTimeout(() => resolve(window.fpbjs.get('elementRegistry')
          .filter((e) => e.type !== 'label').map((e) => `${e.id}@${e.x},${e.y}`).sort()), 100));
        bus.fire('FPBJS.import', { data: d });
      });
      return once().then((first) => once().then((second) => ({ first, second })));
    }, smallModel().m.build({ layout: false }));

    expect(ids.first.length).toBeGreaterThan(5);
    expect(ids.second).toEqual(ids.first);
  });

});
