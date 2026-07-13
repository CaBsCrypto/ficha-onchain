"use client";
// Copyright © 2026 Browns Studio

import React, { useState } from "react";

export type BodyZone =
  | "head" | "neck" | "shoulder_l" | "shoulder_r"
  | "chest" | "abdomen" | "back_upper" | "back_lower"
  | "arm_l" | "arm_r" | "hand_l" | "hand_r"
  | "hip_l" | "hip_r" | "leg_l" | "leg_r"
  | "knee_l" | "knee_r" | "foot_l" | "foot_r";

export interface PainEntry {
  zone: BodyZone;
  level: number;
  note?: string;
  timestamp: string;
}

export interface BodyMapProps {
  entries: PainEntry[];
  onZoneClick: (zone: BodyZone) => void;
  readOnly?: boolean;
}

export const ZONE_NAMES: Record<BodyZone, string> = {
  head: "Cabeza",
  neck: "Cuello",
  shoulder_l: "Hombro Izq.",
  shoulder_r: "Hombro Der.",
  chest: "Pecho",
  abdomen: "Abdomen",
  back_upper: "Espalda Alta",
  back_lower: "Espalda Baja",
  arm_l: "Brazo Izq.",
  arm_r: "Brazo Der.",
  hand_l: "Mano Izq.",
  hand_r: "Mano Der.",
  hip_l: "Cadera Izq.",
  hip_r: "Cadera Der.",
  leg_l: "Pierna Izq.",
  leg_r: "Pierna Der.",
  knee_l: "Rodilla Izq.",
  knee_r: "Rodilla Der.",
  foot_l: "Pie Izq.",
  foot_r: "Pie Der.",
};

type ViewSide = "front" | "back";

function getPainFill(level: number | undefined, hovered: boolean): string {
  if (hovered) return "rgba(125,211,252,0.18)";
  if (!level) return "rgba(15,23,42,0.5)";
  if (level <= 3) return "rgba(34,197,94,0.22)";
  if (level <= 6) return "rgba(234,179,8,0.26)";
  if (level <= 9) return "rgba(249,115,22,0.30)";
  return "rgba(239,68,68,0.34)";
}

function getPainStroke(level: number | undefined, hovered: boolean): string {
  if (hovered) return "#7dd3fc";
  if (!level) return "#334155";
  if (level <= 3) return "#22c55e";
  if (level <= 6) return "#eab308";
  if (level <= 9) return "#f97316";
  return "#ef4444";
}

