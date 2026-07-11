/**
 * E2E — Portal del Médico Demo (/demo/medico)
 * Copyright © 2026 Browns Studio
 *
 * Mockup sin autenticación real. Verifica el flujo completo del médico:
 * carga del panel, navegación por el sidebar, emisión de una prescripción
 * simulada y visualización de historial/estadísticas.
 */

import { test, expect } from "@playwright/test";

const DOCTOR_NAME = "Dra. Valentina Reyes";

test.describe("Demo Médico (/demo/medico)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/demo/medico");
  });

  /* ------------------------------------------------------------------ */
  /*  Carga inicial                                                        */
  /* ------------------------------------------------------------------ */

  test("carga la interfaz del médico con el nombre correcto", async ({
    page,
  }) => {
    await expect(page.getByText(DOCTOR_NAME)).toBeVisible();
  });

  test("muestra la sección 'Mi Agenda' por defecto", async ({ page }) => {
    // El título de la sección activa al cargar
    await expect(
      page.getByRole("heading", { name: /mi agenda/i }),
    ).toBeVisible();
  });

  test("el sidebar contiene todas las secciones de navegación", async ({
    page,
  }) => {
    const navItems = [
      "Mi Agenda",
      "Mis Pacientes",
      "Emitir Prescripción",
      "Historial de Atenciones",
      "Estadísticas",
      "Mi Cuenta",
    ];

    for (const label of navItems) {
      await expect(page.getByRole("button", { name: label })).toBeVisible();
    }
  });

  /* ------------------------------------------------------------------ */
  /*  Navegación sidebar                                                   */
  /* ------------------------------------------------------------------ */

  test("navega a 'Mis Pacientes' y muestra la tabla de pacientes", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Mis Pacientes" }).click();

    await expect(
      page.getByRole("heading", { name: /mis pacientes/i }),
    ).toBeVisible();

    // La tabla de prescripciones emitidas debe estar presente
    await expect(page.getByRole("table")).toBeVisible();

    // Al menos un paciente conocido del mock
    await expect(page.getByText(/María González/i)).toBeVisible();
  });

  test("navega a 'Emitir Prescripción' directamente desde el sidebar", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Emitir Prescripción" }).click();

    await expect(
      page.getByRole("heading", { name: /emitir prescripción/i }),
    ).toBeVisible();

    // El form de nueva prescripción debe aparecer
    await expect(page.getByText(/nueva prescripción/i)).toBeVisible();
  });

  test("navega a 'Historial de Atenciones'", async ({ page }) => {
    await page.getByRole("button", { name: "Historial de Atenciones" }).click();

    await expect(
      page.getByRole("heading", { name: /historial de atenciones/i }),
    ).toBeVisible();
  });

  test("navega a 'Estadísticas'", async ({ page }) => {
    await page.getByRole("button", { name: "Estadísticas" }).click();

    await expect(
      page.getByRole("heading", { name: /estadísticas/i }),
    ).toBeVisible();
  });

  test("navega a 'Mi Cuenta' y muestra datos del médico", async ({ page }) => {
    await page.getByRole("button", { name: "Mi Cuenta" }).click();

    await expect(
      page.getByRole("heading", { name: /mi cuenta/i }),
    ).toBeVisible();

    // Debe mostrar el nombre del médico y su especialidad
    await expect(page.getByText(DOCTOR_NAME)).toBeVisible();
    await expect(page.getByText(/medicina interna/i)).toBeVisible();
  });

  /* ------------------------------------------------------------------ */
  /*  Flujo: Mis Pacientes → Emitir Prescripción                          */
  /* ------------------------------------------------------------------ */

  test("el botón 'Nueva Prescripción' en Mis Pacientes navega al form", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Mis Pacientes" }).click();

    // Espera que aparezca el botón de nueva prescripción dentro de la sección
    const newRxBtn = page.getByRole("button", { name: /nueva prescripción/i });
    await expect(newRxBtn).toBeVisible();

    await newRxBtn.click();

    // Debe haber navegado a la sección Emitir
    await expect(
      page.getByRole("heading", { name: /emitir prescripción/i }),
    ).toBeVisible();
    await expect(page.getByText(/nueva prescripción/i)).toBeVisible();
  });

  /* ------------------------------------------------------------------ */
  /*  Flujo completo: llenar y enviar formulario de prescripción          */
  /* ------------------------------------------------------------------ */

  test("llena el formulario de prescripción y lo envía correctamente", async ({
    page,
  }) => {
    // Ir directo a la sección emitir
    await page.getByRole("button", { name: "Emitir Prescripción" }).click();

    // Rellenar campos obligatorios
    await page
      .getByPlaceholder(/María González/i)
      .fill("Juan Pérez — test E2E");
    await page.getByPlaceholder(/Amoxicilina 500mg/i).fill("Ibuprofeno 400mg");
    await page.getByPlaceholder(/1 cápsula c\/8h/i).fill("1 comprimido c/8h");
    await page.getByPlaceholder("7").fill("5");

    // El botón de submit debe estar habilitado
    const submitBtn = page.getByRole("button", {
      name: /emitir prescripción en stellar/i,
    });
    await expect(submitBtn).toBeEnabled();

    await submitBtn.click();

    // Mientras procesa aparece el spinner
    await expect(page.getByText(/firmando en stellar/i)).toBeVisible();

    // Después de ~3s debe mostrar la confirmación
    await expect(page.getByText(/prescripción emitida/i)).toBeVisible({
      timeout: 10_000,
    });
  });

  test("el botón de envío está deshabilitado con campos vacíos", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Emitir Prescripción" }).click();

    const submitBtn = page.getByRole("button", {
      name: /emitir prescripción en stellar/i,
    });
    await expect(submitBtn).toBeDisabled();
  });

  /* ------------------------------------------------------------------ */
  /*  Agenda (sección por defecto)                                        */
  /* ------------------------------------------------------------------ */

  test("la agenda muestra resumen semanal con métricas", async ({ page }) => {
    // Citas, urgencias, canceladas
    await expect(page.getByText(/citas/i)).toBeVisible();
    await expect(page.getByText(/urgencias/i)).toBeVisible();
    await expect(page.getByText(/canceladas/i)).toBeVisible();
  });

  test("la agenda muestra citas con nombre del paciente y hora", async ({
    page,
  }) => {
    // Al menos una cita del mock debe ser visible
    await expect(page.getByText(/Hoy|Mañana/i).first()).toBeVisible();
  });

  /* ------------------------------------------------------------------ */
  /*  Accesibilidad mínima                                                 */
  /* ------------------------------------------------------------------ */

  test("el botón de abrir menú mobile tiene aria-label", async ({ page }) => {
    // Viewport mobile para activar el botón hamburguesa
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/demo/medico");

    const menuBtn = page.getByRole("button", { name: /abrir menú/i });
    await expect(menuBtn).toBeVisible();
  });
});
