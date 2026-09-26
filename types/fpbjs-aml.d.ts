/**
 * The AutomationML add-on of FPB.js (fpbjs/aml). AML import and export are
 * optional, like the browser backup: pass the module when creating the
 * modeler, then importAML, toAML and getAMLHierarchies work and the dialogs
 * offer AML.
 *
 * @example
 * import { createFpbModeler } from 'fpbjs';
 * import { AmlModule } from 'fpbjs/aml';
 * const fpb = await createFpbModeler({ container, additionalModules: [AmlModule] });
 */
export declare const AmlModule: {
  __init__: string[];
  [service: string]: unknown;
};

export default AmlModule;
