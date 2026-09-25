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
    baseURL: 'http://localhost:3001',

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
  // Chromium ist der Standard (`npm run test:e2e`). Firefox und WebKit (die
  // Engine von Safari) laufen mit `--project=firefox` bzw. `--project=webkit`;
  // einmalig vorher `npx playwright install firefox webkit`.
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],

  // Dev-Server automatisch starten
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3001',
    reuseExistingServer: !process.env.CI,
    // Der Dev-Server baut beim Start das komplette Bundle; auf CI-Runnern
    // dauert das deutlich laenger als lokal.
    timeout: 180000,
  },

  // Timeout pro Test
  timeout: 60000,
});
