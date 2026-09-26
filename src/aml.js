// FpbJS AutomationML add-on (feature 028)
//
// AML import and export are optional, like the browser backup: the core
// library leaves them out, together with the AutomationML engine (about 1 MB).
// Hosts that want them pass the module to createFpbModeler:
//
//   import { createFpbModeler } from 'fpbjs';
//   import { AmlModule } from 'fpbjs/aml';
//   createFpbModeler({ container, additionalModules: [AmlModule] });
//
// With script tags: fpbjs.js, then fpbjs-aml.js, and
// additionalModules: [FpbJSAml.AmlModule].

import AmlModule from '../app/fpb/aml';

export { AmlModule };
export default AmlModule;
