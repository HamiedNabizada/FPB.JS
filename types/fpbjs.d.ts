// Type definitions for fpbjs
// VDI/VDE 3682 Process Description Library

// ---------------------------------------------------------------------------
// Element Types
// ---------------------------------------------------------------------------

/** All FPB element type identifiers */
export type FpbElementType =
  | 'fpb:Product'
  | 'fpb:Energy'
  | 'fpb:Information'
  | 'fpb:ProcessOperator'
  | 'fpb:TechnicalResource'
  | 'fpb:SystemLimit'
  | 'fpb:Process'
  | 'fpb:ProjectDefinition'
  | 'fpb:Flow'
  | 'fpb:AlternativeFlow'
  | 'fpb:ParallelFlow'
  | 'fpb:Usage';

/** State types (elements on/in SystemLimit) */
export type FpbStateType = 'fpb:Product' | 'fpb:Energy' | 'fpb:Information';

/** Connection types */
export type FpbConnectionType = 'fpb:Flow' | 'fpb:AlternativeFlow' | 'fpb:ParallelFlow' | 'fpb:Usage';

/** State status (ante = input, post = output) */
export type StateStatus = 'ante' | 'post';

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

export interface Point {
  x: number;
  y: number;
}

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

// ---------------------------------------------------------------------------
// Business Objects (Moddle)
// ---------------------------------------------------------------------------

export interface Identification {
  uniqueIdent: string;
  longName?: string;
  shortName?: string;
  versionNumber?: string;
  revisionNumber?: string;
}

export interface FpbBusinessObject {
  $type: FpbElementType;
  id: string;
  name?: string;
  identification?: Identification;
  characteristics?: any[];
  /** Only on States */
  stateStatus?: StateStatus;
  /** Only on States - whether the state sits on a SystemLimit border */
  onSystemBorder?: boolean;
  /** Only on ProcessOperator - reference to child process Shape */
  decomposedView?: Shape;
  /** Only on child process - reference back to parent ProcessOperator BO */
  isDecomposedProcessOperator?: FpbBusinessObject;
  /** Only on child process - reference to parent process Shape */
  parent?: Shape;
  /** Connection references */
  incoming?: FpbBusinessObject[];
  outgoing?: FpbBusinessObject[];
  sourceRef?: FpbBusinessObject;
  targetRef?: FpbBusinessObject;
}

// ---------------------------------------------------------------------------
// diagram-js Core Types
// ---------------------------------------------------------------------------

/** Visual shape element on the canvas */
export interface Shape {
  id: string;
  type: FpbElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  parent?: Shape;
  children?: (Shape | Connection)[];
  businessObject: FpbBusinessObject;
}

/** Visual connection between shapes */
export interface Connection {
  id: string;
  type: FpbConnectionType;
  source: Shape;
  target: Shape;
  waypoints?: Point[];
  parent?: Shape;
  businessObject: FpbBusinessObject;
}

/** Any visual element (shape or connection) */
export type Element = Shape | Connection;

// ---------------------------------------------------------------------------
// Event Types
// ---------------------------------------------------------------------------

/** Events supported by the facade's on()/off() methods */
export interface FpbEventMap {
  /** Diagram was modified (commandStack changed) */
  'changed': Record<string, never>;
  /** A shape or connection was added */
  'element.added': { element: Element };
  /** A shape or connection was removed */
  'element.removed': { element: Element };
  /** Element properties changed */
  'element.changed': { element: Element };
  /** Selection changed */
  'selection.changed': { newSelection: Element[]; oldSelection: Element[] };
  /** Process layer was switched */
  'process.switched': { selectedProcess: Shape };
  /** An import went through with warnings (skipped elements, automatic layout) */
  'import.report': { warnings: ImportWarning[] };
  /** An import is complete and the model is on the canvas (importJSON and importXML return before this) */
  'import.done': Record<string, never>;
  /** An import failed; the previous model stays */
  'import.error': { message: string; details?: string };
  /** The read-only mode was turned on or off */
  'readOnly.changed': { readOnly: boolean };
  /** The AML file kept for the AML export changed (import, export, New model) */
  'aml.sourceChanged': { source: AmlSource | null };
}