export default function BodyMap({ entries, onZoneClick, readOnly = false }: BodyMapProps) {
  const [hovered, setHovered] = useState<BodyZone | null>(null);
  const [side, setSide] = useState<ViewSide>("front");

  const levelMap: Partial<Record<BodyZone, number>> = {};
  for (const e of entries) {
    if (!levelMap[e.zone] || e.level > (levelMap[e.zone] ?? 0)) {
      levelMap[e.zone] = e.level;
    }
  }

  function zp(zone: BodyZone) {
    const lv = levelMap[zone];
    const hov = hovered === zone;
    const hasGlow = hov || (lv !== undefined && lv >= 6);
    return {
      fill: getPainFill(lv, hov),
      stroke: getPainStroke(lv, hov),
      strokeWidth: hov ? 2.5 : lv ? 2 : 1.2,
      filter: hasGlow ? "url(#glow)" : undefined,
      onClick: readOnly ? undefined : () => onZoneClick(zone),
      onMouseEnter: readOnly ? undefined : () => setHovered(zone),
      onMouseLeave: readOnly ? undefined : () => setHovered(null),
      className: readOnly ? "" : "cursor-pointer",
      style: { transition: "fill 0.12s, stroke 0.12s" } as React.CSSProperties,
    };
  }

  // Front zones
  const front = (
    <>
      <ellipse cx="100" cy="34" rx="24" ry="27" {...zp("head")}><title>{ZONE_NAMES.head}</title></ellipse>
      <rect x="89" y="59" width="22" height="18" rx="5" {...zp("neck")}><title>{ZONE_NAMES.neck}</title></rect>
      <ellipse cx="58" cy="98" rx="22" ry="14" {...zp("shoulder_l")}><title>{ZONE_NAMES.shoulder_l}</title></ellipse>
      <ellipse cx="142" cy="98" rx="22" ry="14" {...zp("shoulder_r")}><title>{ZONE_NAMES.shoulder_r}</title></ellipse>
      <rect x="73" y="75" width="54" height="54" rx="10" {...zp("chest")}><title>{ZONE_NAMES.chest}</title></rect>
      <rect x="73" y="127" width="54" height="46" rx="8" {...zp("abdomen")}><title>{ZONE_NAMES.abdomen}</title></rect>
      <rect x="34" y="106" width="22" height="74" rx="10" {...zp("arm_l")}><title>{ZONE_NAMES.arm_l}</title></rect>
      <rect x="144" y="106" width="22" height="74" rx="10" {...zp("arm_r")}><title>{ZONE_NAMES.arm_r}</title></rect>
      <ellipse cx="45" cy="197" rx="15" ry="19" {...zp("hand_l")}><title>{ZONE_NAMES.hand_l}</title></ellipse>
      <ellipse cx="155" cy="197" rx="15" ry="19" {...zp("hand_r")}><title>{ZONE_NAMES.hand_r}</title></ellipse>
      <rect x="73" y="171" width="27" height="38" rx="6" {...zp("hip_l")}><title>{ZONE_NAMES.hip_l}</title></rect>
      <rect x="100" y="171" width="27" height="38" rx="6" {...zp("hip_r")}><title>{ZONE_NAMES.hip_r}</title></rect>
      <rect x="74" y="207" width="24" height="78" rx="10" {...zp("leg_l")}><title>{ZONE_NAMES.leg_l}</title></rect>
      <rect x="102" y="207" width="24" height="78" rx="10" {...zp("leg_r")}><title>{ZONE_NAMES.leg_r}</title></rect>
      <ellipse cx="86" cy="294" rx="18" ry="12" {...zp("knee_l")}><title>{ZONE_NAMES.knee_l}</title></ellipse>
      <ellipse cx="114" cy="294" rx="18" ry="12" {...zp("knee_r")}><title>{ZONE_NAMES.knee_r}</title></ellipse>
      <rect x="74" y="304" width="24" height="70" rx="10" {...zp("leg_l")}><title>{ZONE_NAMES.leg_l}</title></rect>
      <rect x="102" y="304" width="24" height="70" rx="10" {...zp("leg_r")}><title>{ZONE_NAMES.leg_r}</title></rect>
      <ellipse cx="83" cy="388" rx="24" ry="12" {...zp("foot_l")}><title>{ZONE_NAMES.foot_l}</title></ellipse>
      <ellipse cx="117" cy="388" rx="24" ry="12" {...zp("foot_r")}><title>{ZONE_NAMES.foot_r}</title></ellipse>
    </>
  );

  // Back zones — same geometry, different labels for torso
  const back = (
    <>
      <ellipse cx="100" cy="34" rx="24" ry="27" {...zp("head")}><title>{ZONE_NAMES.head}</title></ellipse>
      <rect x="89" y="59" width="22" height="18" rx="5" {...zp("neck")}><title>{ZONE_NAMES.neck}</title></rect>
      <ellipse cx="58" cy="98" rx="22" ry="14" {...zp("shoulder_l")}><title>{ZONE_NAMES.shoulder_l}</title></ellipse>
      <ellipse cx="142" cy="98" rx="22" ry="14" {...zp("shoulder_r")}><title>{ZONE_NAMES.shoulder_r}</title></ellipse>
      <rect x="73" y="75" width="54" height="54" rx="10" {...zp("back_upper")}><title>{ZONE_NAMES.back_upper}</title></rect>
      <rect x="73" y="127" width="54" height="46" rx="8" {...zp("back_lower")}><title>{ZONE_NAMES.back_lower}</title></rect>
      <rect x="34" y="106" width="22" height="74" rx="10" {...zp("arm_l")}><title>{ZONE_NAMES.arm_l}</title></rect>
      <rect x="144" y="106" width="22" height="74" rx="10" {...zp("arm_r")}><title>{ZONE_NAMES.arm_r}</title></rect>
      <ellipse cx="45" cy="197" rx="15" ry="19" {...zp("hand_l")}><title>{ZONE_NAMES.hand_l}</title></ellipse>
      <ellipse cx="155" cy="197" rx="15" ry="19" {...zp("hand_r")}><title>{ZONE_NAMES.hand_r}</title></ellipse>
      <rect x="73" y="171" width="27" height="38" rx="6" {...zp("hip_l")}><title>{ZONE_NAMES.hip_l}</title></rect>
      <rect x="100" y="171" width="27" height="38" rx="6" {...zp("hip_r")}><title>{ZONE_NAMES.hip_r}</title></rect>
      <rect x="74" y="207" width="24" height="78" rx="10" {...zp("leg_l")}><title>{ZONE_NAMES.leg_l}</title></rect>
      <rect x="102" y="207" width="24" height="78" rx="10" {...zp("leg_r")}><title>{ZONE_NAMES.leg_r}</title></rect>
      <ellipse cx="86" cy="294" rx="18" ry="12" {...zp("knee_l")}><title>{ZONE_NAMES.knee_l}</title></ellipse>
      <ellipse cx="114" cy="294" rx="18" ry="12" {...zp("knee_r")}><title>{ZONE_NAMES.knee_r}</title></ellipse>
      <rect x="74" y="304" width="24" height="70" rx="10" {...zp("leg_l")}><title>{ZONE_NAMES.leg_l}</title></rect>
      <rect x="102" y="304" width="24" height="70" rx="10" {...zp("leg_r")}><title>{ZONE_NAMES.leg_r}</title></rect>
      <ellipse cx="83" cy="388" rx="24" ry="12" {...zp("foot_l")}><title>{ZONE_NAMES.foot_l}</title></ellipse>
      <ellipse cx="117" cy="388" rx="24" ry="12" {...zp("foot_r")}><title>{ZONE_NAMES.foot_r}</title></ellipse>
    </>
  );

  return (
    <div className="flex flex-col items-center gap-3 select-none">
      {/* Front / Back toggle */}
      <div className="flex items-center gap-1 bg-slate-900/80 rounded-full p-1 border border-slate-700">
        {(["front", "back"] as ViewSide[]).map((s) => (
          <button
            key={s}
            onClick={() => setSide(s)}
            className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
              side === s ? "bg-sky-500 text-white shadow-sm" : "text-slate-400 hover:text-white"
            }`}
          >
            {s === "front" ? "Frontal" : "Trasera"}
          </button>
        ))}
      </div>

      {/* Tooltip bar */}
      <div className="h-7 flex items-center">
        {hovered ? (
          <span className="text-sm font-medium text-white bg-slate-900 border border-slate-600 px-3 py-1 rounded-full">
            {ZONE_NAMES[hovered]}
            {levelMap[hovered] !== undefined && (
              <span className="ml-2 text-xs opacity-60">· {levelMap[hovered]}/10</span>
            )}
          </span>
        ) : (
          <span className="text-xs text-slate-500">
            {readOnly ? "Vista de historial" : "Toca una zona para registrar dolor"}
          </span>
        )}
      </div>

      {/* SVG Body */}
      <svg
        viewBox="0 0 200 406"
        className="w-full max-w-[200px]"
        role="img"
        aria-label="Mapa corporal interactivo"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <filter id="glow" x="-35%" y="-35%" width="170%" height="170%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {side === "front" ? front : back}
      </svg>

      {/* Legend */}
      <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
        {[
          { c: "#475569", l: "Sin dolor" },
          { c: "#22c55e", l: "Leve 1–3" },
          { c: "#eab308", l: "Mod. 4–6" },
          { c: "#f97316", l: "Intenso 7–9" },
          { c: "#ef4444", l: "Severo 10" },
        ].map(({ c, l }) => (
          <span key={l} className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full inline-block" style={{ background: c }} />
            {l}
          </span>
        ))}
      </div>
    </div>
  );
}
