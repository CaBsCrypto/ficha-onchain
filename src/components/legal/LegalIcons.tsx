import { cn } from "@/lib/utils";

/**
 * Small stroke-icon set used across the Legal section and /legal page.
 * Each entry is a list of SVG path `d` strings drawn on a 24×24 canvas,
 * matching the outline style used elsewhere in the landing.
 */
export type IconName =
  | "shield"
  | "shieldCheck"
  | "leaf"
  | "link"
  | "check"
  | "prescription"
  | "signature"
  | "scan"
  | "clipboardCheck"
  | "scale"
  | "bell"
  | "report";

const paths: Record<IconName, string[]> = {
  shield: [
    "M20 13c0 5-3.5 7.5-7.62 8.88a1 1 0 0 1-.76 0C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",
  ],
  shieldCheck: [
    "M20 13c0 5-3.5 7.5-7.62 8.88a1 1 0 0 1-.76 0C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",
    "m9 12 2 2 4-4",
  ],
  leaf: [
    "M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z",
    "M2 21c0-3 1.85-5.36 5.08-6",
  ],
  link: [
    "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71",
    "M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71",
  ],
  check: ["M20 6 9 17l-5-5"],
  prescription: [
    "M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z",
    "M14 2v5h5",
    "M8 13h5",
    "M8 17h8",
  ],
  signature: [
    "M12 20h9",
    "M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z",
  ],
  scan: [
    "M3 7V5a2 2 0 0 1 2-2h2",
    "M17 3h2a2 2 0 0 1 2 2v2",
    "M21 17v2a2 2 0 0 1-2 2h-2",
    "M7 21H5a2 2 0 0 1-2-2v-2",
    "M7 12h10",
  ],
  clipboardCheck: [
    "M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2",
    "M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2",
    "m9 14 2 2 4-4",
  ],
  scale: [
    "M12 3v18",
    "M7 21h10",
    "M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2",
    "m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z",
    "m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z",
  ],
  bell: [
    "M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9",
    "M10.3 21a1.94 1.94 0 0 0 3.4 0",
  ],
  report: [
    "M8 5H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2",
    "M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2",
    "M8 11h.01",
    "M12 11h5",
    "M8 16h.01",
    "M12 16h5",
  ],
};

export function Icon({
  name,
  className,
}: {
  name: IconName;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn("h-6 w-6", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
