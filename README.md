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
- **Import and Export:** JSON and VDI 3682 XML; export as SVG, PNG and PDF
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

## Citation

If you use FPB.JS in your research, please cite:

> Nabizada, H.; Köcher, A.; Hildebrandt, C.; Fay, A. (2020). **Offenes, webbasiertes Werkzeug zur Informationsmodellierung mit formalisierter Prozessbeschreibung**. In *Automation 2020* (pp. 443-454). VDI Verlag.

[View on ResearchGate](https://www.researchgate.net/publication/340949576_Offenes_webbasiertes_Werkzeug_zur_Informationsmodellierung_mit_Formalisierter_Prozessbeschreibung)

## Disclaimer

This software is provided as-is for testing and feedback purposes. No warranties, express or implied, are given regarding suitability or usability. The authors are not liable for any loss resulting from use of this software.

Found a bug? [Open an issue](https://github.com/HamiedNabizada/FPB.JS/issues)

## License

[MIT](./LICENSE)
