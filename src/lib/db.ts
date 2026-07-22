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

/** Thrown when a Vercel *preview* deployment is about to talk to the prod DB. */
export class PreviewProdDbError extends Error {
  constructor(host: string) {
    super(
      `Refusing to connect: this is a Vercel PREVIEW deployment but DATABASE_URL ` +
        `points at the guarded production host (${host}). A preview must never ` +
        `write to production. Give the preview its own DATABASE_URL, or clear ` +
        `PROD_DB_HOST_GUARD if this is deliberate.`,
    );
    this.name = "PreviewProdDbError";
  }
}

/** Extract just the host from a Postgres URL, for safe logging (no credentials). */
function dbHost(url: string): string {
  const m = url.match(/@([^/:?]+)/);
  return m ? m[1] : "unknown-host";
}

/**
 * Fail CLOSED when a Vercel *preview* deployment would talk to the PRODUCTION
 * database. Vercel previews share production's DATABASE_URL, so without this a
 * preview that writes, writes to prod (see AGENTS.md). Health data: that must be
 * impossible, not merely discouraged.
 *
 * Opt-in and precise — it is a no-op unless ALL of:
 *   - PROD_DB_HOST_GUARD is set (to a substring of the prod Neon host,
 *     e.g. "ep-rapid-shadow"), AND
 *   - this is a Vercel preview deploy (VERCEL_ENV === "preview"), AND
 *   - the connection string actually points at that guarded host.
 * So local dev and the real production deploy are never affected.
 *
 * Exported for direct unit testing.
 */
export function assertDbSafe(url: string): void {
  const guard = process.env.PROD_DB_HOST_GUARD;
  if (!guard) return; // guard not configured → no-op
  if (process.env.VERCEL_ENV !== "preview") return; // only guards preview deploys
  if (url.includes(guard)) throw new PreviewProdDbError(dbHost(url));
}

let cached: Sql | null = null;

/** Returns the shared Neon client. Throws DbNotConfiguredError if unconfigured. */
export function getDb(): Sql {
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!url) throw new DbNotConfiguredError();
  assertDbSafe(url); // fail closed: a preview must never reach the prod DB
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
