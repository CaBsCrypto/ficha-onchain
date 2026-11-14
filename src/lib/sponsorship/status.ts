import 'server-only';
import { getDb } from '@/lib/db';
import { loadSponsorshipConfig } from './config';
import { QUOTE_MAX_AGE_SECONDS } from './domain';

export interface SponsorshipStatus {
  network: 'testnet'; coverage: 'new_reservations_only'; requestedEnabled: boolean; configurationValid: boolean; spendingEnabled: boolean;
  quoteMaxAgeSeconds: number; utcDay: string; resetAt: string; verifiedAt: string;
  policy: null | { maxFeeStroops: string; entryLimitStroops: string; sponsorDailyLimitStroops: string;
    patientDailyLimitStroops: string; emergencyReserveStroops: string };
  sponsorBuckets: { scope: 'all_sponsors_today'; count: number; recordedLimitStroops: string; reservedStroops: string; spentStroops: string };
  reservations: { scope: 'all_testnet_days'; counts: Record<'reserved' | 'signed' | 'submitted' | 'settled' | 'released', number>;
    pendingCount: number; oldestPendingAt: string | null; oldestPendingAgeSeconds: number | null };
}
const invalid = (): never => { throw Error('sponsorship_status_unavailable'); };
function amount(value: unknown): string {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]{0,39})$/.test(value)) return invalid();
  return value;
}
function count(value: unknown): number {
  const result = Number(amount(value)); if (!Number.isSafeInteger(result)) return invalid(); return result;
}
/** Advisory aggregates only. No wallet keys, balances, clinical rows or spending authority. */
export async function getSponsorshipStatus(): Promise<SponsorshipStatus> {
  try {
    const now = new Date(), utcDay = now.toISOString().slice(0, 10);
    const resetAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString();
    const config = loadSponsorshipConfig(), policy = config.policy;
    const rows = await getDb().query(`WITH sponsor_totals AS (
      SELECT COUNT(*)::text AS bucket_count, COALESCE(SUM(limit_stroops),0)::text AS recorded_limit,
        COALESCE(SUM(reserved_stroops),0)::text AS reserved, COALESCE(SUM(spent_stroops),0)::text AS spent
      FROM sponsorship_daily_buckets WHERE network=$1 AND utc_day=$2::date AND bucket_key LIKE 'sponsor:%'
    ), reservation_totals AS (
      SELECT COUNT(*) FILTER (WHERE state='reserved')::text AS reserved_count,
        COUNT(*) FILTER (WHERE state='signed')::text AS signed_count,
        COUNT(*) FILTER (WHERE state='submitted')::text AS submitted_count,
        COUNT(*) FILTER (WHERE state='settled')::text AS settled_count,
        COUNT(*) FILTER (WHERE state='released')::text AS released_count,
        MIN(created_at) FILTER (WHERE state IN ('reserved','signed','submitted')) AS oldest_pending
      FROM sponsorship_reservations WHERE network=$1
    ) SELECT bucket_count,recorded_limit,reserved,spent,reserved_count,signed_count,submitted_count,settled_count,released_count,oldest_pending FROM sponsor_totals CROSS JOIN reservation_totals`, ['testnet', utcDay]);
    if (rows.length !== 1) return invalid(); const row = rows[0];
    const counts = { reserved: count(row.reserved_count), signed: count(row.signed_count), submitted: count(row.submitted_count),
      settled: count(row.settled_count), released: count(row.released_count) };
    const pendingCount = counts.reserved + counts.signed + counts.submitted;
    if (!Number.isSafeInteger(pendingCount)) return invalid();
    const oldest = row.oldest_pending === null ? null : new Date(row.oldest_pending);
    if (oldest && !Number.isFinite(oldest.getTime()) || pendingCount === 0 && oldest !== null || pendingCount > 0 && oldest === null) return invalid();
    return {
      network: 'testnet', coverage: 'new_reservations_only', requestedEnabled: process.env.TRUSTLEAF_SPONSORSHIP_ENABLED === 'true',
      configurationValid: policy !== null, spendingEnabled: policy !== null && config.paths.includes('/api/private-clinical-operations'),
      quoteMaxAgeSeconds: QUOTE_MAX_AGE_SECONDS, utcDay, resetAt, verifiedAt: now.toISOString(),
      policy: policy ? { maxFeeStroops: amount(policy.maxFeeStroops), entryLimitStroops: amount(policy.encounterLimitStroops ?? '0'),
        sponsorDailyLimitStroops: amount(policy.sponsorDailyLimitStroops), patientDailyLimitStroops: amount(policy.patientDailyLimitStroops),
        emergencyReserveStroops: amount(policy.emergencyReserveStroops ?? '0') } : null,
      sponsorBuckets: { scope: 'all_sponsors_today', count: count(row.bucket_count), recordedLimitStroops: amount(row.recorded_limit),
        reservedStroops: amount(row.reserved), spentStroops: amount(row.spent) },
      reservations: { scope: 'all_testnet_days', counts, pendingCount, oldestPendingAt: oldest?.toISOString() ?? null,
        oldestPendingAgeSeconds: oldest ? Math.max(0, Math.floor((now.getTime() - oldest.getTime()) / 1000)) : null },
    };
  } catch { return invalid(); }
}
