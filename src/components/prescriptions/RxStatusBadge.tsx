import { cn } from "@/lib/utils";
import { statusMeta } from "@/lib/stellar/status";
import type { RxStatus } from "@/lib/stellar";

const TONE_CLASSES: Record<string, string> = {
  mint: "bg-mint-50 text-mint ring-mint/25",
  clinical: "bg-clinical-50 text-clinical-600 ring-clinical/20",
  amber: "bg-amber-50 text-amber-600 ring-amber-500/25",
  rose: "bg-rose-50 text-rose-600 ring-rose-500/25",
  muted: "bg-slate-100 text-muted ring-slate-200",
};

const DOT: Record<string, string> = {
  mint: "bg-mint",
  clinical: "bg-clinical",
  amber: "bg-amber-500",
  rose: "bg-rose-500",
  muted: "bg-slate-400",
};

/**
 * Pure presentational badge — usable from server or client components.
 *
 * When `expired` is true the badge overrides the on-chain label with a derived
 * "Expirada" (rose) state. Expiry is not an on-chain status; it is computed off
 * the issuance timestamp (see `lib/stellar/expiry`). The underlying on-chain
 * status is unchanged — this only affects presentation.
 */
export function RxStatusBadge({
  status,
  expired = false,
}: {
  status: RxStatus;
  expired?: boolean;
}) {
  const meta = expired
    ? { label: "Expirada", tone: "rose" as const }
    : statusMeta(status);
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset",
        TONE_CLASSES[meta.tone],
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", DOT[meta.tone])} />
      {meta.label}
    </span>
  );
}
