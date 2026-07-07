import type { ReactNode } from "react";

/**
 * (dashboard) route group layout.
 * Provides shared structural context for dashboard pages (Licencias, etc.)
 * while keeping the URL path unchanged (e.g. /licenses, not /dashboard/licenses).
 */
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