/** The AML file kept since importAML, written back by toAML */
export interface AmlSource {
  text: string;
  fileName: string;
  /** The FPD InstanceHierarchy the model came from; null for a file without FPD content */
  hierarchyId: string | null;
  hierarchyName: string | null;
}

/** An FPD process view (InstanceHierarchy) of an AML file */
export interface AmlHierarchy {
  id: string;
  name: string;
}

/** One warning of an import report */
export interface ImportWarning {
  /** What happened, naming the affected element or process */
  message: string;
  /** Technical details, if any */
  details: string | null;
  /** What the user can do about it, if anything */
  hint: string | null;
}

/** All known facade event names */
export type FpbEventName = keyof FpbEventMap;

// ---------------------------------------------------------------------------
// Data Structures (Import/Export)
// ---------------------------------------------------------------------------

/** Visual information for a single element */
export interface ElementVisualInfo {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  visible?: boolean;
  collapsed?: boolean;
  waypoints?: Point[];
}

/** Data information for a single element */
export interface ElementDataInfo {
  id: string;
  type: string;
  name?: string;
  stateStatus?: StateStatus;
  onSystemBorder?: boolean;
  identification?: Identification;
  [key: string]: any;
}

/** A single process entry in the project */
export interface ProcessEntry {
  process: Shape;
  elementDataInformation: ElementDataInfo[];
  elementVisualInformation: ElementVisualInfo[];
}

/** Project definition (fpb:Project business object, first entry in getProcesses()) */
export interface ProjectDefinition {
  $type: 'fpb:Project';
  name: string;
  targetNamespace: string;
  entryPoint: Shape;
  [key: string]: any;
}

/** Complete project data (returned by toJSON()) */
export interface FpbProjectData {
  [key: string]: any;
}

// ---------------------------------------------------------------------------
// Export Options
// ---------------------------------------------------------------------------

/** Options for PNG export */
export interface PngExportOptions {
  /** Scale factor (default: 2 for retina quality) */
  scale?: number;
  /** Background fill color (default: '#ffffff') */
  backgroundColor?: string;
}

/** Options for PDF export */
export interface PdfExportOptions extends PngExportOptions {
  /** Page orientation (default: 'landscape') */
  orientation?: 'landscape' | 'portrait';
  /** Page format (default: 'a4') */
  format?: 'a4' | 'a3' | 'letter';
  /** Document/page title (default: 'FPB Diagram') */
  title?: string;
  /** If true, exports all process layers as separate pages (default: false) */
  allLayers?: boolean;
}

// ---------------------------------------------------------------------------
// diagram-js Services (for get() method)
// ---------------------------------------------------------------------------

export interface EventBus {
  on(event: string, priority: number, callback: Function, target?: any): void;
  on(event: string, callback: Function, target?: any): void;
  off(event: string, callback: Function): void;
  fire(event: string, data?: any): any;
}

export interface Canvas {
  addShape(shape: any, parent?: any): Shape;
  addConnection(connection: any, parent?: any): Connection;
  removeShape(shape: any): void;
  removeConnection(connection: any): void;
  getRootElement(): Shape;
  setRootElement(rootElement: any, override?: boolean): Shape;
  /** Without argument: the current zoom level */
  zoom(level?: number | 'fit-viewport'): number;
  scroll(delta: Point): void;
  viewbox(box?: any): any;
  getGraphics(element: Element, secondary?: boolean): SVGElement;
  resized(): void;
}

