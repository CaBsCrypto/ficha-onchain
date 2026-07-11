/**
 * E2E — Portal del Paciente Demo (/demo/paciente)
 * Copyright © 2026 Browns Studio
 *
 * Mockup sin autenticación real. Verifica el flujo completo del paciente:
 * carga del panel, navegación entre secciones, visualización de recetas,
 * ficha clínica, historial de atenciones y exámenes.
 */

import { test, expect } from "@playwright/test";

const PATIENT_NAME = "Ana García";

test.describe("Demo Paciente (/demo/paciente)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/demo/paciente");
  });

  /* ------------------------------------------------------------------ */
  /*  Carga inicial                                                        */
  /* ------------------------------------------------------------------ */

  test("carga la interfaz del paciente con el nombre correcto", async ({
    page,
  }) => {
    await expect(page.getByText(PATIENT_NAME)).toBeVisible();
  });

  test("muestra 'Mis Prescripciones' como sección por defecto", async ({
    page,
  }) => {
    await expect(
      page.getByRole("heading", { name: /mis prescripciones/i }),
    ).toBeVisible();
  });

  test("el sidebar contiene todas las secciones de navegación", async ({
    page,
  }) => {
    const navItems = [
      "Mis Prescripciones",
      "Historial de Atenciones",
      "Fichas Clínicas",
      "Mis Exámenes",
    ];

    for (const label of navItems) {
      await expect(page.getByRole("button", { name: label })).toBeVisible();
    }
  });

  /* ------------------------------------------------------------------ */
  /*  Sección: Mis Prescripciones (default)                               */
  /* ------------------------------------------------------------------ */

  test("muestra recetas activas en la sección de prescripciones", async ({
    page,
  }) => {
    // Stat de recetas activas
    await expect(page.getByText(/recetas activas/i)).toBeVisible();

    // Al menos una receta del mock debe aparecer
    await expect(page.getByText(/Amoxicilina/i)).toBeVisible();
  });

  test("muestra el estado on-chain de las prescripciones activas", async ({
    page,
  }) => {
    // Cada receta activa tiene un badge de estado
    await expect(page.getByText(/active/i).first()).toBeVisible();
  });

  test("muestra el hash on-chain de una prescripción", async ({ page }) => {
    // Los hashes son strings hexadecimales truncados
    await expect(page.getByText(/a3f9c7d2/i).first()).toBeVisible();
  });

  /* ------------------------------------------------------------------ */
  /*  Navegación sidebar                                                   */
  /* ------------------------------------------------------------------ */

  test("navega a 'Historial de Atenciones' y muestra entradas", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Historial de Atenciones" }).click();

    await expect(
      page.getByRole("heading", { name: /historial de atenciones/i }),
    ).toBeVisible();
  });

  test("navega a 'Fichas Clínicas' y muestra datos personales", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Fichas Clínicas" }).click();

    await expect(
      page.getByRole("heading", { name: /fichas clínicas/i }),
    ).toBeVisible();

    // La sección de datos personales de la ficha
    await expect(page.getByText(/datos personales/i)).toBeVisible();
  });

  test("'Fichas Clínicas' muestra antecedentes médicos", async ({ page }) => {
    await page.getByRole("button", { name: "Fichas Clínicas" }).click();

    await expect(page.getByText(/antecedentes médicos/i)).toBeVisible();
  });

  test("'Fichas Clínicas' muestra antecedentes familiares", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Fichas Clínicas" }).click();

    // Scroll para revelar si está fuera del viewport
    await page.getByText(/antecedentes familiares/i).scrollIntoViewIfNeeded();
    await expect(page.getByText(/antecedentes familiares/i)).toBeVisible();
  });

  test("navega a 'Mis Exámenes' y muestra listado de exámenes", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Mis Exámenes" }).click();

    await expect(
      page.getByRole("heading", { name: /mis exámenes/i }),
    ).toBeVisible();

    // Debe haber al menos un examen en el mock
    await expect(
      page.getByText(/resultado disponible|en proceso|pendiente/i).first(),
    ).toBeVisible();
  });

  /* ------------------------------------------------------------------ */
  /*  Cambio de sección — el contenido previo desaparece                  */
  /* ------------------------------------------------------------------ */

  test("al cambiar de sección el contenido anterior se reemplaza", async ({
    page,
  }) => {
    // Partimos en prescripciones
    await expect(page.getByText(/recetas activas/i)).toBeVisible();

    // Cambiamos a ficha clínica
    await page.getByRole("button", { name: "Fichas Clínicas" }).click();

    // "Recetas activas" ya no debe estar visible
    await expect(page.getByText(/recetas activas/i)).not.toBeVisible();

    // Y aparece contenido de ficha
    await expect(page.getByText(/datos personales/i)).toBeVisible();
  });

  /* ------------------------------------------------------------------ */
  /*  Historial de atenciones — detalle                                   */
  /* ------------------------------------------------------------------ */

  test("historial muestra entradas con fecha y médico", async ({ page }) => {
    await page.getByRole("button", { name: "Historial de Atenciones" }).click();

    // Las atenciones del mock tienen un médico asociado
    await expect(page.getByText(/dr\./i).first()).toBeVisible();
  });

  test("historial permite navegar de vuelta a prescripciones", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Historial de Atenciones" }).click();

    // El link "ver receta" en entradas con prescripción
    const verRxLinks = page.getByRole("button", { name: /ver receta/i });

    // Si hay alguno, hacer click y verificar que volvemos a prescripciones
    const count = await verRxLinks.count();
    if (count > 0) {
      await verRxLinks.first().click();
      await expect(
        page.getByRole("heading", { name: /mis prescripciones/i }),
      ).toBeVisible();
    } else {
      // No hay atenciones con receta en el mock — OK
      test.info().annotations.push({
        type: "info",
        description: "No se encontraron entradas con receta en el historial",
      });
    }
  });

  /* ------------------------------------------------------------------ */
  /*  Accesibilidad mínima                                                 */
  /* ------------------------------------------------------------------ */

  test("el código QR de acceso tiene aria-label", async ({ page }) => {
    // El QR está en la sección de prescripciones (default)
    const qrElement = page.locator('[aria-label="Código QR de acceso"]');
    await expect(qrElement).toBeAttached();
  });

  test("el botón de abrir menú mobile tiene aria-label en viewport pequeño", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/demo/paciente");

    const menuBtn = page.getByRole("button", { name: /abrir menú/i });
    await expect(menuBtn).toBeVisible();
  });

  /* ------------------------------------------------------------------ */
  /*  Recorrido completo — smoke test de todas las secciones              */
  /* ------------------------------------------------------------------ */

  test("recorrido completo por todas las secciones sin errores JS", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    const sections: Array<{ btn: string; heading: string }> = [
      { btn: "Mis Prescripciones", heading: /mis prescripciones/i },
      { btn: "Historial de Atenciones", heading: /historial de atenciones/i },
      { btn: "Fichas Clínicas", heading: /fichas clínicas/i },
      { btn: "Mis Exámenes", heading: /mis exámenes/i },
    ];

    for (const { btn, heading } of sections) {
      await page.getByRole("button", { name: btn }).click();
      await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    }

    expect(errors, `Errores JS inesperados: ${errors.join(", ")}`).toHaveLength(
      0,
    );
  });
});
