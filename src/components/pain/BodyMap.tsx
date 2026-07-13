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

function getPainStyle(level: number | undefined, hovered: boolean) {
  const base = hovered
    ? { fill: "rgba(125,211,252,0.15)", stroke: "#7dd3fc", glow: true }
    : !level
    ? { fill: "rgba(15,23,42,0.55)", stroke: "#334155", glow: false }
    : level <= 3
    ? { fill: "rgba(34,197,94,0.22)", stroke: "#22c55e", glow: false }
    : level <= 6
    ? { fill: "rgba(234,179,8,0.26)", stroke: "#eab308", glow: true }
    : level <= 9
    ? { fill: "rgba(249,115,22,0.30)", stroke: "#f97316", glow: true }
    : { fill: "rgba(239,68,68,0.34)", stroke: "#ef4444", glow: true };
  return base;
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
    const { fill, stroke, glow } = getPainStyle(levelMap[zone], hovered === zone);
    const sw = hovered === zone ? 2.5 : levelMap[zone] ? 2 : 1.2;
    return {
      fill,
      stroke,
      strokeWidth: sw,
      filter: glow ? "url(#glow)" : undefined,
      onClick: readOnly ? undefined : () => onZoneClick(zone),
      onMouseEnter: readOnly ? undefined : () => setHovered(zone),
      onMouseLeave: readOnly ? undefined : () => setHovered(null),
      onTouchStart: readOnly ? undefined : (e: React.TouchEvent) => { e.preventDefault(); setHovered(zone); },
      onTouchEnd: readOnly ? undefined : (e: React.TouchEvent) => { e.preventDefault(); setHovered(null); onZoneClick(zone); },
      style: { transition: "fill 0.15s ease, stroke 0.15s ease" },
      className: readOnly ? "" : "cursor-pointer",
    };
  }

  // ── FRONT VIEW ──────────────────────────────────────────────────────────────
  const frontBody = (
    <>
      {/* Head */}
      <ellipse cx="100" cy="34" rx="26" ry="30" {...zp("head")}><title>{ZONE_NAMES.head}</title></ellipse>

      {/* Neck */}
      <path d="M 91 62 C 90 68 89 73 89 80 L 111 80 C 111 73 110 68 109 62 Z" {...zp("neck")}><title>{ZONE_NAMES.neck}</title></path>

      {/* Left shoulder */}
      <ellipse cx="56" cy="97" rx="23" ry="15" {...zp("shoulder_l")}><title>{ZONE_NAMES.shoulder_l}</title></ellipse>

      {/* Right shoulder */}
      <ellipse cx="144" cy="97" rx="23" ry="15" {...zp("shoulder_r")}><title>{ZONE_NAMES.shoulder_r}</title></ellipse>

      {/* Chest */}
      <path d="M 77 82 L 123 82 C 138 86 145 96 141 112 C 138 126 130 134 126 150 L 74 150 C 70 134 62 126 59 112 C 55 96 62 86 77 82 Z" {...zp("chest")}><title>{ZONE_NAMES.chest}</title></path>

      {/* Abdomen */}
      <path d="M 74 150 L 126 150 C 128 163 130 173 130 185 C 130 193 117 197 100 197 C 83 197 70 193 70 185 C 70 173 72 163 74 150 Z" {...zp("abdomen")}><title>{ZONE_NAMES.abdomen}</title></path>

      {/* Left arm */}
      <path d="M 35 106 C 27 116 23 132 23 148 C 23 166 27 180 32 194 C 34 200 40 200 43 196 C 46 192 46 176 46 160 C 48 142 52 120 54 108 Z" {...zp("arm_l")}><title>{ZONE_NAMES.arm_l}</title></path>

      {/* Right arm */}
      <path d="M 165 106 C 173 116 177 132 177 148 C 177 166 173 180 168 194 C 166 200 160 200 157 196 C 154 192 154 176 154 160 C 152 142 148 120 146 108 Z" {...zp("arm_r")}><title>{ZONE_NAMES.arm_r}</title></path>

      {/* Left hand */}
      <ellipse cx="40" cy="214" rx="16" ry="20" {...zp("hand_l")}><title>{ZONE_NAMES.hand_l}</title></ellipse>

      {/* Right hand */}
      <ellipse cx="160" cy="214" rx="16" ry="20" {...zp("hand_r")}><title>{ZONE_NAMES.hand_r}</title></ellipse>

      {/* Left hip */}
      <path d="M 70 193 L 100 193 L 100 232 C 86 232 73 225 70 214 C 68 207 68 200 70 193 Z" {...zp("hip_l")}><title>{ZONE_NAMES.hip_l}</title></path>

      {/* Right hip */}
      <path d="M 100 193 L 130 193 C 132 200 132 207 130 214 C 127 225 114 232 100 232 L 100 193 Z" {...zp("hip_r")}><title>{ZONE_NAMES.hip_r}</title></path>

      {/* Left thigh */}
      <path d="M 70 230 C 68 244 67 262 67 278 C 67 298 69 312 73 318 L 99 318 L 99 230 Z" {...zp("leg_l")}><title>{ZONE_NAMES.leg_l}</title></path>

      {/* Right thigh */}
      <path d="M 101 230 L 101 318 L 127 318 C 131 312 133 298 133 278 C 133 262 132 244 130 230 Z" {...zp("leg_r")}><title>{ZONE_NAMES.leg_r}</title></path>

      {/* Left knee */}
      <ellipse cx="84" cy="326" rx="19" ry="12" {...zp("knee_l")}><title>{ZONE_NAMES.knee_l}</title></ellipse>

      {/* Right knee */}
      <ellipse cx="116" cy="326" rx="19" ry="12" {...zp("knee_r")}><title>{ZONE_NAMES.knee_r}</title></ellipse>

      {/* Left lower leg */}
      <path d="M 70 336 C 68 354 66 372 68 388 C 70 400 77 406 84 406 C 91 406 98 400 100 388 L 100 336 Z" {...zp("leg_l")}><title>{ZONE_NAMES.leg_l}</title></path>

      {/* Right lower leg */}
      <path d="M 100 336 L 100 388 C 102 400 109 406 116 406 C 123 406 130 400 132 388 C 134 372 132 354 130 336 Z" {...zp("leg_r")}><title>{ZONE_NAMES.leg_r}</title></path>

      {/* Left foot */}
      <path d="M 68 404 C 60 406 54 412 58 420 C 62 424 76 426 90 424 C 98 422 100 416 100 408 L 100 404 Z" {...zp("foot_l")}><title>{ZONE_NAMES.foot_l}</title></path>

      {/* Right foot */}
      <path d="M 100 404 L 100 408 C 100 416 102 422 110 424 C 124 426 138 424 142 420 C 146 412 140 406 132 404 Z" {...zp("foot_r")}><title>{ZONE_NAMES.foot_r}</title></path>
    </>
  );

  // ── BACK VIEW ───────────────────────────────────────────────────────────────
  const backBody = (
    <>
      {/* Head */}
      <ellipse cx="100" cy="34" rx="26" ry="30" {...zp("head")}><title>{ZONE_NAMES.head}</title></ellipse>

      {/* Neck */}
      <path d="M 91 62 C 90 68 89 73 89 80 L 111 80 C 111 73 110 68 109 62 Z" {...zp("neck")}><title>{ZONE_NAMES.neck}</title></path>

      {/* Left shoulder */}
      <ellipse cx="56" cy="97" rx="23" ry="15" {...zp("shoulder_l")}><title>{ZONE_NAMES.shoulder_l}</title></ellipse>

      {/* Right shoulder */}
      <ellipse cx="144" cy="97" rx="23" ry="15" {...zp("shoulder_r")}><title>{ZONE_NAMES.shoulder_r}</title></ellipse>

      {/* Back upper */}
      <path d="M 77 82 L 123 82 C 138 86 145 96 141 112 C 138 126 130 134 126 150 L 74 150 C 70 134 62 126 59 112 C 55 96 62 86 77 82 Z" {...zp("back_upper")}><title>{ZONE_NAMES.back_upper}</title></path>

      {/* Back lower */}
      <path d="M 74 150 L 126 150 C 128 163 130 173 130 185 C 130 193 117 197 100 197 C 83 197 70 193 70 185 C 70 173 72 163 74 150 Z" {...zp("back_lower")}><title>{ZONE_NAMES.back_lower}</title></path>

      {/* Left arm */}
      <path d="M 35 106 C 27 116 23 132 23 148 C 23 166 27 180 32 194 C 34 200 40 200 43 196 C 46 192 46 176 46 160 C 48 142 52 120 54 108 Z" {...zp("arm_l")}><title>{ZONE_NAMES.arm_l}</title></path>

      {/* Right arm */}
      <path d="M 165 106 C 173 116 177 132 177 148 C 177 166 173 180 168 194 C 166 200 160 200 157 196 C 154 192 154 176 154 160 C 152 142 148 120 146 108 Z" {...zp("arm_r")}><title>{ZONE_NAMES.arm_r}</title></path>

      {/* Left hand */}
      <ellipse cx="40" cy="214" rx="16" ry="20" {...zp("hand_l")}><title>{ZONE_NAMES.hand_l}</title></ellipse>

      {/* Right hand */}
      <ellipse cx="160" cy="214" rx="16" ry="20" {...zp("hand_r")}><title>{ZONE_NAMES.hand_r}</title></ellipse>

      {/* Left hip / glute */}
      <path d="M 70 193 L 100 193 L 100 232 C 86 232 73 225 70 214 C 68 207 68 200 70 193 Z" {...zp("hip_l")}><title>{ZONE_NAMES.hip_l}</title></path>

      {/* Right hip / glute */}
      <path d="M 100 193 L 130 193 C 132 200 132 207 130 214 C 127 225 114 232 100 232 L 100 193 Z" {...zp("hip_r")}><title>{ZONE_NAMES.hip_r}</title></path>

      {/* Left thigh (back) */}
      <path d="M 70 230 C 68 244 67 262 67 278 C 67 298 69 312 73 318 L 99 318 L 99 230 Z" {...zp("leg_l")}><title>{ZONE_NAMES.leg_l}</title></path>

      {/* Right thigh (back) */}
      <path d="M 101 230 L 101 318 L 127 318 C 131 312 133 298 133 278 C 133 262 132 244 130 230 Z" {...zp("leg_r")}><title>{ZONE_NAMES.leg_r}</title></path>

      {/* Left knee (back) */}
      <ellipse cx="84" cy="326" rx="19" ry="12" {...zp("knee_l")}><title>{ZONE_NAMES.knee_l}</title></ellipse>

      {/* Right knee (back) */}
      <ellipse cx="116" cy="326" rx="19" ry="12" {...zp("knee_r")}><title>{ZONE_NAMES.knee_r}</title></ellipse>

      {/* Left calf */}
      <path d="M 70 336 C 68 354 66 372 68 388 C 70 400 77 406 84 406 C 91 406 98 400 100 388 L 100 336 Z" {...zp("leg_l")}><title>{ZONE_NAMES.leg_l}</title></path>

      {/* Right calf */}
      <path d="M 100 336 L 100 388 C 102 400 109 406 116 406 C 123 406 130 400 132 388 C 134 372 132 354 130 336 Z" {...zp("leg_r")}><title>{ZONE_NAMES.leg_r}</title></path>

      {/* Left foot (back) */}
      <path d="M 68 404 C 60 406 54 412 58 420 C 62 424 76 426 90 424 C 98 422 100 416 100 408 L 100 404 Z" {...zp("foot_l")}><title>{ZONE_NAMES.foot_l}</title></path>

      {/* Right foot (back) */}
      <path d="M 100 404 L 100 408 C 100 416 102 422 110 424 C 124 426 138 424 142 420 C 146 412 140 406 132 404 Z" {...zp("foot_r")}><title>{ZONE_NAMES.foot_r}</title></path>
    </>
  );

  return (
    <div className="flex flex-col items-center gap-3 select-none">
      {/* Front / Back toggle */}
      <div className="flex items-center gap-1 bg-slate-900 rounded-full p-1 border border-slate-700">
        <button
          onClick={() => setSide("front")}
          className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
            side === "front"
              ? "bg-sky-500 text-white shadow-sm"
              : "text-slate-400 hover:text-white"
          }`}
        >
          Frontal
        </button>
        <button
          onClick={() => setSide("back")}
          className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
            side === "back"
              ? "bg-sky-500 text-white shadow-sm"
              : "text-slate-400 hover:text-white"
          }`}
        >
          Trasera
        </button>
      </div>

      {/* Tooltip */}
      <div className="h-7 flex items-center">
        {hovered ? (
          <span className="text-sm font-medium text-white bg-slate-900 border border-slate-600 px-3 py-1 rounded-full">
            {ZONE_NAMES[hovered]}
            {levelMap[hovered] !== undefined && (
              <span className="ml-2 text-xs opacity-70">· Dolor {levelMap[hovered]}/10</span>
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
        viewBox="0 0 200 440"
        className="w-full max-w-[210px]"
        role="img"
        aria-label="Mapa corporal interactivo"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <filter id="glow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="3.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Subtle body outline silhouette behind zones */}
        <path
          d="M 100 4 C 82 4 74 18 74 34 C 74 48 80 58 88 63 C 86 68 86 74 86 80 C 74 80 60 84 52 92 C 44 98 42 104 40 110 C 34 112 22 120 20 136 C 18 150 22 168 28 186 C 32 198 38 202 42 200 C 42 206 40 212 36 222 C 34 228 36 234 40 236 L 62 236 C 64 244 66 254 66 268 C 66 290 68 308 70 318 L 66 326 C 62 332 62 340 66 342 L 68 342 C 66 356 64 374 66 394 C 68 412 76 428 86 428 L 96 428 C 96 418 98 412 100 408 C 102 412 104 418 104 428 L 114 428 C 124 428 132 412 134 394 C 136 374 134 356 132 342 L 134 342 C 138 340 138 332 134 326 L 130 318 C 132 308 134 290 134 268 C 134 254 136 244 138 236 L 160 236 C 164 234 166 228 164 222 C 160 212 158 206 158 200 C 162 202 168 198 172 186 C 178 168 182 150 180 136 C 178 120 166 112 160 110 C 158 104 156 98 148 92 C 140 84 126 80 114 80 C 114 74 114 68 112 63 C 120 58 126 48 126 34 C 126 18 118 4 100 4 Z"
          fill="rgba(15,23,42,0.3)"
          stroke="#1e293b"
          strokeWidth="1"
        />

        {side === "front" ? frontBody : backBody}
      </svg>

      {/* Pain level legend */}
      <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs text-slate-500 mt-1">
        {[
          { color: "#475569", label: "Sin dolor" },
          { color: "#22c55e", label: "Leve" },
          { color: "#eab308", label: "Moderado" },
          { color: "#f97316", label: "Intenso" },
          { color: "#ef4444", label: "Severo" },
        ].map(({ color, label }) => (
          <span key={label} className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full inline-block" style={{ background: color }} />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
