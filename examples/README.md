# FPB.JS Examples

This directory contains examples demonstrating how to use [FPB.JS](https://github.com/HamiedNabizada/FPB.JS) in different scenarios.

## Examples

| Example | Description | Complexity |
|---------|-------------|------------|
| [starter](./starter) | Minimal modeler setup with properties panel and layer overview | Starter |
| [event-export](./event-export) | Event-based data export for backend integration | Intermediate |
| [import-export](./import-export) | Loading and saving diagrams as JSON and XML | Intermediate |

## Prerequisites

All examples require [Node.js](https://nodejs.org/) (v16 or later) and npm.

## Running an Example

Each example is a self-contained project. To run one:

```bash
cd examples/starter
npm install
npm start
```

## Local Development

To test examples against a local FPB.JS build (instead of the npm package), use `npm link`:

```bash
# In the FPB.JS root directory
npm link

# In the example directory
npm link fpbjs
```

## License

MIT
