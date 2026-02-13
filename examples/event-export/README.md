# FPB.JS Example: Event-Based Export

> Demonstrates the event-based data export pattern for integrating FPB.JS with external systems.

## About

FPB.JS supports an event-based export mechanism where diagram data is sent via custom events instead of direct file downloads. This is ideal for:
- Sending diagram data to a backend API
- Integrating FPB.JS into larger applications (e.g. PLM systems)
- Real-time synchronization between editor and external storage

This is the same pattern used by the built-in DownloadModal's "Export as Event" option.

## How It Works

### 1. Register an event listener

```javascript
const fpb = await createFpbModeler({ container });

fpb.on('fpbjs', (event) => {
  // event.data   - the diagram data (JSON object or XML string)
  // event.format - 'json' or 'xml'
  sendToBackend(event.data, event.format);
});
```

### 2. Trigger export by firing the event

```javascript
// Export as JSON
fpb.fire('fpbjs', { data: fpb.toJSON(), format: 'json' });

// Export as XML
fpb.fire('fpbjs', { data: fpb.toXML(), format: 'xml' });
```

### Custom Event Names

The event name is freely choosable. Use any string that fits your application:

```javascript
fpb.on('myApp.diagramSaved', (event) => { ... });
fpb.fire('myApp.diagramSaved', { data: fpb.toJSON(), format: 'json' });
```

The default event name in the built-in DownloadModal is `'fpbjs'`.

## Backend Integration Example

```javascript
fpb.on('fpbjs', async (event) => {
  const response = await fetch('/api/diagrams', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      data: event.data,
      format: event.format
    })
  });

  if (response.ok) {
    console.log('Diagram saved to backend');
  }
});
```

## Run

```bash
npm install
npm start
```

Opens at [http://localhost:3101](http://localhost:3101).

## License

MIT
