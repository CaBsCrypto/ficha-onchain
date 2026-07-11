/**
 * Playwright E2E configuration — TrustLeaf
 * Copyright © 2026 Browns Studio
 *
 * Corre todos los tests en `e2e/` contra el servidor local de Next.js.
 * Uso:
 *   npm run test:e2e          → headless (CI)
 *   npm run test:e2e:ui       → UI interactiva con timeline
 *   npm run test:e2e:debug    → paso a paso con DevTools
 *   npm run test:e2e:report   → abre el último HTML report
 */

import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  /* Directorio con los specs */
  testDir: "./e2e",

  /* Timeout global por test (30 s) */
  timeout: 30_000,

  /* Timeout por assertion individual */
  expect: {
    timeout: 10_000,
  },

  /* Máximo de reintentos en CI */
  retries: process.env.CI ? 2 : 0,

  /* Paralelismo — desactívalo si el dev server no aguanta carga */
  fullyParallel: true,
  workers: process.env.CI ? 1 : undefined,

  /* Reportes */
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report" }],
  ],

  /* Configuración compartida para todos los proyectos */
  use: {
    baseURL: "http://localhost:3000",

    /* Captura screenshot y video solo cuando falla */
    screenshot: "only-on-failure",
    video: "retain-on-failure",

    /* Tracing para debug post-mortem */
    trace: "retain-on-failure",

    /* Prefiere ES locale neutral */
    locale: "es-CL",
    timezoneId: "America/Santiago",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  /**
   * Levanta Next.js en modo producción antes de la suite.
   * Requiere haber corrido `npm run build` previamente.
   *
   * Para desarrollo rápido sin build:
   *   command: "npm run dev"
   *   reuseExistingServer: true  (descomenta la línea de abajo)
   */
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
  },

  /* Carpeta de salida para screenshots/videos/traces */
  outputDir: "test-results",
});
