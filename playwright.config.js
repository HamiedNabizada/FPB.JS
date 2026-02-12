// playwright.config.js
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  // Test-Verzeichnis
  testDir: './tests/e2e',

  // Parallele Ausführung
  fullyParallel: true,

  // Keine Retries in Development
  retries: process.env.CI ? 2 : 0,

  // Anzahl Worker
  workers: process.env.CI ? 1 : undefined,

  // Reporter
  reporter: [
    ['html', { open: 'never' }],
    ['list'],
  ],

  // Globale Einstellungen
  use: {
    // URL der Anwendung
    baseURL: 'http://localhost:8080',

    // Screenshots bei Fehler
    screenshot: 'only-on-failure',

    // Video bei Fehler
    video: 'retain-on-failure',

    // Trace bei Fehler
    trace: 'retain-on-failure',

    // Timeout für Aktionen
    actionTimeout: 10000,
  },

  // Projekte (Browser)
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Dev-Server automatisch starten
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:8080',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },

  // Timeout pro Test
  timeout: 60000,
});
