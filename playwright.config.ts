import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

/**
 * E2E tesztek mock-módban (TICKET-11).
 *
 * A webet egy nem elérhető API-címmel és `VITE_DEMO_MODE=true`-val buildeljük,
 * `vite preview`-val szolgáljuk ki, így minden API-hívás hálózati hibára fut, és
 * a kliens a beépített mock-motorra (`apps/web/src/shared/api/mock-engine.ts`) esik vissza. API és
 * adatbázis nem kell. A dev szerver helyett azért preview, mert a Vite dev
 * futás közbeni függőség-optimalizálása oldal-újratöltést okoz (flaky tesztek).
 * A részleteket lásd: `e2e/README.md`.
 */
const PORT = Number(process.env.E2E_PORT ?? 5180);
const BASE_URL = `http://localhost:${PORT}`;
// A 9-es (discard) portot a böngésző eleve tiltja: a fetch azonnal "Failed to fetch"-csel elhasal.
const UNREACHABLE_HOST = 'http://127.0.0.1:9';
// Abszolút útvonal: a vite a `@reform/web` workspace könyvtárából fut.
const OUT_DIR = path.resolve(__dirname, '.e2e-dist');
const vite = 'npm --workspace=@reform/web exec -- vite';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : 4,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: BASE_URL,
    locale: 'hu-HU',
    timezoneId: 'Europe/Budapest',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    command: `${vite} build --outDir "${OUT_DIR}" --emptyOutDir && ${vite} preview --outDir "${OUT_DIR}" --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      VITE_API_URL: `${UNREACHABLE_HOST}/api`,
      VITE_WS_URL: UNREACHABLE_HOST,
      // A mock fallback csak demó módban engedélyezett (TICKET-17).
      VITE_DEMO_MODE: 'true',
    },
  },
});
