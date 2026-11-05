import { defineConfig, devices } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = Number(process.env.E2E_PORT ?? 3399);
const dbPath = join(tmpdir(), `martelo-e2e-${Date.now()}.db`);

export default defineConfig({
  testDir: './e2e',
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
    actionTimeout: 8_000,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] }, testIgnore: /mobile\.spec\.ts/ },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /mobile\.spec\.ts/ },
  ],
  webServer: {
    command: 'npx tsx src/server/main.ts',
    url: `http://127.0.0.1:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      PORT: String(PORT),
      HOST: '127.0.0.1',
      DATABASE_PATH: dbPath,
      GAME_SPEED: 'e2e',
      // Sem escudos remotos: o teste não depende de rede (usa o selo genérico).
      CRESTS_DIR: join(tmpdir(), 'martelo-e2e-sem-escudos'),
      LOG_LEVEL: 'warn',
    },
  },
});
