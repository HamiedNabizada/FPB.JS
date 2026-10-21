// tests/e2e/xml-import.spec.js
import { test, expect } from './support/test';
import fs from 'fs';
import path from 'path';
import { ImportPage } from './pages/ImportPage';
import { ModelBuilder } from './helpers/modelBuilder';
import { exportiere, nachIds } from './helpers/modelExport';
import { openImportDialog, dropFile, pressImport, importButton, exportViaDialog } from './helpers/importDialog';

/**
 * XML import through the import dialog (XMLMapper._convertXMLtoJSON and the
 * XML branch of ImportModal): hand written and foreign VDI 3682 files, broken
 * files, and the export -> import round trip for every element and flow type.
 *
 * Runs in the browser on purpose: the `visual:` namespace does not survive
 * happy-dom, see xml-roundtrip.spec.js.
 */

const fixture = (name) => fs.readFileSync(path.join(__dirname, 'fixtures', 'import', name), 'utf8');

async function start(page) {
  await page.setViewportSize({ width: 1600, height: 1000 });
  const importer = new ImportPage(page);
  await importer.goto();
  return importer;
}

async function importXml(page, xml, name = 'modell.xml') {
  await openImportDialog(page);
  expect(await dropFile(page, xml, name, 'text/xml')).toBe(true);
  await expect(page.locator('.modal.show .fileLabel')).toHaveText(name);
  await expect(importButton(page)).toBeEnabled();
  return pressImport(page);
}

/** Shape, connection and business data of one element on the canvas. */
const element = (page, id) => page.evaluate((elementId) => {
  const e = window.fpbjs.get('elementRegistry').get(elementId);
  if (!e) return null;
  const bo = e.businessObject;
  const ref = (x) => (x && typeof x === 'object' ? x.id : x);
  return {
    type: bo.$type,
    name: bo.name,
    box: e.waypoints ? null : { x: e.x, y: e.y, width: e.width, height: e.height },
    waypoints: e.waypoints ? e.waypoints.map((p) => [p.x, p.y]) : null,
    source: e.source ? e.source.id : null,
    target: e.target ? e.target.id : null,
    sourceRef: ref(bo.sourceRef),
    targetRef: ref(bo.targetRef),
    inTandemWith: (bo.inTandemWith || []).map(ref).sort(),
    isAssignedTo: (bo.isAssignedTo || []).map(ref).sort(),
    identification: bo.identification ? {
      shortName: bo.identification.shortName,
      longName: bo.identification.longName,
      versionNumber: bo.identification.versionNumber,
      revisionNumber: bo.identification.revisionNumber,
    } : null,
  };
}, id);

const characteristics = (page, id) => page.evaluate((elementId) => {
  const bo = window.fpbjs.get('elementRegistry').get(elementId).businessObject;
  return (bo.characteristics || []).map((c) => ({
    category: c.category.shortName,
    setpoint: `${c.descriptiveElement.setpointValue.value} ${c.descriptiveElement.setpointValue.unit}`,
    process: c.descriptiveElement.valueDeterminationProcess,
    representivity: c.descriptiveElement.representivity,
    limits: c.descriptiveElement.validityLimits.map((l) => `${l.limitType}:${l.from}-${l.to}`),
    actual: c.descriptiveElement.actualValues.map((v) => `${v.value} ${v.unit}`),
    relational: [c.relationalElement.view, c.relationalElement.model, c.relationalElement.regulationsForRelationalGeneration],
  }));
}, id);

const storeState = (page) => page.evaluate(() => {
  const entries = window.fpbjs.getProcesses();
  const project = entries.find((e) => e && e.$type === 'fpb:Project');
  return {
    project: project && project.name,
    namespace: project && project.targetNamespace,
    processes: entries.filter((e) => e && e.process).map((e) => e.process.id).sort(),
    root: window.fpbjs.get('canvas').getRootElement().id,
  };
});

