import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type Tone = "clinical" | "mint" | "muted";

const tones: Record<Tone, string> = {
  clinical: "bg-clinical-50 text-clinical-600 ring-clinical/20",
  mint: "bg-mint-50 text-mint ring-mint/20",
  muted: "bg-slate-100 text-muted ring-slate-200",
};

export function Badge({
  children,
  tone = "clinical",
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
