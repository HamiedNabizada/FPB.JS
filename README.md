# FPB.JS

A web-based modeling tool for Formalized Process Descriptions according to VDI/VDE 3682.

[Documentation](./docs/) | [Wiki](https://github.com/HamiedNabizada/FPB.JS/wiki) | [Demo](http://demo.fpbjs.net/)

## About

FPB.JS enables engineers and researchers to create, edit, and export process models following the VDI/VDE 3682 standard. The tool supports the complete modeling workflow including process decomposition, parallel and alternative flows, and technical resource assignments.

For details on VDI/VDE 3682 and its notation, see [VDI 3682 Overview](./docs/VDI3682.md).

## Features

- **Visual Modeling:** drag and drop for Products, Energy, Information, Process Operators and Technical Resources
- **Process Hierarchy:** decompose and compose process operators into sub-processes, with a preview of the layer below
- **Parallel and Alternative Flows:** model concurrent and alternative process paths
- **Model Check:** rules of the VDI 3682 catalogue, shown on the elements, at import and before export
- **Import and Export:** JSON, VDI 3682 XML and AutomationML (AML, keeps the rest of an imported file); export as SVG, PNG and PDF
- **Editing:** undo, copy and paste, search across all layers, keyboard shortcuts
- **Touch and Accessibility:** works on tablets and phones, keyboard operable panels, a colour scheme for colour vision deficiency

## Quick Start

### Local Installation

Requires [Node.js](https://nodejs.org/) 20 or newer.

```bash
npm install
npm run dev
```

The development server opens `http://localhost:3001` in your browser.

### Docker

```bash
docker build -t fpbjs .
docker run -p 8080:80 fpbjs
```

Open `http://localhost:8080` in your browser.

## NPM Package

FPB.JS is also available as an NPM package for integration into your own projects.

```bash
npm install fpbjs
```

[View on NPM](https://www.npmjs.com/package/fpbjs)

Coming from 1.x? Files open unchanged; for hosts, see [Upgrading to 2.0](./docs/UPGRADING-2.0.md) (React and Bootstrap are no longer needed or loaded).

The imports resolve once the model is on the canvas (since 2.1), with the import report and the findings of the model check; they reject with an `FpbImportError` (`code`, `details`) when the content is refused or a newer import replaced the model first. `model.changed` fires for edits only (not for a layer switch, an import or New model); `isDirty()` says whether there are changes that are in no file, `markSaved(data)` tells FPB.js that the host saved the model; pass the data you saved, so edits made while it was written stay unsaved:

```js
try {
  const { warnings, findings } = await fpb.importJSON(json);
} catch (error) {
  console.error(error.code, error.message);
}

const off = fpb.on('model.changed', async () => {
  const data = fpb.toJSON();
  await save(data);
  fpb.markSaved(data);
});
fpb.on('model.dirtyChanged', ({ dirty }) => showUnsaved(dirty));
```

AutomationML import and export are an add-on, off by default like the browser backup, so the package stays without the AML engine:

```js
import { createFpbModeler } from 'fpbjs';
import { AmlModule } from 'fpbjs/aml';

const fpb = await createFpbModeler({ container, additionalModules: [AmlModule] });
```

With script tags, load `dist/fpbjs-aml.js` after `dist/fpbjs.js` and pass `FpbJSAml.AmlModule`. The web app has it on.

Light and dark follow the user's choice, else light. A host decides with the option `theme` (`'light'`, `'dark'` or `'system'` for the setting of the system) or later with `setTheme`; with `'light'` or `'dark'` the toggle in the toolbar is hidden. Only the containers of the modeler change, the page of the host keeps its look:

```js
const fpb = await createFpbModeler({ container, theme: 'dark' });
fpb.setTheme('system');
```

The interface speaks English or German. A host chooses with the option `language` (`'en'`, `'de'`) or later with `setLanguage`; `'user'` shows a language button in the toolbar and keeps the choice in the browser, as the web app does. The terms follow VDI/VDE 3682 Blatt 1 and 2:

```js
const fpb = await createFpbModeler({ container, language: 'de' });
fpb.setLanguage('en');
```

## Citation

If you use FPB.JS in your research, please cite:

> Nabizada, H.; Köcher, A.; Hildebrandt, C.; Fay, A. (2020). **Offenes, webbasiertes Werkzeug zur Informationsmodellierung mit formalisierter Prozessbeschreibung**. In *Automation 2020* (pp. 443-454). VDI Verlag.

[View on ResearchGate](https://www.researchgate.net/publication/340949576_Offenes_webbasiertes_Werkzeug_zur_Informationsmodellierung_mit_Formalisierter_Prozessbeschreibung)

## Disclaimer

This software is provided as-is for testing and feedback purposes. No warranties, express or implied, are given regarding suitability or usability. The authors are not liable for any loss resulting from use of this software.

Found a bug? [Open an issue](https://github.com/HamiedNabizada/FPB.JS/issues)

## License

[MIT](./LICENSE)
