/**
 * E2E — Landing Page (/)
 * Copyright © 2026 Browns Studio
 *
 * Verifica que la landing de TrustLeaf carga correctamente y que
 * los puntos de entrada principales (Demo Médico, Demo Paciente, CTA)
 * están presentes y funcionales.
 */

import { test, expect } from "@playwright/test";

test.describe("Landing Page (/)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("carga correctamente y muestra el título principal", async ({
    page,
  }) => {
    await expect(page).toHaveTitle(/TrustLeaf/i);

    // El navbar incluye el logo "TrustLeaf"
    const brand = page.getByRole("link", { name: /trustleaf/i }).first();
    await expect(brand).toBeVisible();
  });

  test("muestra el badge hero con la propuesta de valor", async ({ page }) => {
    // "Patient-owned health records on Stellar"
    const badge = page.getByText(/patient-owned health records on stellar/i);
    await expect(badge).toBeVisible();
  });

  test("CTA principal 'Join the Waitlist' está visible", async ({ page }) => {
    // Hay dos instancias (hero + waitlist section); basta con que exista al menos una
    const cta = page.getByRole("button", { name: /join.*waitlist/i }).first();
    await expect(cta).toBeVisible();
  });

  test("link 'Patient Demo' está presente y apunta a /demo/paciente", async ({
    page,
  }) => {
    const demoPatient = page
      .getByRole("link", { name: /patient demo/i })
      .first();
    await expect(demoPatient).toBeVisible();
    await expect(demoPatient).toHaveAttribute("href", "/demo/paciente");
  });

  test("link 'Doctor Demo' está presente y apunta a /demo/medico", async ({
    page,
  }) => {
    const demoDoctor = page
      .getByRole("link", { name: /doctor demo/i })
      .first();
    await expect(demoDoctor).toBeVisible();
    await expect(demoDoctor).toHaveAttribute("href", "/demo/medico");
  });

  test("navegar al Demo Paciente desde la landing", async ({ page }) => {
    const demoPatient = page
      .getByRole("link", { name: /patient demo/i })
      .first();
    await demoPatient.click();

    await expect(page).toHaveURL(/\/demo\/paciente/);
    // La página del paciente debe cargar
    await expect(page.getByText(/Ana García/i)).toBeVisible();
  });

  test("navegar al Demo Médico desde la landing", async ({ page }) => {
    const demoDoctor = page
      .getByRole("link", { name: /doctor demo/i })
      .first();
    await demoDoctor.click();

    await expect(page).toHaveURL(/\/demo\/medico/);
    // La página del médico debe cargar
    await expect(page.getByText(/Dra\. Valentina Reyes/i)).toBeVisible();
  });

  test("la sección 'How It Works' está presente", async ({ page }) => {
    const section = page.getByRole("region").filter({
      hasText: /how it works|cómo funciona/i,
    });
    // Scroll suave para activar cualquier animación lazy
    await page.evaluate(() =>
      document.querySelector("#how")?.scrollIntoView({ behavior: "smooth" }),
    );
    // Verificamos al menos que el id existe
    const howAnchor = page.locator("#how");
    await expect(howAnchor).toBeAttached();
  });

  test("el footer está presente", async ({ page }) => {
    await page.evaluate(() =>
      window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }),
    );
    const footer = page.locator("footer");
    await expect(footer).toBeVisible();
  });
});