export interface Modeling {
  createShape(shape: any, position: Point, parent: Shape, hints?: any): Shape;
  removeShape(shape: Shape): void;
  moveShape(shape: Shape, delta: Point, newParent?: Shape, hints?: any): void;
  resizeShape(shape: Shape, newBounds: Bounds, minBounds?: Bounds, hints?: any): void;
  createConnection(source: Shape, target: Shape, attrs: any, parent?: Shape, hints?: any): Connection;
  removeConnection(connection: Connection): void;
  layoutConnection(connection: Connection, hints?: any): Connection;
  updateProperties(element: Element, properties: Record<string, any>): void;
  updateLabel(element: Element, newLabel: string, newBounds?: Bounds, hints?: any): void;
  connect(source: Shape, target: Shape, attrs?: any, hints?: any): Connection;
  /**
   * Expects the process root shape, not the ProcessEntry from getProcesses().
   * `hints.fpbTransient` marks a switch that only passes through a layer (as
   * the PDF export does) and therefore keeps the undo history.
   */
  switchProcess(process: Shape, hints?: { fpbTransient?: boolean;[key: string]: any }): void;
  decomposeProcessOperator(element: Shape): void;
  composeProcess(element: Shape): void;
}

export interface Selection {
  select(element?: Element | Element[], add?: boolean): void;
  deselect(element?: Element): void;
  get(): Element[];
  isSelected(element: Element): boolean;
}

export interface ElementRegistry {
  get(id: string): Element | undefined;
  getAll(): Element[];
  forEach(callback: (element: Element) => void): void;
  filter(callback: (element: Element) => boolean): Element[];
  find(callback: (element: Element) => boolean): Element | undefined;
}

export interface CommandStack {
  execute(command: string, context: any): void;
  undo(): void;
  redo(): void;
  canUndo(): boolean;
  canRedo(): boolean;
  clear(): void;
}

export interface ElementFactory {
  createShape(attrs: any): Shape;
  createConnection(attrs: any): Connection;
}

/** A finding of the model check, see the VDI 3682 rule catalog */
export interface ValidationIssue {
  /** Rule id of the catalog, e.g. 'B2' */
  rule: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  elementId?: string;
  /** Process (layer) the finding belongs to */
  process?: Shape;
}

export interface ValidationCounts {
  error: number;
  warning: number;
  info: number;
}

/** Model check against the VDI 3682 rule catalog */
export interface FpbValidation {
  run(): ValidationIssue[];
  getIssues(): ValidationIssue[];
  getCounts(): ValidationCounts;
  setShowMarkers(show: boolean): void;
  isPanelOpen(): boolean;
  openPanel(): void;
  closePanel(): void;
  togglePanel(): void;
}

/** Search across all layers (Ctrl+F) */
export interface FpbSearch {
  isOpen(): boolean;
  open(): void;
  close(): void;
}

/** A button in a message */
export interface NotificationAction {
  label: string;
  run(): void;
  ariaLabel?: string;
  primary?: boolean;
  /** Close the message after running */
  dismiss?: boolean;
}

/** One entry in the list of a message, such as a warning of an import */
export interface NotificationItem {
  message: string;
  hint?: string;
  details?: string;
  actions?: NotificationAction[];
}

export interface NotificationOptions {
  /** The same key replaces a message instead of stacking it */
  key?: string;
  type: 'error' | 'warning' | 'info' | 'success';
  title?: string;
  message?: string;
  items?: NotificationItem[];
  /** Shown under "Technical details" */
  details?: string;
  actions?: NotificationAction[];
  /** Milliseconds until it goes, 0 = stays; default 8000 for info and success without buttons, else 0 */
  timeout?: number;
  /** Runs when the user closes the message with its cross */
  onDismiss?(): void;
}

/** The message stack on the canvas (016e); texts are shown as text, never as HTML */
export interface FpbNotifications {
  /** Returns the id: the key if given */
  show(options: NotificationOptions): string;
  dismiss(id: string): void;
  /** As the cross does: onDismiss of the message, then dismiss */
  close(id: string): void;
  clear(): void;
  list(): Array<NotificationOptions & { id: string }>;
}

