# FPB.JS Example: Import / Export

> Loading and saving diagrams as JSON, XML, and SVG.

## About

This example demonstrates all import and export capabilities of FPB.JS:
- **Import** diagrams from JSON or VDI 3682 XML files
- **Export** the current diagram as JSON, XML, or SVG
- **Download** exports as files

## Import

### From JSON

```javascript
const fpb = await createFpbModeler({ container });

// Import from a JSON object (FPB.JS internal format)
fpb.importJSON(jsonData);
```

### From XML (VDI 3682)

```javascript
// Import from an XML string (VDI 3682 format)
fpb.importXML(xmlString);
```

### Loading from a file

```javascript
const input = document.createElement('input');
input.type = 'file';
input.accept = '.json,.xml';
input.onchange = (e) => {
  const reader = new FileReader();
  reader.onload = (event) => {
    const content = event.target.result;

    if (input.accept.includes('json')) {
      fpb.importJSON(JSON.parse(content));
    } else {
      fpb.importXML(content);
    }
  };
  reader.readAsText(e.target.files[0]);
};
input.click();
```

## Export

### To JSON

```javascript
const json = fpb.toJSON();
// Returns the complete project as a JavaScript object
```

### To XML (VDI 3682)

```javascript
const xml = fpb.toXML();
// Returns the diagram as a VDI 3682 compliant XML string
```

### To SVG

```javascript
const svg = fpb.toSVG();
// Returns the diagram as an SVG string (for embedding or rendering)
```

### Download as file

```javascript
function download(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Download JSON
download(JSON.stringify(fpb.toJSON(), null, 2), 'diagram.json', 'application/json');

// Download XML
download(fpb.toXML(), 'diagram.xml', 'application/xml');
```

## Run

```bash
npm install
npm start
```

Opens at [http://localhost:3102](http://localhost:3102).

## License

MIT
