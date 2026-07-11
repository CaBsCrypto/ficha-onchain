/**
 * E2E — Verificador Público de Recetas (/verify)
 * Copyright © 2026 Browns Studio
 *
 * Página server-rendered que valida tokens de acceso a prescripciones.
 * Los tests cubren los tres estados: sin token, token inválido y token expirado.
 * No se intenta generar tokens válidos (requieren firma criptográfica del backend).
 */

import { test, expect } from "@playwright/test";

test.describe("Verificador Público (/verify)", () => {
  /* ------------------------------------------------------------------ */
  /*  Sin token — estado de aviso                                          */
  /* ------------------------------------------------------------------ */

  test("sin token muestra aviso descriptivo", async ({ page }) => {
    await page.goto("/verify");

    await expect(
      page.getByRole("heading", { name: /sin token de verificación/i }),
    ).toBeVisible();

    // El cuerpo del aviso indica cómo obtener acceso
    await expect(page.getByText(/escanea el código qr/i)).toBeVisible();
  });

  test("sin token no muestra datos de ninguna prescripción", async ({
    page,
  }) => {
    await page.goto("/verify");

    // No debe haber ningún encabezado de receta verificada
    await expect(
      page.getByText(/receta verificada on-chain/i),
    ).not.toBeVisible();
  });

  /* ------------------------------------------------------------------ */
  /*  Token inválido (firma incorrecta)                                   */
  /* ------------------------------------------------------------------ */

  test("token con formato inválido muestra error 'Token inválido'", async ({
    page,
  }) => {
    await page.goto("/verify?token=INVALID_TOKEN_FORMAT");

    await expect(
      page.getByRole("heading", { name: /token inválido/i }),
    ).toBeVisible();

    await expect(
      page.getByText(/no pudimos validar la firma/i),
    ).toBeVisible();
  });

  test("token inválido no muestra datos de la prescripción", async ({
    page,
  }) => {
    await page.goto("/verify?token=abc123fakeinvalidtoken");

    await expect(
      page.getByText(/receta verificada on-chain/i),
    ).not.toBeVisible();
  });

  /* ------------------------------------------------------------------ */
  /*  Token expirado (JWT válido pero exp en el pasado)                   */
  /*  Nota: un token con formato válido pero expirado mostrará el mensaje */
  /*  de token inválido a menos que el backend distinga el caso.          */
  /* ------------------------------------------------------------------ */

  test("token con payload malformado muestra error", async ({ page }) => {
    // Base64url de un payload JSON sin firma real
    const fakePayload = Buffer.from(
      JSON.stringify({ rxId: "RX-9999", exp: Math.floor(Date.now() / 1000) - 3600 }),
    ).toString("base64url");

    const fakeToken = `eyJhbGciOiJFZERTQSJ9.${fakePayload}.INVALIDSIG`;

    await page.goto(`/verify?token=${encodeURIComponent(fakeToken)}`);

    // Puede mostrar "Token inválido" o "El enlace expiró"
    const errorHeadings = page.getByRole("heading", {
      name: /token inválido|el enlace expiró/i,
    });
    await expect(errorHeadings).toBeVisible();
  });

  /* ------------------------------------------------------------------ */
  /*  Chrome / estructura de página                                       */
  /* ------------------------------------------------------------------ */

  test("muestra el logo de TrustLeaf con link al home", async ({ page }) => {
    await page.goto("/verify");

    const logo = page.getByRole("link", { name: /trustleaf/i });
    await expect(logo).toBeVisible();
    await expect(logo).toHaveAttribute("href", "/");
  });

  test("el pie de página indica lectura desde Stellar Soroban Testnet", async ({
    page,
  }) => {
    await page.goto("/verify");

    await expect(
      page.getByText(/stellar soroban testnet/i),
    ).toBeVisible();
  });

  test("el logo lleva de vuelta a la landing page", async ({ page }) => {
    await page.goto("/verify");

    await page.getByRole("link", { name: /trustleaf/i }).click();

    await expect(page).toHaveURL("/");
    // La landing carga correctamente
    await expect(
      page.getByText(/patient-owned health records on stellar/i),
    ).toBeVisible();
  });

  /* ------------------------------------------------------------------ */
  /*  Query params — distintos formatos de token                          */
  /* ------------------------------------------------------------------ */

  test.describe("variantes de parámetro ?token", () => {
    const invalidTokens = [
      "a",
      "000000",
      "eyJhbGciOiJFZERTQSJ9",
      "not-a-jwt-at-all",
      "../../etc/passwd",
      "%00injected",
    ];

    for (const token of invalidTokens) {
      test(`token="${token}" no expone datos ni crash`, async ({ page }) => {
        await page.goto(`/verify?token=${encodeURIComponent(token)}`);

        // La página siempre debe renderizar (no 500)
        await expect(page.locator("main")).toBeVisible();

        // No debe mostrar datos de receta
        await expect(
          page.getByText(/receta verificada on-chain/i),
        ).not.toBeVisible();
      });
    }
  });
});
