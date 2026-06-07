// vitest.config.browser.js
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    // Integration-Tests im Browser
    include: ['tests/integration/**/*.test.js'],

    // Browser-Konfiguration
    browser: {
      enabled: true,
      name: 'chromium',
      provider: 'playwright',
      headless: true,

      // Viewport für Tests
      viewport: {
        width: 1280,
        height: 800,
      },
    },

    // Setup
    setupFiles: ['./tests/setup/integration.js'],

    // Längerer Timeout für Browser-Tests
    testTimeout: 30000,

    // Sequentiell ausführen (stabiler)
    sequence: {
      concurrent: false,
    },
  },

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './app'),
      '@fpb': path.resolve(__dirname, './app/fpb'),
    },
  },
});
