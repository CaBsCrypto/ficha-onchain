import { cn } from "@/lib/utils";

export function SectionHeader({
  icon, title, bg,
}: { icon: React.ReactNode; title: string; bg: string }) {
  return (
    <div className="flex items-center gap-3 border-b border-slate-200/70 px-6 py-4">
      <div className={cn("grid h-9 w-9 place-items-center rounded-xl", bg)}>{icon}</div>
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
    </div>
  );
}
