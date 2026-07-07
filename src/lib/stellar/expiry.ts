/**
 * Derived prescription expiry — browser-safe (no SDK, no server-only APIs).
 * ---------------------------------------------------------------------------
 * The on-chain `PrescriptionSoulbound` record stores only the issuance
 * `timestamp`; there is NO on-chain expiry field and the Status enum has no
 * "Expired" variant. Chilean prescriptions ("recetas") are, however, only
 * valid for a bounded window from issuance (30 days by default; controlled /
 * "receta retenida" also 30 days).
 *
 * We therefore DERIVE expiry off the issuance timestamp instead of mutating
 * chain state (which a read path cannot and must not do). The on-chain status
 * is always reported verbatim; `expired` is a computed, presentational overlay
 * — a prescription is treated as expired when it is still in a dispensable
 * status yet its validity window has elapsed.
 *
 * The validity window is configurable via NEXT_PUBLIC_RX_VALIDITY_DAYS so the
 * same build can track regulation changes without a code change.
 */
import { statusMeta, type StatusMeta } from "./status";
import type { RxStatus } from "./client";

/** Days a prescription remains valid from issuance. Default: 30 (Chile). */
export const RX_VALIDITY_DAYS =
  Number(process.env.NEXT_PUBLIC_RX_VALIDITY_DAYS) || 30;

/** How many days before expiry a prescription is flagged "expiring soon". */
export const EXPIRY_WARN_DAYS = 3;

const DAY_SECONDS = 86_400;

export interface RxExpiry {
  /** Derived expiry as a ledger-style unix timestamp (seconds). 0 = unknown. */
  expiresAt: number;
  /** Whole days until expiry. Negative once elapsed. */
  daysLeft: number;
  /** Dispensable on-chain status whose validity window has elapsed. */
  expired: boolean;
  /** Active, not yet expired, and within EXPIRY_WARN_DAYS of expiry. */
  expiringSoon: boolean;
}

/**
 * Compute the derived expiry for a prescription.
 * `nowMs` is injectable so callers (and tests) can pin the clock.
 */
export function computeExpiry(
  rx: { timestamp: number; status: RxStatus },
  nowMs: number = Date.now(),
): RxExpiry {
  // No issuance timestamp → cannot reason about expiry.
  if (!rx.timestamp) {
    return { expiresAt: 0, daysLeft: 0, expired: false, expiringSoon: false };
  }

  const meta: StatusMeta = statusMeta(rx.status);
  const expiresAt = rx.timestamp + RX_VALIDITY_DAYS * DAY_SECONDS;
  const nowSec = Math.floor(nowMs / 1000);
  const secsLeft = expiresAt - nowSec;
  const daysLeft = Math.ceil(secsLeft / DAY_SECONDS);

  // Expiry only overlays statuses that are otherwise still dispensable; a
  // revoked / burned prescription keeps its terminal status untouched.
  const expired = meta.active && secsLeft <= 0;
  const expiringSoon =
    meta.active && secsLeft > 0 && daysLeft <= EXPIRY_WARN_DAYS;

  return { expiresAt, daysLeft, expired, expiringSoon };
}

/** An on-chain prescription enriched with its derived expiry overlay. */
export type WithExpiry<T> = T & RxExpiry;

/** Merge the derived expiry fields onto a prescription-like record. */
export function withExpiry<T extends { timestamp: number; status: RxStatus }>(
  rx: T,
  nowMs?: number,
): WithExpiry<T> {
  return { ...rx, ...computeExpiry(rx, nowMs) };
}