test.describe('XML import - hand written files', () => {

  test('a complete hand written file imports with all element types, positions and waypoints', async ({ page }) => {
    await start(page);

    const outcome = await importXml(page, fixture('handgeschrieben.xml'));

    expect(outcome).toEqual({ done: 1, errors: [], warnings: [] });
    expect(await storeState(page)).toEqual({
      project: 'Handgeschrieben',
      namespace: 'http://example.org/fpb',
      processes: ['P1'],
      root: 'P1',
    });

    expect(await element(page, 'SL1')).toEqual(expect.objectContaining({
      type: 'fpb:SystemLimit', name: 'Fraesen', box: { x: 100, y: 100, width: 600, height: 500 }
    }));
    expect((await element(page, 'S1'))).toEqual(expect.objectContaining({
      type: 'fpb:Product',
      name: 'Rohteil',
      box: { x: 175, y: 75, width: 50, height: 50 },
      identification: { shortName: 'Rohteil', longName: 'Rohteil aus Aluminium', versionNumber: '2', revisionNumber: '1' },
      isAssignedTo: ['PO1'],
    }));
    expect((await element(page, 'S2')).type).toBe('fpb:Energy');
    expect((await element(page, 'S3')).type).toBe('fpb:Information');
    expect((await element(page, 'PO1'))).toEqual(expect.objectContaining({
      type: 'fpb:ProcessOperator', name: 'Fraesen', box: { x: 325, y: 300, width: 150, height: 80 }
    }));
    expect((await element(page, 'TR1'))).toEqual(expect.objectContaining({
      type: 'fpb:TechnicalResource', name: 'Fraesmaschine', box: { x: 800, y: 300, width: 150, height: 80 },
      isAssignedTo: ['PO1'],
    }));

    expect(await element(page, 'F1')).toEqual(expect.objectContaining({
      type: 'fpb:Flow', source: 'S1', target: 'PO1',
      waypoints: [[200, 125], [200, 320], [325, 320]],
    }));
    const f4 = await element(page, 'F4');
    const f5 = await element(page, 'F5');
    expect(f4).toEqual(expect.objectContaining({ type: 'fpb:ParallelFlow', source: 'PO1', target: 'S4', inTandemWith: ['F5'] }));
    expect(f5).toEqual(expect.objectContaining({ type: 'fpb:ParallelFlow', source: 'PO1', target: 'S5', inTandemWith: ['F4'] }));
    expect(f4.waypoints).toEqual([[400, 380], [400, 480], [250, 480], [250, 575]]);
    expect(await element(page, 'U1')).toEqual(expect.objectContaining({
      type: 'fpb:Usage', source: 'PO1', target: 'TR1', waypoints: [[475, 340], [800, 340]]
    }));

    expect(await characteristics(page, 'S1')).toEqual([{
      category: 'Laenge',
      setpoint: '100 mm',
      process: 'Messung',
      representivity: 'Stichprobe',
      limits: ['range:90-110'],
      actual: ['101 mm', '99 mm'],
      relational: ['geometrisch', 'CAD', 'ISO 2768'],
    }]);
  });

  test('a file with only the logical structure is laid out automatically', async ({ page }) => {
    await start(page);

    const outcome = await importXml(page, fixture('ohne-grafik.xml'));

    expect(outcome.errors).toEqual([]);
    expect(outcome.done).toBe(1);
    expect(outcome.warnings).toEqual([expect.objectContaining({
      message: expect.stringContaining('"Montage" carried no layout')
    })]);
    expect(await storeState(page)).toEqual(expect.objectContaining({ project: 'Ohne Grafik', root: 'P1' }));

    // a state without stateType is a product, a missing shortName an empty name
    expect((await element(page, 'B')).type).toBe('fpb:Product');
    expect((await element(page, 'A')).name).toBe('');
    expect((await element(page, 'Z')).type).toBe('fpb:Information');

    // flows without flowContainer are plain flows between the right elements
    const flows = { FA: ['A', 'OP1'], FB: ['B', 'OP1'], FZ1: ['OP1', 'Z'], FZ2: ['Z', 'OP2'], FC: ['OP2', 'C'] };
    for (const [id, [source, target]] of Object.entries(flows)) {
      expect(await element(page, id), id).toEqual(expect.objectContaining({ type: 'fpb:Flow', source, target }));
    }

    // inputs on the upper edge, the output on the lower edge, the rest inside
    const sl = (await element(page, 'SL1')).box;
    const centerY = async (id) => {
      const b = (await element(page, id)).box;
      return b.y + b.height / 2;
    };
    for (const id of ['A', 'B']) {
      expect(Math.abs(await centerY(id) - sl.y), id).toBeLessThanOrEqual(30);
    }
    expect(Math.abs(await centerY('C') - (sl.y + sl.height))).toBeLessThanOrEqual(30);
    const z = (await element(page, 'Z')).box;
    expect(z.y).toBeGreaterThan(sl.y + 30);
    expect(z.y + z.height).toBeLessThan(sl.y + sl.height - 30);
  });

  test('flows of a positioned file without flowContainer still touch their elements', async ({ page }) => {
    // Shapes carry positions, the optional flowContainer (waypoints, flow type)
    // is missing: the flows must be drawn between their ends.
    await start(page);
    const xml = fixture('handgeschrieben.xml').replace(/<flowContainer>[\s\S]*<\/flowContainer>/, '');

    const outcome = await importXml(page, xml);
    expect(outcome.errors).toEqual([]);

    const near = (point, box) => point[0] >= box.x - 2 && point[0] <= box.x + box.width + 2
      && point[1] >= box.y - 2 && point[1] <= box.y + box.height + 2;
    for (const id of ['F1', 'F2', 'F3', 'F4', 'F5']) {
      const flow = await element(page, id);
      const source = (await element(page, flow.source)).box;
      const target = (await element(page, flow.target)).box;
      expect(near(flow.waypoints[0], source), `${id} starts at its source`).toBe(true);
      expect(near(flow.waypoints[flow.waypoints.length - 1], target), `${id} ends at its target`).toBe(true);
    }
  });

  test('two processes whose ids match an operator become a decomposition', async ({ page }) => {
    await start(page);
    const child = `
  <process id="PO1">
    <systemLimit id="SL2" name="Fraesen im Detail" visual:x="100" visual:y="100" visual:width="400" visual:height="400"/>
    <states>
      <state stateType="product" visual:x="175" visual:y="75" visual:width="50" visual:height="50">
        <identification uniqueIdent="S1" shortName="Rohteil"/>
        <flows><flow id="G1"><entry id="S1"/><exit id="OPA"/></flow></flows>
      </state>
      <state stateType="product" visual:x="175" visual:y="475" visual:width="50" visual:height="50">
        <identification uniqueIdent="S4" shortName="Fertigteil"/>
        <flows><flow id="G2"><entry id="OPA"/><exit id="S4"/></flow></flows>
      </state>
    </states>
    <processOperators>
      <processOperator visual:x="125" visual:y="260" visual:width="150" visual:height="80">
        <identification uniqueIdent="OPA" shortName="Schruppen"/>
      </processOperator>
    </processOperators>
    <flowContainer>
      <flow id="G1" flowType="flow" visual:waypoints="200,125 200,260"/>
      <flow id="G2" flowType="flow" visual:waypoints="200,340 200,475"/>
    </flowContainer>
  </process>
</project>`;
    const xml = fixture('handgeschrieben.xml').replace('</project>', child);

    const outcome = await importXml(page, xml);

    expect(outcome.errors).toEqual([]);
    expect(outcome.warnings).toEqual([]);
    expect((await storeState(page)).processes).toEqual(['P1', 'PO1']);
    const links = await page.evaluate(() => {
      const entries = window.fpbjs.getProcesses().filter((e) => e && e.process);
      const childEntry = entries.find((e) => e.process.id === 'PO1');
      const operator = window.fpbjs.get('elementRegistry').get('PO1').businessObject;
      return {
        decomposedView: operator.decomposedView && operator.decomposedView.id,
        isDecomposed: childEntry.process.isDecomposedProcessOperator && childEntry.process.isDecomposedProcessOperator.id,
        parent: childEntry.process.parent && (childEntry.process.parent.id || childEntry.process.parent),
      };
    });
    expect(links).toEqual({ decomposedView: 'PO1', isDecomposed: 'PO1', parent: 'P1' });
  });

});