export interface ConfirmOptions {
  title?: string;
  message?: string;
  details?: string;
  /** Text of the answer that goes ahead, named after the action (default 'Confirm') */
  confirmLabel?: string;
  /** The action destroys something: the answer is red */
  danger?: boolean;
  /** The action is not possible: only "OK", the result is false */
  blocked?: boolean;
}

/** Native dialogs of the modeler (016e) */
export interface FpbDialogs {
  /** Asks one question after the other; true for the named answer; the signal withdraws the question (false) */
  confirm(options: ConfirmOptions, control?: { signal?: AbortSignal }): Promise<boolean>;
  /**
   * Renders a component with the Preact inside FPB.js; `closed` resolves with
   * the value passed to close(). A host with its own Preact or another
   * framework uses mount(): hooks only work with the render of their copy.
   */
  open(component: any, props?: Record<string, any>, options?: { className?: string }): { close(result?: any): void; closed: Promise<any> };
  /** The caller draws into the dialog element and returns a function that clears it */
  mount(mount: (element: HTMLDialogElement, api: { close(result?: any): void; titleId: string; descriptionId: string }) => (() => void) | void, options?: { className?: string; role?: string; described?: boolean }): { close(result?: any): void; closed: Promise<any> };
}

/** The dialog "FPB.js Information" (016e) */
export interface FpbInfo {
  /** Without a tab the one chosen last */
  open(tab?: 'about' | 'notation' | 'shortcuts' | 'help'): { close(): void; closed: Promise<void> };
}

/** Open, save and export the model (016e D2) */
export interface FpbFiles {
  /** Shows the dialog "Open"; null in read-only mode */
  open(): { close(result?: any): void; closed: Promise<any> } | null;
  /**
   * Opens a file without the dialog, as one dropped on the canvas; errors go
   * to the message stack. With a handle, save() writes into that file.
   */
  openFile(file: File, handle?: any): Promise<boolean>;
  /** Shows the dialog "Export", also in read-only mode */
  export(): { close(result?: any): void; closed: Promise<any> };
  /**
   * Saves the whole model with layout: in Chrome and Edge into its file
   * (asks for the place the first time), else as a download. True when written.
   */
  save(): Promise<boolean>;
  /** Like save(), always asking for a new place */
  saveAs(): Promise<boolean>;
  /** Ctrl/Cmd+S on a container of the host as well; returns a function that removes it */
  bindKeys(element: HTMLElement): () => void;
}

/** Append an element to an existing one, connected and placed */
export interface FpbAppend {
  getOptions(element: Element): Array<{ type: string; label: string }>;
  canAppend(element: Element): boolean;
  append(source: Shape, type: string): Shape;
}

/** Copy and paste within and across layers */
export interface FpbCopyPaste {
  isEmpty(): boolean;
  copy(elements: Element[]): void;
  paste(): Element[];
}

/** Where the undo history ends, see switchProcess hints */
export interface LayerUndoBoundary {
  /** Runs `work` and leaves the undo history as it was before */
  keepHistory<T>(work: () => Promise<T> | T): Promise<T>;
}

/** Colour scheme of the elements: the colours of VDI 3682 or a scheme for colour vision deficiency */
export interface ColorSchemeService {
  get(): 'standard' | 'accessible';
  getSchemes(): string[];
  /** Switches, redraws and remembers the choice in this browser */
  set(name: 'standard' | 'accessible', options?: { silent?: boolean }): string;
}

/** Read-only mode (setReadOnly and isReadOnly of the facade use it) */
export interface ReadOnlyService {
  set(readOnly: boolean): void;
  isEnabled(): boolean;
}

/** Readiness of the user interface components, used by the import */
export interface UiReadiness {
  isReady(): boolean;
  whenReady(callback: () => void, timeout: number): void;
}

