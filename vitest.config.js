// vitest.config.js
import { defineConfig } from 'vitest/config';
import path from 'path';

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
  },

  resolve: {
    alias: {
      // Aliase für einfachere Imports
      '@': path.resolve(__dirname, './app'),
      '@fpb': path.resolve(__dirname, './app/fpb'),
      '@tests': path.resolve(__dirname, './tests'),
    },
  },
});
