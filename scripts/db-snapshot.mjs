/**
 * scripts/db-snapshot.mjs — quick read-only snapshot of every domain table.
 * Answers "is the DB clean?" at a glance. Read-only; safe to run anytime.
 *   node scripts/db-snapshot.mjs
 */
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

for (const l of readFileSync(".env.local", "utf8").split("\n")) {
  const m = l.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

const sql = neon(process.env.DATABASE_URL);
const TABLES = [
  "doctors", "registered_users", "waitlist",
  "appointments", "medical_licenses", "prescriptions",
  "clinical_entries", "doctor_availability", "doctor_time_off",
  "pain_diary", "patient_health_records", "documents",
];

console.log(`\nDB snapshot — ${process.env.DATABASE_URL?.match(/@([^./]+)/)?.[1] ?? "?"}\n`);
let total = 0;
for (const t of TABLES) {
  try {
    const [{ n }] = await sql.query(`SELECT COUNT(*)::int AS n FROM ${t}`);
    total += n;
    const bar = n === 0 ? "·" : "█".repeat(Math.min(n, 30));
    console.log(`  ${String(n).padStart(5)}  ${t.padEnd(24)} ${n ? bar : ""}`);
  } catch (e) {
    console.log(`      -  ${t.padEnd(24)} (${e.message.split("\n")[0].slice(0, 40)})`);
  }
}
console.log(`\n  ${total === 0 ? "✅ VACÍA — no hay datos guardados" : `Total filas: ${total}`}\n`);
