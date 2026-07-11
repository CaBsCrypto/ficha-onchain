import { cn } from "@/lib/utils";

interface ProgressBarProps {
  /** 0–100 percent fill */
  value: number;
  /** Current units (shown on right side of label row) */
  current?: number;
  /** Total units (shown on right side of label row) */
  total?: number;
  /** Left-side label text */
  label?: string;
}

/**
 * Generic progress bar.
 * Color: green >50 %, amber 20–50 %, red <20 %.
 */
export function ProgressBar({
  value,
  current,
  total,
  label = "Unidades disponibles",
}: ProgressBarProps) {
  const pct = Math.max(0, Math.min(100, value));
  const barColor =
    pct > 50 ? "bg-emerald-500" : pct > 20 ? "bg-amber-400" : "bg-rose-500";

  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs text-muted">
        <span>{label}</span>
        {current !== undefined && total !== undefined && (
          <span className="font-semibold text-ink">
            {current}/{total}
          </span>
        )}
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className={cn("h-full rounded-full transition-all", barColor)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
