/**
 * Guardrails for the MCP tool surface.
 *
 * These exist because of a specific failure: an audit found that `kind` — the one
 * caller-supplied field that ends up readable and permanent on-chain, next to a
 * person's identity — was free text, and that tool arguments were coerced with
 * `String(x)` instead of validated, so `{a:1}` anchored the hash of the literal
 * "[object Object]" and reported success.
 *
 * `route.ts` is a Next route handler and can only export HTTP verbs, so the
 * invariants are asserted against the source rather than by importing it. That is
 * deliberate: a regression here is a silent, permanent disclosure, and a slightly
 * awkward test is a fair price for catching it in CI.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

// Line endings are normalised because these assertions match on source layout,
// and a Windows checkout hands back CRLF: a regex anchored on `\n` then matches
// nothing and the loops below iterate zero times — a test that passes by finding
// no code to check. That happened; the `toBeGreaterThan(0)` guards caught it.
const ROUTE = readFileSync(join(process.cwd(), "src/app/api/mcp/route.ts"), "utf8").replace(
  /\r\n/g,
  "\n",
);

/** The closed list as it must appear in route.ts. Change BOTH deliberately. */
const EXPECTED_KINDS = [
  "MedicationRequest",
  "MedicationStatement",
  "DiagnosticReport",
  "Observation",
  "Condition",
  "AllergyIntolerance",
  "Immunization",
  "Procedure",
  "Encounter",
  "CarePlan",
  "DocumentReference",
];

function declaredKinds(): string[] {
  const block = ROUTE.match(/const ALLOWED_KINDS = \[([\s\S]*?)\] as const;/);
  if (!block) throw new Error("no se encontró ALLOWED_KINDS en route.ts");
  return [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

describe("ALLOWED_KINDS", () => {
  it("es exactamente la lista acordada", () => {
    // Fails on purpose if someone widens the list without updating this test —
    // each new value is a new word permanently public next to a patient.
    expect(declaredKinds()).toEqual(EXPECTED_KINDS);
  });

  it("no contiene términos clínicos ni diagnósticos", () => {
    // The whole point: `kind` says what TYPE of artifact it is, never what it says.
    const clinical = /vih|hiv|cancer|cáncer|psiquiat|aborto|adicc|tarv|sida|embarazo/i;
    for (const k of declaredKinds()) expect(k).not.toMatch(clinical);
  });

  it("mantiene DocumentReference como válvula de escape", () => {
    // Without it, an integrator whose artifact fits nothing is forced to
    // mislabel — which is worse than a generic label.
    expect(declaredKinds()).toContain("DocumentReference");
  });
});

describe("validación de argumentos", () => {
  it("requireString rechaza por tipo en vez de coercionar", () => {
    expect(ROUTE).toMatch(/function requireString[\s\S]*?typeof v !== "string"/);
    // A single String(args.…) on a field that gets hashed reintroduces the bug.
    expect(ROUTE).not.toMatch(/String\(args\.(kind|content|patient_rut)/);
  });

  it("anchor_record valida kind contra la lista y content como string", () => {
    const handler = ROUTE.match(/anchor_record:[\s\S]*?requireCtx\(ctx\)([\s\S]*?)try \{/);
    expect(handler?.[1]).toMatch(/requireKind\(args\)/);
    expect(handler?.[1]).toMatch(/requireString\(args, "content"/);
  });
});

describe("registro de tools", () => {
  it("las tools de aprobación simulada siguen fuera del registro", () => {
    // verify_approval returned "approved" signed by a fictional doctor for any
    // id. It only comes back with a real signature route behind it.
    const registry = ROUTE.match(/const TOOLS: Record<string, Tool> = \{[\s\S]*?\n\};/)?.[0] ?? "";
    // Without this, a registry the regex fails to locate is an empty string, and
    // "the empty string does not contain create_approval" is a green test.
    expect(registry).toMatch(/anchor_record:/);
    expect(registry).not.toMatch(/\bcreate_approval:/);
    expect(registry).not.toMatch(/\bverify_approval:/);
  });

  it("toda tool protegida declara un scope", () => {
    // The gate denies when `scope` is missing, so this is defence in depth: a
    // tool with requiresAuth and no scope is dead on arrival, not wide open.
    const tools = [...ROUTE.matchAll(/\n  (\w+): \{\n([\s\S]*?)\n  \},/g)];
    expect(tools.length).toBeGreaterThan(0);
    for (const [, name, body] of tools) {
      if (/requiresAuth: true/.test(body)) {
        expect(body, `la tool ${name} declara requiresAuth sin scope`).toMatch(/scope: "/);
      }
    }
  });
});
