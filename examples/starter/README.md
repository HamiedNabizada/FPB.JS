# FPB.JS Example: Starter

> Minimal FPB.JS modeler setup with properties panel and layer overview.

## About

This example shows the simplest way to set up a complete FPB.JS modeler with:
- Diagram canvas for creating process descriptions
- Properties panel for editing element attributes
- Layer overview for navigating decomposition layers

![Starter Example](./docs/screenshot.png)

## Setup

The modeler is created with a single function call:

```javascript
import { createFpbModeler } from 'fpbjs';

const fpb = await createFpbModeler({
  container: document.getElementById('modeler-container'),
  propertiesContainer: document.getElementById('properties-container'),
  layerContainer: document.getElementById('layer-container')
});
```

## Listening to Events

You can listen to diagram events using the `on()` method:

```javascript
fpb.on('changed', () => {
  console.log('Diagram changed');
});

fpb.on('selection.changed', (event) => {
  console.log('Selected:', event.newSelection);
});
```

Available events: `changed`, `element.added`, `element.removed`, `element.changed`, `selection.changed`, `process.switched`.

## Run

```bash
npm install
npm start
```

Opens at [http://localhost:3100](http://localhost:3100).

## License

MIT