/** Map of known DI service names to their types */
export interface FpbServiceMap {
  eventBus: EventBus;
  canvas: Canvas;
  modeling: Modeling;
  selection: Selection;
  elementRegistry: ElementRegistry;
  commandStack: CommandStack;
  elementFactory: ElementFactory;
  fpbValidation: FpbValidation;
  fpbNotifications: FpbNotifications;
  fpbDialogs: FpbDialogs;
  fpbInfo: FpbInfo;
  fpbFiles: FpbFiles;
  fpbSearch: FpbSearch;
  fpbAppend: FpbAppend;
  fpbCopyPaste: FpbCopyPaste;
  layerUndoBoundary: LayerUndoBoundary;
  uiReadiness: UiReadiness;
  colorSchemeService: ColorSchemeService;
  readOnly: ReadOnlyService;
}

// ---------------------------------------------------------------------------
// Factory Options
// ---------------------------------------------------------------------------

export interface CreateFpbModelerOptions {
  /** DOM element for the diagram canvas (required) */
  container: HTMLElement;
  /** DOM element for the properties panel (optional) */
  propertiesContainer?: HTMLElement;
  /** DOM element for the layer overview panel (optional) */
  layerContainer?: HTMLElement;
  /** Custom config object (defaults to built-in config.json) */
  config?: Record<string, any>;
  /**
   * Show the "New model" button in the toolbar also without the browser
   * backup (autosave). Default false. Replaces `propertiesConfig.layerPanel.
   * showNewModel` of 1.x; `propertiesConfig` itself is gone in 2.0 and only
   * answered with a console warning.
   */
  showNewModel?: boolean;
  /**
   * Backup of the model in the browser (localStorage) and a warning before
   * leaving the page with changes that are in no file. Off by default; the
   * web app turns it on. `true` uses the defaults.
   */
  autosave?: boolean | AutosaveOptions;
  /** Start in read-only mode, see setReadOnly(). Default false */
  readOnly?: boolean;
  /**
   * Light or dark. 'light' or 'dark': set by the host, the toggle is hidden.
   * 'system': the user's choice, else the system setting. Without it: the
   * user's choice, else light. The attribute goes on the containers of the
   * modeler; the host page keeps its own look. A `data-theme` the host page
   * sets on <html> before the start is followed as well. See setTheme().
   */
  theme?: 'light' | 'dark' | 'system';
  /**
   * false: the modeler asks no questions itself (016e); the host answers
   * confirmation.required with confirmation.confirmed or .cancelled and the
   * same action. Default true.
   */
  confirmations?: boolean;
  /**
   * The dialog "Export" can send the model to the host as an event instead
   * of a download (016e D2): true for the event "fpbjs", or its name. The
   * event carries { data, format }: JSON parsed, XML and AML as text.
   */
  exportEvent?: boolean | string;
  /**
   * false: no Ctrl+O, Ctrl+S and Ctrl+Shift+S and no opening of a file
   * dropped on the canvas, for hosts that store the model themselves
   * (016e D2). Default true.
   */
  files?: boolean;
  /** Additional options passed to FpbModeler constructor */
  [key: string]: any;
}

/** Options for the browser backup */
export interface AutosaveOptions {
  /** Default true when an object is given */
  enabled?: boolean;
  /** localStorage key (default: 'fpbjs.autosave'); use your own per app */
  storageKey?: string;
  /** Milliseconds after the last change before the backup is written (default: 1000) */
  delay?: number;
}

// ---------------------------------------------------------------------------
// FPB Instance (returned by createFpbModeler)
// ---------------------------------------------------------------------------

export interface FpbInstance {
  // --- Components ---

  /** The underlying FpbModeler instance (for advanced usage) */
  readonly modeler: any;
  /** Properties panel instance (null if no propertiesContainer provided) */
  readonly propertiesPanel: any | null;
  /** Layer overview instance (null if no layerContainer provided) */
  readonly layerOverview: any | null;

  // --- Event API ---

