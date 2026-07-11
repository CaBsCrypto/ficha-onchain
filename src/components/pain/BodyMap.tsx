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

function getPainColor(level: number | undefined): { fill: string; stroke: string; strokeWidth: number } {
  if (!level) return { fill: "#1e293b", stroke: "#334155", strokeWidth: 1.5 };
  if (level <= 3) return { fill: "#22c55e20", stroke: "#22c55e", strokeWidth: 2 };
  if (level <= 6) return { fill: "#eab30820", stroke: "#eab308", strokeWidth: 2 };
  if (level <= 9) return { fill: "#f9731620", stroke: "#f97316", strokeWidth: 2 };
  return { fill: "#ef444420", stroke: "#ef4444", strokeWidth: 2.5 };
}

export default function BodyMap({ entries, onZoneClick, readOnly = false }: BodyMapProps) {
  const [hovered, setHovered] = useState<BodyZone | null>(null);

  const levelMap: Partial<Record<BodyZone, number>> = {};
  for (const e of entries) {
    if (!levelMap[e.zone] || e.level > (levelMap[e.zone] ?? 0)) {
      levelMap[e.zone] = e.level;
    }
  }

  function zoneProps(zone: BodyZone) {
    const colors = getPainColor(levelMap[zone]);
    return {
      style: colors,
      onClick: readOnly ? undefined : () => onZoneClick(zone),
      onMouseEnter: () => setHovered(zone),
      onMouseLeave: () => setHovered(null),
      className: readOnly
        ? "transition-colors duration-200"
        : "cursor-pointer transition-colors duration-200 hover:opacity-75",
    };
  }

  return (
    <div className="flex flex-col items-center gap-4 select-none">
      {/* Tooltip bar */}
      <div className="h-7 flex items-center">
        {hovered ? (
          <span className="text-sm font-medium text-white bg-[#1e293b] border border-[#334155] px-3 py-1 rounded-full">
            {ZONE_NAMES[hovered]}
            {levelMap[hovered] !== undefined && (
              <span className="ml-2 text-xs opacity-70">· Dolor: {levelMap[hovered]}/10</span>
            )}
          </span>
        ) : (
          <span className="text-xs text-[#64748B]">
            {readOnly ? "Vista de historial" : "Toca una zona para registrar dolor"}
          </span>
        )}
      </div>

      {/* SVG Body */}
      <svg
        viewBox="0 0 200 460"
        className="w-full max-w-[200px]"
        role="img"
        aria-label="Mapa corporal interactivo"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Head */}
        <ellipse cx="100" cy="42" rx="28" ry="32" {...zoneProps("head")}>
          <title>{ZONE_NAMES.head}</title>
        </ellipse>

        {/* Neck */}
        <rect x="88" y="72" width="24" height="18" rx="6" {...zoneProps("neck")}>
          <title>{ZONE_NAMES.neck}</title>
        </rect>

        {/* Shoulder L */}
        <ellipse cx="52" cy="104" rx="22" ry="16" {...zoneProps("shoulder_l")}>
          <title>{ZONE_NAMES.shoulder_l}</title>
        </ellipse>

        {/* Shoulder R */}
        <ellipse cx="148" cy="104" rx="22" ry="16" {...zoneProps("shoulder_r")}>
          <title>{ZONE_NAMES.shoulder_r}</title>
        </ellipse>

        {/* Chest */}
        <rect x="70" y="88" width="60" height="56" rx="8" {...zoneProps("chest")}>
          <title>{ZONE_NAMES.chest}</title>
        </rect>

        {/* Abdomen */}
        <rect x="70" y="142" width="60" height="46" rx="6" {...zoneProps("abdomen")}>
          <title>{ZONE_NAMES.abdomen}</title>
        </rect>

        {/* Arm L */}
        <rect x="33" y="118" width="22" height="76" rx="10" {...zoneProps("arm_l")}>
          <title>{ZONE_NAMES.arm_l}</title>
        </rect>

        {/* Arm R */}
        <rect x="145" y="118" width="22" height="76" rx="10" {...zoneProps("arm_r")}>
          <title>{ZONE_NAMES.arm_r}</title>
        </rect>

        {/* Hand L */}
        <ellipse cx="44" cy="210" rx="16" ry="20" {...zoneProps("hand_l")}>
          <title>{ZONE_NAMES.hand_l}</title>
        </ellipse>

        {/* Hand R */}
        <ellipse cx="156" cy="210" rx="16" ry="20" {...zoneProps("hand_r")}>
          <title>{ZONE_NAMES.hand_r}</title>
        </ellipse>

        {/* Hip L */}
        <rect x="70" y="186" width="30" height="40" rx="6" {...zoneProps("hip_l")}>
          <title>{ZONE_NAMES.hip_l}</title>
        </rect>

        {/* Hip R */}
        <rect x="100" y="186" width="30" height="40" rx="6" {...zoneProps("hip_r")}>
          <title>{ZONE_NAMES.hip_r}</title>
        </rect>

        {/* Leg L upper thigh */}
        <rect x="72" y="224" width="26" height="80" rx="10" {...zoneProps("leg_l")}>
          <title>{ZONE_NAMES.leg_l}</title>
        </rect>

        {/* Leg R upper thigh */}
        <rect x="102" y="224" width="26" height="80" rx="10" {...zoneProps("leg_r")}>
          <title>{ZONE_NAMES.leg_r}</title>
        </rect>

        {/* Knee L */}
        <ellipse cx="85" cy="314" rx="20" ry="14" {...zoneProps("knee_l")}>
          <title>{ZONE_NAMES.knee_l}</title>
        </ellipse>

        {/* Knee R */}
        <ellipse cx="115" cy="314" rx="20" ry="14" {...zoneProps("knee_r")}>
          <title>{ZONE_NAMES.knee_r}</title>
        </ellipse>

        {/* Lower leg L (calf, part of leg visually below knee) */}
        <rect x="72" y="326" width="26" height="72" rx="10" {...zoneProps("leg_l")}>
          <title>{ZONE_NAMES.leg_l}</title>
        </rect>

        {/* Lower leg R */}
        <rect x="102" y="326" width="26" height="72" rx="10" {...zoneProps("leg_r")}>
          <title>{ZONE_NAMES.leg_r}</title>
        </rect>

        {/* Foot L */}
        <ellipse cx="82" cy="412" rx="26" ry="15" {...zoneProps("foot_l")}>
          <title>{ZONE_NAMES.foot_l}</title>
        </ellipse>

        {/* Foot R */}
        <ellipse cx="118" cy="412" rx="26" ry="15" {...zoneProps("foot_r")}>
          <title>{ZONE_NAMES.foot_r}</title>
        </ellipse>
      </svg>

      {/* Back zones row (can't show in front view) */}
      <div className="flex gap-3 w-full max-w-[200px]">
        {(["back_upper", "back_lower"] as BodyZone[]).map((zone) => {
          const colors = getPainColor(levelMap[zone]);
          return (
            <button
              key={zone}
              onClick={readOnly ? undefined : () => onZoneClick(zone)}
              onMouseEnter={() => setHovered(zone)}
              onMouseLeave={() => setHovered(null)}
              disabled={readOnly}
              className={`flex-1 py-2.5 rounded-xl border text-xs font-medium transition-all ${
                readOnly ? "cursor-default" : "cursor-pointer hover:opacity-80"
              }`}
              style={{
                backgroundColor: colors.fill,
                borderColor: colors.stroke,
                color: colors.stroke === "#334155" ? "#94a3b8" : colors.stroke,
              }}
            >
              {ZONE_NAMES[zone]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
