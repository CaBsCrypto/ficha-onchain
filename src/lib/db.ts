/**
 * Single Postgres (Neon) entry point.
 *
 * Replaces the five drifted copies of getDb() that lived inside individual API
 * routes and had each grown their own error text ("db_error", "Internal server
 * error", "DATABASE_URL is not set") for the same failure.
 *
 * Schema lives in scripts/migrate.mjs, NOT in request handlers. Routes used to
 * call `await ensureTable(sql)` on every request, paying a round-trip to Neon
 * to re-check a table that already existed.
 */
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * A tagged-template query function that resolves to rows.
 *
 * neon()'s own signature is a union (rows | FullQueryResults | any[][]) that
 * TypeScript refuses to index or iterate, which is why the older routes cast
 * every single query with `as Array<{...}>`. Narrowing once here means call
 * sites can just write:
 *
 *   const rows = await sql<{ id: number }>`SELECT id FROM doctors`;
 */
export interface Sql {
  <T = Record<string, any>>(strings: TemplateStringsArray, ...values: any[]): Promise<T[]>;
  /** Escape hatch for dynamic SQL with $1 placeholders (e.g. a table name). */
  query<T = Record<string, any>>(sql: string, params?: any[]): Promise<T[]>;
}

/** Thrown when no connection string is configured — a deploy/config problem. */
export class DbNotConfiguredError extends Error {
  constructor() {
    super("DATABASE_URL is not set");
    this.name = "DbNotConfiguredError";
  }
}

let cached: Sql | null = null;

/** Returns the shared Neon client. Throws DbNotConfiguredError if unconfigured. */
export function getDb(): Sql {
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!url) throw new DbNotConfiguredError();
  if (!cached) {
    const client: NeonQueryFunction<any, any> = neon(url);
    cached = client as unknown as Sql;
  }
  return cached;
}

/** True when a connection string exists — for routes that degrade to demo mode. */
export function isDbConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL ?? process.env.POSTGRES_URL);
}
