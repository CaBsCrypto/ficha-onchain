import { cn } from "@/lib/utils";
import type { StatusConfig } from "@/types/health";

interface StatusBadgeProps {
  status: string;
  configMap: Record<string, StatusConfig>;
  /** Key to use when status is not found in configMap */
  fallback?: string;
}

/**
 * Reusable status badge: dot + label, colored from a config map.
 * Used by MockRxCard and LicenseCard.
 */
export function StatusBadge({
  status,
  configMap,
  fallback = "Registered",
}: StatusBadgeProps) {
  const cfg = configMap[status] ?? configMap[fallback];
  if (!cfg) return null;
  return (
    <>
      <span className={cn("h-2 w-2 shrink-0 rounded-full", cfg.dot)} />
      <span className={cn("text-xs font-semibold", cfg.text)}>{cfg.label}</span>
    </>
  );
}
