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
  id: string;
  process: Shape;
  elementDataInformation: ElementDataInfo[];
  elementVisualInformation: ElementVisualInfo[];
}

/** Complete project data (returned by toJSON()) */
export interface FpbProjectData {
  [key: string]: any;
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
  zoom(level: number | 'fit-viewport'): number;
  getZoom(): number;
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
  switchProcess(process: ProcessEntry): void;
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

/** Map of known DI service names to their types */
export interface FpbServiceMap {
  eventBus: EventBus;
  canvas: Canvas;
  modeling: Modeling;
  selection: Selection;
  elementRegistry: ElementRegistry;
  commandStack: CommandStack;
  elementFactory: ElementFactory;
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
  /** Custom properties panel config (defaults to built-in configPP.json) */
  propertiesConfig?: Record<string, any>;
  /** Additional options passed to FpbModeler constructor */
  [key: string]: any;
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

  /** Import a diagram from a VDI 3682 XML string */
  importXML(xmlString: string): Promise<void>;

  /** Export the current diagram as a JSON object (array of ProcessEntry) */
  toJSON(): ProcessEntry[];

  /** Export the current diagram as a VDI 3682 XML string */
  toXML(): Promise<string>;

  /** Export the current diagram as an SVG string */
  toSVG(): Promise<string>;

  // --- Viewport ---

  /** Set zoom level (number or 'fit-viewport') */
  zoom(level: number | 'fit-viewport'): void;

  /** Get current zoom level */
  getZoom(): number;

  // --- Selection ---

  /** Select an element by its ID */
  select(elementId: string): void;

  /** Get currently selected elements */
  getSelected(): Element[];

  // --- Process Management ---

  /** Get all processes in the project */
  getProcesses(): ProcessEntry[];

  /** Switch to a different process layer by ID */
  switchProcess(id: string): void;

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
  defaultPropertiesConfig: Record<string, any>;
}>;

/** Server-side stub class (throws on instantiation) */
export const FpbModeler: any;
/** Server-side stub class (throws on instantiation) */
export const PropertiesPanel: any;
/** Server-side stub class (throws on instantiation) */
export const LayerOverview: any;
/** Default modeler config (empty object on server) */
export const defaultConfig: Record<string, any>;
/** Default properties panel config (empty object on server) */
export const defaultPropertiesConfig: Record<string, any>;

export default createFpbModeler;
