// vitest.config.js
import { defineConfig } from 'vitest/config';
import path from 'path';
import buildAliases from './build/aliases.js';

// The editors of @bpmn-io/properties-panel are stubbed as in both webpack
// builds (build/aliases.js, keys ending in $ match the exact name only)
const editorStubs = Object.keys(buildAliases).map((name) => ({
  find: new RegExp('^' + name.slice(0, -1).replace(/[.*+?^${}()|[\]\\/]/g, '\\$&') + '$'),
  replacement: buildAliases[name],
}));

export default defineConfig({
  test: {
    // Test-Umgebung: happy-dom ist schneller als jsdom
    environment: 'happy-dom',

    // Nur Unit-Tests
    include: ['tests/unit/**/*.test.js'],

    // Globale Test-APIs (describe, it, expect)
    globals: true,

    // Setup vor allen Tests
    setupFiles: ['./tests/setup/unit.js'],

    // Coverage-Konfiguration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['app/fpb/**/*.js'],
      exclude: [
        'app/fpb/**/*.test.js',
        'app/fpb/**/index.js',
      ],
    },

    // Timeout für langsame Tests
    testTimeout: 10000,

    // Through Vite, so the editor stubs above apply inside the package too
    server: {
      deps: {
        inline: ['@bpmn-io/properties-panel'],
      },
    },
  },

  resolve: {
    alias: [
      ...editorStubs,
      // Aliase für einfachere Imports
      { find: '@', replacement: path.resolve(__dirname, './app') },
      { find: '@fpb', replacement: path.resolve(__dirname, './app/fpb') },
      { find: '@tests', replacement: path.resolve(__dirname, './tests') },
    ],
  },
});
