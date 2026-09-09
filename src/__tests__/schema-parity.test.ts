/**
 * Schema parity: scripts/migrate.mjs (dev, source of truth) versus
 * src/app/api/admin/migrate/route.ts (the only way to migrate prod).
 *
 * The schema deliberately lives in those two places — AGENTS.md says "change
 * one, change the other" — and that rule was broken silently: the consent
 * columns on appointments were added to the script but never to the route, so
 * production lacked them and the patient's "Iniciar consulta" died with
 * db_error during the demo rehearsal. Nothing failed until a person clicked
 * the button in prod.
 *
 * This test extracts every CREATE TABLE and every ALTER TABLE … ADD COLUMN
 * from both files and fails on any table or column present in one and missing
 * in the other. It reads source text, so (lesson from mcp-tools.test.ts) line
 * endings are normalised and every extraction asserts it found something —
 * a regex that matches nothing must be a failure, not a pass.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

// Comment lines are dropped before matching: migrate.mjs has a comment that
// literally says "CREATE TABLE IF NOT EXISTS above is a no-op", which the raw
// regex reads as a table called "above".
const read = (p: string) =>
  readFileSync(join(process.cwd(), p), "utf8")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((l) => !/^\s*(\/\/|\*|--)/.test(l))
    .join("\n");

const MJS = read("scripts/migrate.mjs");
const ROUTE = read("src/app/api/admin/migrate/route.ts");

function tables(src: string): Set<string> {
  return new Set(
    [...src.matchAll(/CREATE TABLE IF NOT EXISTS ([a-z_]+)/g)].map((m) => m[1]),
  );
}

function columns(src: string): Set<string> {
  // "table.column" pairs from ALTER TABLE t ADD COLUMN IF NOT EXISTS c …
  return new Set(
    [...src.matchAll(/ALTER TABLE ([a-z_]+) ADD COLUMN IF NOT EXISTS ([a-z_]+)/g)].map(
      (m) => `${m[1]}.${m[2]}`,
    ),
  );
}

const diff = (a: Set<string>, b: Set<string>) => [...a].filter((x) => !b.has(x)).sort();

describe("paridad de esquema entre migrate.mjs y /api/admin/migrate", () => {
  const mjsTables = tables(MJS);
  const routeTables = tables(ROUTE);
  const mjsCols = columns(MJS);
  const routeCols = columns(ROUTE);

  it("las extracciones encuentran esquema real (anti-CRLF, anti-regex-muerto)", () => {
    expect(mjsTables.size).toBeGreaterThan(5);
    expect(routeTables.size).toBeGreaterThan(5);
    expect(mjsCols.size).toBeGreaterThan(5);
    expect(routeCols.size).toBeGreaterThan(5);
    // Un ancla conocida por lado, para que un cambio de formato no vacíe todo.
    expect(mjsTables.has("appointments")).toBe(true);
    expect(routeCols.has("appointments.consent_tx")).toBe(true);
  });

  it("toda tabla del script existe en la ruta de prod, y viceversa", () => {
    expect(diff(mjsTables, routeTables), "tablas SOLO en migrate.mjs — prod nunca las creará").toEqual([]);
    expect(diff(routeTables, mjsTables), "tablas SOLO en la ruta — dev nunca las creará").toEqual([]);
  });

  it("toda columna del script existe en la ruta de prod, y viceversa", () => {
    expect(diff(mjsCols, routeCols), "columnas SOLO en migrate.mjs — prod nunca las tendrá").toEqual([]);
    expect(diff(routeCols, mjsCols), "columnas SOLO en la ruta — dev nunca las tendrá").toEqual([]);
  });

  const normalize = (value: string) => value.replace(/\s+/g, ' ').trim();
  function statement(source: string, pattern: RegExp): string {
    const found = source.match(pattern)?.[0];
    expect(found, `Missing migration definition: ${pattern}`).toBeTruthy();
    return normalize(found!);
  }
  it('mantiene las restricciones completas de las operaciones privadas, no sólo el nombre de tabla', () => {
    const pattern = /CREATE TABLE IF NOT EXISTS private_operations \([\s\S]*?\)\s*(?=`)/;
    expect(statement(MJS, pattern)).toBe(statement(ROUTE, pattern));
    for (const name of ['private_operations_one_live_source','private_operations_appointment']) {
      const index = new RegExp(`CREATE (?:UNIQUE )?INDEX IF NOT EXISTS ${name}[^\\x60]+`);
      expect(statement(MJS, index)).toBe(statement(ROUTE, index));
    }
  });
  it('mantiene tipos y valores iniciales de los snapshots y del historial firmado', () => {
    const pattern = /ALTER TABLE (?:appointments|prescription_booking_requests) ADD COLUMN IF NOT EXISTS [^`]+/g;
    const definitions = (source: string) => [...source.matchAll(pattern)].map(m => normalize(m[0])).sort();
    expect(definitions(MJS)).toEqual(definitions(ROUTE));
  });
  it('mantiene idéntica la protección de participantes y cancelación reconciliada', () => {
    const pattern = /CREATE OR REPLACE FUNCTION protect_prescription_appointment\(\)[\s\S]*?LANGUAGE plpgsql/;
    const functionBody = statement(MJS, pattern);
    expect(functionBody).toBe(statement(ROUTE, pattern));
    expect(functionBody).toContain("b.state='revoked'");
    expect(functionBody).toContain("b.attempts='[]'::jsonb");
    expect(functionBody).toContain('NEW.attendance_user_id');
  });
});