  /**
   * Register an event listener.
   * Supports mapped event names ('changed', 'element.added', etc.)
   * and any custom or internal diagram-js event name.
   * Listeners only observe: a returned value is ignored, so it cannot stop
   * the event for the modeler's own listeners.
   */
  on<K extends FpbEventName>(event: K, callback: (payload: FpbEventMap[K]) => void): void;
  on(event: string, callback: (payload: any) => void): void;

  /**
   * Remove an event listener.
   */
  off<K extends FpbEventName>(event: K, callback: (payload: FpbEventMap[K]) => void): void;
  off(event: string, callback: (payload: any) => void): void;

  /**
   * Fire an event. Useful for event-based export integration.
   * @example
   * fpb.on('myExport', (e) => sendToBackend(e.data));
   * fpb.fire('myExport', { data: fpb.toJSON(), format: 'json' });
   */
  fire(event: string, data?: any): any;

  // --- Import/Export ---

  /** Import a diagram from a JSON object (FPB.JS internal format) */
  importJSON(json: FpbProjectData): void;

  /** Start over with an empty model; also clears the browser backup if autosave is on */
  newModel(): void;

  /** Import a diagram from a VDI 3682 XML string */
  importXML(xmlString: string): Promise<void>;

  /**
   * Export the current diagram as plain data (ProjectDefinition + ProcessEntries),
   * the same as the JSON download: references are ids, so it can go straight
   * to JSON.stringify, postMessage or importJSON.
   */
  toJSON(): (ProjectDefinition | ProcessEntry)[];

  /** Export the current diagram as a VDI 3682 XML string */
  toXML(): Promise<string>;

  /** Export the current diagram as an SVG string */
  toSVG(): Promise<string>;

  /**
   * Export the current view as a PNG data URL.
   * @param options.scale - Scale factor (default: 2 for retina quality)
   * @param options.backgroundColor - Background fill color (default: '#ffffff')
   * @returns PNG as data URL string (data:image/png;base64,...)
   */
  toPNG(options?: PngExportOptions): Promise<string>;

  /**
   * Export as PDF blob.
   * @param options.allLayers - If true, exports all process layers (one page per layer)
   * @param options.orientation - Page orientation (default: 'landscape')
   * @param options.format - Page format (default: 'a4')
   * @param options.title - Document title (default: 'FPB Diagram')
   * @returns PDF as Blob
   */
  toPDF(options?: PdfExportOptions): Promise<Blob>;

  // --- Viewport ---

  /** Set zoom level (number or 'fit-viewport') */
  zoom(level: number | 'fit-viewport'): void;

  /** Get current zoom level */
  getZoom(): number;

  // --- Selection ---

  /**
   * Select an element by its ID; with `scroll: true` the view moves to it.
   * Returns false if there is no such element (the selection stays).
   */
  select(elementId: string, options?: { scroll?: boolean }): boolean;

  /** Get currently selected elements */
  getSelected(): Element[];

  // --- Process Management ---

  /** Get all processes in the project (first entry is ProjectDefinition) */
  getProcesses(): (ProjectDefinition | ProcessEntry)[];

  /** Switch to a different process layer by ID */
  switchProcess(id: string): void;

  // --- AutomationML ---

  /** The FPD process views of an AML text; empty when the file has none */
  getAMLHierarchies(text: string): Promise<AmlHierarchy[]>;

  /**
   * Import an AML text. The rest of the file (other hierarchies, libraries,
   * attributes and links) is kept and written back by toAML(). A file without
   * FPD content opens an empty model; toAML() then adds the process to it.
   */
  importAML(text: string, options?: { instanceHierarchy?: string; fileName?: string }): Promise<{
    hierarchies: AmlHierarchy[];
    hierarchy: AmlHierarchy | null;
    warnings?: string[];
  }>;

  /**
   * The model as AML text: written into the imported file when there is one
   * (everything else stays), else a new file with the FPD libraries.
   */
  toAML(): Promise<string>;

  // --- Read-only mode ---

