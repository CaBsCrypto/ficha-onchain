/**
 * Every nav destination must be a real route.
 *
 * This exists because six of the eleven entries in Navbar.tsx pointed at pages
 * that were never built or had been renamed — `/farmacia` (the route is
 * `/pharmacy`), `/verify/demo` (it is `/verify`), plus `/for-doctors` and
 * `/pricing`, which do not exist at all. They 404'd in the shipped product and
 * nothing caught it, because a broken `<Link>` compiles and type-checks fine.
 *
 * Like mcp-tools.test.ts this asserts against source text, so the same two
 * precautions apply: normalise line endings (the checkout is CRLF on Windows,
 * where a regex anchored on \n matches nothing and the test passes having
 * checked zero links), and assert we actually found links before looping.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

const NAVBAR = readFileSync(join(process.cwd(), "src/components/Navbar.tsx"), "utf8").replace(
  /\r\n/g,
  "\n",
);

/** Does `src/app/<segments>/page.tsx` exist, allowing for [dynamic] segments? */
function routeExists(pathname: string): boolean {
  const segments = pathname.split("/").filter(Boolean);
  let dir = join(process.cwd(), "src/app");
  for (const segment of segments) {
    const literal = join(dir, segment);
    if (existsSync(literal)) {
      dir = literal;
      continue;
    }
    return false; // no literal match; dynamic segments aren't used in the nav
  }
  return existsSync(join(dir, "page.tsx"));
}

describe("enlaces de navegación", () => {
  // Both shapes, because the first version of this test only read the NavLink
  // arrays and missed four <Link href="…"> written inline in JSX — two of them
  // pointing at /login?demo=…, a route that never existed.
  const hrefs = [
    ...[...NAVBAR.matchAll(/\{ href: "([^"]+)"/g)].map((m) => m[1]),
    ...[...NAVBAR.matchAll(/href="([^"]+)"/g)].map((m) => m[1]),
  ];

  it("encuentra los enlaces del Navbar", () => {
    // Without this the suite is green when the regex stops matching.
    expect(hrefs.length).toBeGreaterThan(0);
  });

  it("todo href interno apunta a una ruta que existe", () => {
    for (const href of hrefs) {
      if (href.startsWith("http")) continue; // external, not ours to verify
      // `/#how-it-works` and `/patient?tab=x` resolve to their base route.
      const pathname = href.split(/[?#]/)[0] || "/";
      expect(routeExists(pathname), `el enlace ${href} no resuelve a ninguna ruta`).toBe(true);
    }
  });

  it("no quedan superficies de demostración enlazadas", () => {
    // /demo/medico and /demo/paciente were 1900-line mockups that displayed a
    // fabricated Stellar transaction hash (`fakeStellarHash`) under the words
    // "El registro fue acuñado", with no network request behind it. They are
    // deleted; this keeps a link from resurrecting them.
    expect(existsSync(join(process.cwd(), "src/app/demo"))).toBe(false);
    for (const href of hrefs) expect(href).not.toMatch(/^\/demo\b/);
  });
});