test.describe('XML import - broken files', () => {

  async function expectRejectedFile(page, xml, name = 'kaputt.xml') {
    await start(page);
    const before = await storeState(page);
    await openImportDialog(page);
    await dropFile(page, xml, name, 'text/xml');

    const alert = page.locator('.alert-danger');
    await expect(alert).toBeVisible();
    await expect(alert).toContainText('Invalid file format');
    await alert.locator('summary').click();
    await expect(alert).toContainText('File format not recognized');
    // nothing was handed to the importer
    expect(await storeState(page)).toEqual(before);
  }

  test('malformed XML is refused with an error', async ({ page }) => {
    await expectRejectedFile(page, '<project xmlns="http://www.vdivde.de/3682"><process id="P1"><states></process>');
  });

  test('XML with a foreign root element is refused', async ({ page }) => {
    await expectRejectedFile(page, '<?xml version="1.0"?><definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"><process id="P1"/></definitions>');
  });

  test('a <project> root in the wrong namespace is refused', async ({ page }) => {
    await expectRejectedFile(page, '<project xmlns="http://example.org/other"><projectInformation entryPoint="P1" name="x"/></project>');
  });

  test('a VDI 3682 file without projectInformation fails in the importer', async ({ page }) => {
    await start(page);
    const xml = fixture('handgeschrieben.xml').replace(/<projectInformation[^>]*\/>/, '');

    const outcome = await importXml(page, xml);

    expect(outcome.done).toBe(0);
    expect(outcome.errors[0]).toEqual(expect.objectContaining({ errorType: 'MISSING_PROJECT_DEFINITION' }));
    expect((await storeState(page)).processes).toEqual([]);
  });

  test('projectInformation without attributes falls back to defaults', async ({ page }) => {
    await start(page);
    const xml = fixture('handgeschrieben.xml')
      .replace(/<projectInformation[^>]*\/>/, '<projectInformation/>');

    const outcome = await importXml(page, xml);

    // entryPoint defaults to "main-process", which is not in the file
    expect(outcome.errors).toEqual([]);
    const state = await storeState(page);
    expect(state.project).toBe('Imported Project');
    expect(state.namespace).toBe('http://www.vdivde.de/3682');
    expect(state.processes).toEqual(['P1']);
    // the process is shown, or the report says why not
    if (state.root !== 'P1') {
      expect(outcome.warnings).toEqual([expect.objectContaining({
        message: 'The entry layer could not be opened after the import'
      })]);
    }
  });

  test('a foreign file with unusual parts: defaults for what is missing, nothing invented', async ({ page }) => {
    await start(page);
    const xml = fixture('fremd-ungewoehnlich.xml');

    const outcome = await importXml(page, xml);

    expect(outcome.errors).toEqual([]);
    expect(outcome.done).toBe(1);
    // only the usage came without waypoints
    expect(outcome.warnings).toEqual([expect.objectContaining({
      message: 'Process "Grenze" carried an incomplete layout - 1 elements were placed automatically'
    })]);
    expect(await storeState(page)).toEqual({ project: 'Seltsam', namespace: 'http://example.org/x', processes: ['P1'], root: 'P1' });

    // an unknown stateType is a product; a state without identification gets an id, no name
    expect(await element(page, 'S1')).toEqual(expect.objectContaining({ type: 'fpb:Product', name: 'Roh', isAssignedTo: ['PO1'] }));
    const nameless = await page.evaluate(() => window.fpbjs.get('elementRegistry')
      .filter((e) => e.businessObject && e.businessObject.$type === 'fpb:Energy')
      .map((e) => ({ id: e.id, name: e.businessObject.name, ident: e.businessObject.identification.uniqueIdent })));
    expect(nameless).toHaveLength(1);
    expect(nameless[0].id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(nameless[0]).toEqual(expect.objectContaining({ name: '', ident: nameless[0].id }));

    // a lone alternative flow has no tandem, an unknown flowType is a plain flow
    expect(await element(page, 'F1')).toEqual(expect.objectContaining({
      type: 'fpb:AlternativeFlow', source: 'S1', target: 'PO1', inTandemWith: [], waypoints: [[200, 125], [200, 320], [325, 320]]
    }));
    expect(await element(page, 'F3')).toEqual(expect.objectContaining({
      type: 'fpb:Flow', source: 'PO1', target: 'S3', waypoints: [[300, 380], [300, 575]]
    }));
    // flows with one end, or an end in no process of the file, are left out
    const flows = await page.evaluate(() => window.fpbjs.get('elementRegistry')
      .filter((e) => e.waypoints).map((e) => e.id).sort());
    expect(flows).toEqual(['F1', 'F3', 'U1']);

    // the usage without waypoints is routed from the operator to the resource
    const usage = await element(page, 'U1');
    expect(usage).toEqual(expect.objectContaining({ type: 'fpb:Usage', source: 'PO1', target: 'TR1' }));
    expect(usage.waypoints.length).toBeGreaterThanOrEqual(2);
    expect(usage.waypoints[0][0]).toBe(475);
    expect(usage.waypoints[usage.waypoints.length - 1][0]).toBe(800);

    // characteristics: missing parts are created empty, an unreadable limit keeps its text (016c T9a: no invented 0)
    const parts = await page.evaluate(() => window.fpbjs.get('elementRegistry').get('S1').businessObject.characteristics
      .map((c) => ({
        category: [c.category.$type, c.category.shortName || ''],
        setpoint: [c.descriptiveElement.setpointValue.value || '', c.descriptiveElement.setpointValue.unit || ''],
        limits: c.descriptiveElement.validityLimits.map((l) => [l.limitType, l.from, l.to]),
        actual: c.descriptiveElement.actualValues.length,
        relational: c.relationalElement.$type,
      })));
    expect(parts).toEqual([
      { category: ['fpb:Identification', ''], setpoint: ['5', 'kg'], limits: [['max', 'abc', 7]], actual: 0, relational: 'fpbch:RelationalElement' },
      { category: ['fpb:Identification', 'Nur Name'], setpoint: ['', ''], limits: [], actual: 0, relational: 'fpbch:RelationalElement' },
    ]);
    expect(await characteristics(page, 'TR1')).toEqual([expect.objectContaining({ category: 'Leistung', setpoint: '3 kW' })]);
  });

  test('a process without systemLimit does not lose its states and operators silently', async ({ page }) => {
    await start(page);
    const xml = fixture('handgeschrieben.xml').replace(/<systemLimit[^>]*\/>/, '');

    const outcome = await importXml(page, xml);

    // rejected, or everything there, or the loss named in the report
    if (outcome.errors.length) {
      return;
    }
    const kept = await page.evaluate(() => window.fpbjs.getProcesses().filter((e) => e.process)
      .flatMap((e) => (e.elementDataInformation || []).map((x) => x.id)));
    const missing = ['S1', 'S2', 'S3', 'S4', 'S5', 'PO1'].filter((id) => !kept.includes(id));
    missing.forEach((id) => expect(outcome.warnings.some((w) => w.message.includes(id)), `${id} dropped without a report`).toBe(true));
  });

  test('a usage whose technical resource is missing is left out', async ({ page }) => {
    await start(page);
    const xml = fixture('handgeschrieben.xml').replace(/<technicalResources>[\s\S]*<\/technicalResources>/, '');

    const outcome = await importXml(page, xml);

    expect(outcome.errors).toEqual([]);
    expect(outcome.done).toBe(1);
    expect(await element(page, 'U1')).toBeNull();
    expect(await element(page, 'PO1')).not.toBeNull();
  });

  test('waypoints in JSON notation are read as well', async ({ page }) => {
    await start(page);
    const xml = fixture('handgeschrieben.xml')
      .replace('visual:waypoints="400,125 400,300"', 'visual:waypoints=\'[{"x":400,"y":125},{"x":400,"y":300}]\'');

    const outcome = await importXml(page, xml);

    expect(outcome.errors).toEqual([]);
    expect((await element(page, 'F2')).waypoints).toEqual([[400, 125], [400, 300]]);
  });

});

/**
 * One model with everything the XML has to carry: all three state types,
 * operators, a technical resource with usage, plain, parallel and alternative
 * flows, characteristics, and a decomposed operator with its child layer.
 */
function everythingModel() {
  const m = new ModelBuilder('XML Rundreise', 'http://example.org/roundtrip');
  const p = m.process('rt-root', 'Gesamtprozess', { x: 100, y: 100, width: 900, height: 700 });
  const rohteil = p.product('Rohteil', { x: 225, y: 75 });
  const strom = p.state('fpb:Energy', 'Strom', { x: 425, y: 75 });
  const programm = p.state('fpb:Information', 'Programm', { x: 625, y: 75 });
  const bearbeiten = p.operator('Bearbeiten', { x: 350, y: 220 });
  const zwischen = p.product('Zwischenteil', { x: 400, y: 380 });
  const pruefen = p.operator('Pruefen', { x: 350, y: 500 });
  const gut = p.product('Gutteil', { x: 225, y: 775 });
  const schlecht = p.product('Ausschuss', { x: 525, y: 775 });
  const abwaerme = p.state('fpb:Energy', 'Abwaerme', { x: 800, y: 775 });
  const protokoll = p.state('fpb:Information', 'Protokoll', { x: 900, y: 775 });
  const maschine = p.resource('Maschine', { x: 1100, y: 220 });
  const pruefstand = p.resource('Pruefstand', { x: 1100, y: 500 });

  p.flow(rohteil, bearbeiten);
  p.flow(strom, bearbeiten);
  p.flow(programm, bearbeiten);
  p.branch(bearbeiten, [zwischen, abwaerme], 'fpb:ParallelFlow');
  p.flow(zwischen, pruefen);
  p.branch(pruefen, [gut, schlecht], 'fpb:AlternativeFlow');
  p.flow(pruefen, protokoll);
  p.usage(bearbeiten, maschine);
  p.usage(pruefen, pruefstand);
  p.characteristic(rohteil, { shortName: 'Masse', setpoint: '2.5', unit: 'kg' });
  p.characteristic(bearbeiten, { shortName: 'Dauer', setpoint: '30', unit: 's', actualValues: [{ $type: 'fpbch:ValueWithUnit', value: '31', unit: 's' }] });
  p.characteristic(maschine, { shortName: 'Leistung', setpoint: '5', unit: 'kW' });

  // decomposition of "Bearbeiten": boundary states keep the ids of the parent
  const child = m.decompose(p, bearbeiten, 'Bearbeiten im Detail', { x: 100, y: 100, width: 700, height: 600 });
  const cRoh = child.product('Rohteil', { x: 175, y: 75 }, rohteil);
  const cStrom = child.state('fpb:Energy', 'Strom', { x: 375, y: 75 }, strom);
  const cProg = child.state('fpb:Information', 'Programm', { x: 575, y: 75 }, programm);
  const cZw = child.product('Zwischenteil', { x: 225, y: 675 }, zwischen);
  const cAbw = child.state('fpb:Energy', 'Abwaerme', { x: 525, y: 675 }, abwaerme);
  const schruppen = child.operator('Schruppen', { x: 150, y: 250 });
  const schlichten = child.operator('Schlichten', { x: 400, y: 430 });
  const vor = child.product('Vorteil', { x: 300, y: 380 });
  child.flow(cRoh, schruppen);
  child.flow(cStrom, schruppen);
  child.flow(cProg, schlichten);
  child.flow(schruppen, vor);
  child.flow(vor, schlichten);
  child.branch(schlichten, [cZw, cAbw], 'fpb:ParallelFlow');
  const fraese = child.resource('Fraese', { x: 900, y: 300 });
  child.usage(schlichten, fraese);
  return m.build();
}

/** Meaning-preserving differences of the XML route, see xml-roundtrip.spec.js. */
function normalized(model) {
  return JSON.parse(JSON.stringify(model, (key, value) => {
    if (key === 'original') return undefined;
    if (key === 'characteristics' && Array.isArray(value) && !value.length) return undefined;
    if (['value', 'from', 'to'].includes(key) && typeof value === 'number') return String(value);
    return value;
  }));
}

test.describe('XML round trip - every element and flow type', () => {

  test('export to XML and import back keeps data, layout and tandems of both layers', async ({ page }) => {
    const importer = await start(page);
    await importer.import(everythingModel());
    const before = await exportiere(page);
    expect(before.filter((e) => e.process)).toHaveLength(2);

    const xml = await exportViaDialog(page, { format: 'xml' });
    expect(xml).toContain('<project');
    ['flowType="flow"', 'flowType="parallelFlow"', 'flowType="alternativeFlow"', 'flowType="usage"',
      'stateType="product"', 'stateType="energy"', 'stateType="information"', '<validityLimits', '<actualValues']
      .forEach((part) => expect(xml).toContain(part));

    // leave the page so the dialog cannot answer from anything it kept
    await importer.goto();
    const outcome = await importXml(page, xml);
    expect(outcome.errors).toEqual([]);
    expect(outcome.warnings).toEqual([]);

    const after = await exportiere(page);
    expect(normalized(nachIds(after))).toEqual(normalized(nachIds(before)));
    expect(await importer.unresolvedReferences()).toEqual([]);

    // the child layer opens and shows its own elements
    const childId = await importer.switchToChildLayer();
    expect(childId).toBeTruthy();
    const onCanvas = await page.evaluate(() => window.fpbjs.get('elementRegistry')
      .filter((e) => e.businessObject && e.businessObject.name).map((e) => e.businessObject.name));
    expect(onCanvas).toEqual(expect.arrayContaining(['Schruppen', 'Schlichten', 'Vorteil', 'Fraese']));
  });

  test('a file exported without graphic information comes back laid out', async ({ page }) => {
    const importer = await start(page);
    await importer.import(everythingModel());
    const before = await exportiere(page);

    const bare = await exportViaDialog(page, { format: 'json', withLayout: false });
    expect(bare.filter((e) => e.process).every((e) => !e.elementVisualInformation || !e.elementVisualInformation.length)).toBe(true);

    await importer.goto();
    await openImportDialog(page);
    await dropFile(page, JSON.stringify(bare), 'ohne-grafik.json');
    const outcome = await pressImport(page);

    expect(outcome.errors).toEqual([]);
    expect(outcome.warnings.map((w) => w.message)).toEqual([
      expect.stringContaining('"Gesamtprozess" carried no layout'),
      expect.stringContaining('"Bearbeiten im Detail" carried no layout'),
    ]);
    // the data is the same, only the layout is new
    const after = await exportiere(page);
    const dataOnly = (model) => Object.fromEntries(Object.entries(nachIds(model)).map(([id, p]) => [id, { process: p.process, daten: p.daten }]));
    expect(normalized(dataOnly(after))).toEqual(normalized(dataOnly(before)));
    const shapes = Object.values(nachIds(after)).flatMap((p) => Object.values(p.grafik));
    expect(shapes.length).toBeGreaterThan(0);
    shapes.forEach((v) => expect(v.waypoints ? v.waypoints.length >= 2 : Number.isFinite(v.x) && Number.isFinite(v.y), v.id).toBe(true));
  });

  test('a foreign file with gaps keeps its content through export and import', async ({ page }) => {
    // Written back, the gaps of the foreign file (no identification, empty
    // characteristic parts, a routed usage) must come back as they were read.
    const importer = await start(page);
    expect((await importXml(page, fixture('fremd-ungewoehnlich.xml'))).errors).toEqual([]);
    const before = await exportiere(page);

    const xml = await exportViaDialog(page, { format: 'xml' });
    expect(xml).toContain('flowType="alternativeFlow"');
    await importer.goto();
    const outcome = await importXml(page, xml);
    expect(outcome.errors).toEqual([]);
    expect(outcome.warnings).toEqual([]);
    const after = await exportiere(page);

    // the XML carries no type for numbers and no uniqueIdent of a category it
    // never had; empty text and a missing value mean the same
    const content = (model) => {
      const text = (value) => (value === undefined || value === null ? '' : String(value));
      const out = {};
      model.filter((e) => e.process).forEach((entry) => {
        entry.elementDataInformation.forEach((e) => {
          out[e.id] = {
            type: e.$type,
            name: text(e.name),
            ends: [text(e.sourceRef), text(e.targetRef)],
            tandem: (e.inTandemWith || []).slice().sort(),
            assigned: (e.isAssignedTo || []).slice().sort(),
            characteristics: (e.characteristics || []).map((c) => ({
              shortName: text(c.category && c.category.shortName),
              setpoint: [text(c.descriptiveElement.setpointValue && c.descriptiveElement.setpointValue.value),
                text(c.descriptiveElement.setpointValue && c.descriptiveElement.setpointValue.unit)],
              limits: (c.descriptiveElement.validityLimits || []).map((l) => [text(l.limitType), text(l.from), text(l.to)]),
              actual: (c.descriptiveElement.actualValues || []).map((v) => [text(v.value), text(v.unit)]),
            })),
          };
        });
        (entry.elementVisualInformation || []).forEach((v) => {
          out[v.id] = { ...out[v.id], visual: v.waypoints ? v.waypoints.map((p) => [p.x, p.y]) : [v.x, v.y, v.width, v.height] };
        });
      });
      return out;
    };
    expect(content(after)).toEqual(content(before));
    // SystemLimit, 3 states, operator, resource, 2 flows, usage
    expect(Object.keys(content(before))).toHaveLength(9);
  });

});
