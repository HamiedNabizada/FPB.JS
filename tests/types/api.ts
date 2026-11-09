// tests/types/api.ts: checked with tsc, not run (032a V8)
// npx tsc --noEmit --strict tests/types/*.ts
//
// Uses every method of the facade (FpbInstance) with the types a host relies
// on. `@ts-expect-error` lines prove that a type is not just `any`.
import type {
  FpbInstance, FpbProjectData, ImportResult, AmlImportResult, FpbImportError,
  PlainFinding, ImportWarning, AmlHierarchy, Element, FpbChanges, ProjectData, FpbElementType
} from '../../types/fpbjs';

declare const fpb: FpbInstance;
declare const data: FpbProjectData;

async function imports(): Promise<void> {
  // 2.1: the imports resolve once the model is on the canvas
  const result: ImportResult = await fpb.importJSON(data);
  const warnings: ImportWarning[] = result.warnings;
  const findings: PlainFinding[] = result.findings;
  const fromXml: ImportResult = await fpb.importXML('<xml/>');
  const aml: AmlImportResult = await fpb.importAML('<CAEXFile/>', { instanceHierarchy: '#1', fileName: 'model.aml' });
  const report: ImportWarning[] = aml.report;
  const views: AmlHierarchy[] = await fpb.getAMLHierarchies('<CAEXFile/>');
  // @ts-expect-error an import result has no `model`
  void result.model;
  void [warnings, findings, fromXml, report, views];

  try {
    await fpb.importJSON(data);
  } catch (e) {
    const error = e as FpbImportError;
    const code: string = error.code;
    const name: 'FpbImportError' = error.name;
    void [code, name];
  }
}

function events(): void {
  // 2.1: on hands back its removal
  const off: () => void = fpb.on('model.changed', () => {});
  off();
  fpb.on('model.dirtyChanged', (e) => {
    const dirty: boolean = e.dirty;
    void dirty;
  });
  // @ts-expect-error the payload of model.dirtyChanged has no `changed`
  fpb.on('model.dirtyChanged', (e) => e.changed);
  fpb.on('import.done', (e) => {
    const run: number | undefined = e.run;
    void run;
  });
  fpb.on('import.report', (e) => {
    const list: ImportWarning[] = e.warnings;
    void list;
  });
  fpb.on('fpbValidation.changed', (e) => {
    const errors: number = e.counts.error;
    void errors;
  });
  fpb.on('theme.changed', (e) => {
    const theme: 'light' | 'dark' = e.theme;
    void theme;
  });
  fpb.on('i18n.changed', (e) => {
    const language: 'en' | 'de' = e.language;
    void language;
  });
  fpb.on('model.downloaded', (e) => {
    const format: string | null = e.format;
    void format;
  });
  const projectType: FpbElementType = 'fpb:Project';
  void projectType;
  fpb.on('my.event', (payload: any) => void payload);
  fpb.off('model.changed', () => {});
  const answer: any = fpb.fire('my.event', { data: 1 });
  void answer;
}

async function exportsAndState(): Promise<void> {
  const dirty: boolean = fpb.isDirty();
  fpb.markSaved();
  fpb.newModel();
  const xml: string = await fpb.toXML();
  const svg: string = await fpb.toSVG();
  const png: string = await fpb.toPNG({ scale: 2 });
  const pdf: Blob = await fpb.toPDF({ allLayers: true });
  const amlText: string = await fpb.toAML();
  // toJSON gives plain data: references are ids
  const model = fpb.toJSON();
  const project = model[0] as ProjectData;
  const entry: string = project.entryPoint;
  const processes = fpb.getProcesses();
  void entry;
  void [dirty, xml, svg, png, pdf, amlText, model, processes];
}

function viewAndSelection(): void {
  fpb.zoom('fit-viewport');
  fpb.zoom(1.5);
  const zoom: number = fpb.getZoom();
  const found: boolean = fpb.select('id', { process: 'p', scroll: true });
  const selected: Element[] = fpb.getSelected();
  const current: string | null = fpb.getCurrentProcess();
  fpb.switchProcess('p');
  fpb.setAmlLinks(null);
  fpb.setValidationMarkers(false);
  const findings: PlainFinding[] = fpb.getFindings();
  const rules: string[] = fpb.getCheckedRules();
  fpb.setReadOnly(true);
  const readOnly: boolean = fpb.isReadOnly();
  fpb.setTheme('system');
  const language: 'en' | 'de' = fpb.setLanguage('de-DE');
  const shown: 'en' | 'de' = fpb.getLanguage();
  const changes: FpbChanges = fpb.get('fpbChanges');
  const maybe: any = fpb.get('unknownService', false);
  void [zoom, found, selected, current, findings, rules, readOnly, language, shown, changes, maybe];
  fpb.destroy();
}

export { imports, events, exportsAndState, viewAndSelection };
