// Library entry that sets up Node.js environment polyfills

// Polyfill globals for webpack chunk loading compatibility (Node.js only)
if (typeof global !== 'undefined' && typeof window === 'undefined' && typeof document === 'undefined') {
  // Only in Node.js environment, provide minimal polyfills for webpack runtime
  try {
    global.document = {
      baseURI: '',
      getElementsByTagName: () => [],
      createElement: () => ({
        setAttribute: () => {},
        parentNode: { removeChild: () => {} }
      }),
      head: { appendChild: () => {} }
    };
    
    global.self = {
      location: { href: '' }
    };
    
    global.window = undefined; // Keep window undefined to maintain server detection
  } catch (e) {
    // Ignore errors in browser environment where these may already exist
  }
}

// Export the main library
export * from './index.js';
export { default } from './index.js';