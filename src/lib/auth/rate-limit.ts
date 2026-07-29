/**
 * Per-org rate limiting for the external MCP — SERVER ONLY.
 * ---------------------------------------------------------------------------
 * Fixed one-minute windows in Postgres (no Redis): one row per
 * (org, env, bucket, window), bumped with an atomic INSERT … ON CONFLICT so
 * concurrent messages of a batch never lose counts. Two buckets:
 *
 *   - "heavy"   → tools that deploy contracts or write on-chain
 *                 (request_consent, anchor_record). Low quota: these cost real
 *                 ledger writes and, iterated over RUTs, could mass-deploy
 *                 per-patient contracts.
 *   - "default" → everything else authenticated.
 *
 * The check runs per JSON-RPC MESSAGE (not per HTTP POST), so a 20-message
 * batch spends 20 units — the batch cap is not a quota bypass.
 *
 * On a rate-limit DB error the call is ALLOWED and logged: this is throttling,
 * not authorization — auth already failed closed before this point, and the
 * tool's own DB work will surface a real outage anyway.
 */
import { getDb } from "@/lib/db";
import type { ApiContext } from "@/lib/auth/api-key";

/** Tools that sign on-chain transactions / deploy contracts. */
const HEAVY_TOOLS = new Set(["request_consent", "anchor_record"]);

const QUOTA: Record<"default" | "heavy", number> = {
  default: Number(process.env.MCP_RATE_LIMIT_PER_MIN ?? 60),
  heavy: Number(process.env.MCP_RATE_LIMIT_HEAVY_PER_MIN ?? 10),
};

export interface RateResult {
  allowed: boolean;
  bucket: "default" | "heavy";
  limit: number;
  /** Requests already counted in this window (including this one). */
  used: number;
}

export async function checkRateLimit(
  ctx: ApiContext,
  toolName: string,
): Promise<RateResult> {
  const bucket: "default" | "heavy" = HEAVY_TOOLS.has(toolName) ? "heavy" : "default";
  const limit = QUOTA[bucket];

  try {
    const sql = getDb();
    const [row] = await sql<{ count: number }>`
      INSERT INTO api_rate_limits (org_id, env, bucket, window_start, count)
      VALUES (${ctx.orgId}, ${ctx.env}, ${bucket}, date_trunc('minute', NOW()), 1)
      ON CONFLICT (org_id, env, bucket, window_start)
      DO UPDATE SET count = api_rate_limits.count + 1
      RETURNING count`;
    const used = row?.count ?? 1;
    return { allowed: used <= limit, bucket, limit, used };
  } catch (err) {
    console.error("[mcp/rate-limit] check failed (allowing):", err);
    return { allowed: true, bucket, limit, used: 0 };
  }
}