  /**
   * Turn the read-only mode on or off. The user can then zoom, pan, switch
   * layers, search, check and export, but not change the model: no moving,
   * creating, connecting, deleting, renaming, undo or paste, the context pad
   * stays closed, the panel fields take no input, New and Import are off.
   * The API stays writable (importJSON, switchProcess, modeling).
   * Fires 'readOnly.changed'.
   */
  setReadOnly(readOnly: boolean): void;

  /** Is the read-only mode on? */
  isReadOnly(): boolean;

  /**
   * Light or dark for the containers of this modeler: from then on the host
   * decides and the toggle is hidden. 'system' hands it back: the user's
   * choice, else the system setting, followed from then on. Fires
   * 'theme.changed' with
   * { theme: 'light' | 'dark', mode: 'host' | 'system' | 'default' }.
   */
  setTheme(theme: 'light' | 'dark' | 'system'): void;

  // --- DI Service Access ---

  /**
   * Access an internal diagram-js service by name.
   * For advanced usage when the facade API is not sufficient.
   * @example
   * const eventBus = fpb.get('eventBus');
   * const modeling = fpb.get('modeling');
   */
  get<K extends keyof FpbServiceMap>(serviceName: K): FpbServiceMap[K];
  get(serviceName: string): any;
  /** With `strict` false: null instead of an error when the service is not there (e.g. amlSupport without the AML module) */
  get(serviceName: string, strict: false): any | null;

  // --- Lifecycle ---

  /** Destroy the modeler and all its components */
  destroy(): void;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

/**
 * Create a new FPB.JS modeler instance.
 * This is the main entry point for using FPB.JS as a library.
 *
 * @example
 * ```typescript
 * import { createFpbModeler } from 'fpbjs';
 *
 * const fpb = await createFpbModeler({
 *   container: document.getElementById('modeler'),
 *   propertiesContainer: document.getElementById('properties'),
 *   layerContainer: document.getElementById('layers')
 * });
 *
 * fpb.on('changed', () => console.log('Diagram changed'));
 * const json = fpb.toJSON();
 * ```
 */
export function createFpbModeler(options: CreateFpbModelerOptions): Promise<FpbInstance>;

/**
 * Get the real FPB.JS classes (only works in browser).
 * Returns stub classes in Node.js.
 */
export function getClasses(): Promise<{
  FpbModeler: any;
  PropertiesPanel: any;
  LayerOverview: any;
  defaultConfig: Record<string, any>;
}>;

/** Server-side stub class (throws on instantiation) */
export const FpbModeler: any;
/**
 * Server-side stub class (throws on instantiation). In the browser,
 * getClasses().PropertiesPanel is the properties panel (Preact); its
 * constructor takes { container, modeler }.
 */
export const PropertiesPanel: any;
/** Server-side stub class (throws on instantiation) */
export const LayerOverview: any;
/** Default modeler config (empty object on server) */
/** Options for layoutImportData */
export interface LayoutOptions {
  /**
   * 'missing' (default) keeps existing visual information and only adds what is
   * absent; 'all' arranges every process from scratch.
   */
  mode?: 'missing' | 'all';
}

/** Result of layoutImportData */
export interface LayoutResult {
  /** Copy of the input with elementVisualInformation completed */
  data: any[];
  /** True if any process received new visual information */
  changed: boolean;
  /** Per process: how it was arranged and how many elements were placed */
  report: { process: string; mode: 'unchanged' | 'connections' | 'incremental' | 'full'; placed: number }[];
}

/**
 * Arranges FPB.JS JSON data without (complete) visual information, following
 * the VDI 3682 drawing conventions. Does not modify the input. The importer
 * applies it automatically to files with missing layout.
 *
 * @example
 * fpb.importJSON(layoutImportData(json, { mode: 'all' }).data);
 */
export function layoutImportData(data: any[], options?: LayoutOptions): LayoutResult;

/** True if some shape or connection in the data has no visual information */
export function needsLayout(data: any[]): boolean;

export const defaultConfig: Record<string, any>;

export default createFpbModeler;
