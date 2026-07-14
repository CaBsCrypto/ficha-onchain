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
  if (hovered) return "rgba(125,211,252,0.22)";
  if (!level) return "rgba(15,23,42,0.45)";
  if (level <= 3) return "rgba(34,197,94,0.26)";
  if (level <= 6) return "rgba(234,179,8,0.30)";
  if (level <= 9) return "rgba(249,115,22,0.34)";
  return "rgba(239,68,68,0.38)";
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

  // ─── Shared zone shapes ────────────────────────────────────────────────────

  // Head: ellipse, same as before
  const headZone = <ellipse cx="100" cy="30" rx="22" ry="26" {...zp("head")}><title>{ZONE_NAMES.head}</title></ellipse>;

  // Neck: tapered path (wider at base)
  const neckZone = <path d="M 91,54 C 90,58 89,64 88,70 L 112,70 C 111,64 110,58 109,54 Z" {...zp("neck")}><title>{ZONE_NAMES.neck}</title></path>;

  // Shoulders: rounded cap shapes
  const shoulderLZone = (
    <path d="M 88,70 C 80,72 68,78 56,86 C 46,92 40,102 42,112 C 50,106 62,98 74,94 C 82,90 86,82 84,72 Z"
      {...zp("shoulder_l")}><title>{ZONE_NAMES.shoulder_l}</title></path>
  );
  const shoulderRZone = (
    <path d="M 112,70 C 120,72 132,78 144,86 C 154,92 160,102 158,112 C 150,106 138,98 126,94 C 118,90 114,82 116,72 Z"
      {...zp("shoulder_r")}><title>{ZONE_NAMES.shoulder_r}</title></path>
  );

  // Arms: tapered paths (wider at shoulder, narrower at wrist)
  const armLZone = (
    <path d="M 42,112 C 38,130 35,150 34,168 C 33,182 35,196 38,202 L 55,202 C 56,196 56,182 56,168 C 56,150 56,130 55,112 Z"
      {...zp("arm_l")}><title>{ZONE_NAMES.arm_l}</title></path>
  );
  const armRZone = (
    <path d="M 158,112 C 162,130 165,150 166,168 C 167,182 165,196 162,202 L 145,202 C 144,196 144,182 144,168 C 144,150 144,130 145,112 Z"
      {...zp("arm_r")}><title>{ZONE_NAMES.arm_r}</title></path>
  );

  // Hands: oval/teardrop shape
  const handLZone = (
    <path d="M 38,202 C 33,210 31,220 33,228 C 35,236 41,242 48,242 C 55,242 61,236 63,228 C 65,220 63,210 58,202 Z"
      {...zp("hand_l")}><title>{ZONE_NAMES.hand_l}</title></path>
  );
  const handRZone = (
    <path d="M 162,202 C 167,210 169,220 167,228 C 165,236 159,242 152,242 C 145,242 139,236 137,228 C 135,220 137,210 142,202 Z"
      {...zp("hand_r")}><title>{ZONE_NAMES.hand_r}</title></path>
  );

  // Hips: pelvic shapes
  const hipLZone = (
    <path d="M 78,174 C 74,182 72,192 72,204 L 100,204 C 100,192 98,182 96,174 Z"
      {...zp("hip_l")}><title>{ZONE_NAMES.hip_l}</title></path>
  );
  const hipRZone = (
    <path d="M 104,174 C 102,182 100,192 100,204 L 128,204 C 128,192 126,182 122,174 Z"
      {...zp("hip_r")}><title>{ZONE_NAMES.hip_r}</title></path>
  );

  // Thighs: tapered legs (wider at hip, narrower at knee)
  const legLThighZone = (
    <path d="M 72,204 C 68,222 66,244 68,264 C 70,278 74,290 78,298 L 96,298 C 100,290 102,278 102,264 C 102,244 100,222 100,204 Z"
      {...zp("leg_l")}><title>{ZONE_NAMES.leg_l}</title></path>
  );
  const legRThighZone = (
    <path d="M 100,204 C 100,222 98,244 98,264 C 98,278 100,290 104,298 L 122,298 C 126,290 130,278 130,264 C 130,244 130,222 128,204 Z"
      {...zp("leg_r")}><title>{ZONE_NAMES.leg_r}</title></path>
  );

  // Knees: rounded oval
  const kneeLZone = (
    <path d="M 70,298 C 68,308 68,318 72,326 C 76,332 82,336 88,336 C 94,336 100,332 102,326 C 104,318 102,308 100,298 Z"
      {...zp("knee_l")}><title>{ZONE_NAMES.knee_l}</title></path>
  );
  const kneeRZone = (
    <path d="M 98,298 C 96,308 96,318 100,326 C 104,332 108,336 114,336 C 120,336 126,332 128,326 C 130,318 130,308 128,298 Z"
      {...zp("knee_r")}><title>{ZONE_NAMES.knee_r}</title></path>
  );

  // Shins/calves: tapered below knee
  const legLShinZone = (
    <path d="M 74,336 C 72,352 72,368 74,380 C 76,388 80,392 84,394 L 96,394 C 100,392 102,388 102,380 C 104,368 102,352 100,336 Z"
      {...zp("leg_l")}><title>{ZONE_NAMES.leg_l}</title></path>
  );
  const legRShinZone = (
    <path d="M 100,336 C 98,352 96,368 98,380 C 100,388 102,392 106,394 L 116,394 C 120,392 124,388 126,380 C 126,368 126,352 124,336 Z"
      {...zp("leg_r")}><title>{ZONE_NAMES.leg_r}</title></path>
  );

  // Feet: proper foot silhouette (extends slightly forward)
  const footLZone = (
    <path d="M 74,394 C 66,396 56,400 52,406 C 50,412 56,414 66,412 C 76,410 84,406 86,398 C 86,396 82,394 74,394 Z"
      {...zp("foot_l")}><title>{ZONE_NAMES.foot_l}</title></path>
  );
  const footRZone = (
    <path d="M 106,394 C 114,394 120,396 120,398 C 122,406 130,410 140,412 C 150,414 156,412 154,406 C 150,400 140,396 132,394 Z"
      {...zp("foot_r")}><title>{ZONE_NAMES.foot_r}</title></path>
  );

  // ─── Front view ────────────────────────────────────────────────────────────

  const frontTorso = (
    <>
      {/* Chest: proper tapered torso shape */}
      <path d="M 84,70 C 78,76 74,88 72,104 C 70,118 72,132 76,142 L 124,142 C 128,132 130,118 128,104 C 126,88 122,76 116,70 Z"
        {...zp("chest")}><title>{ZONE_NAMES.chest}</title></path>
      {/* Abdomen: with waist taper */}
      <path d="M 76,142 C 74,150 73,160 74,170 C 75,178 78,184 82,186 L 118,186 C 122,184 125,178 126,170 C 127,160 126,150 124,142 Z"
        {...zp("abdomen")}><title>{ZONE_NAMES.abdomen}</title></path>
    </>
  );

  const backTorso = (
    <>
      {/* Upper back */}
      <path d="M 84,70 C 78,76 74,88 72,104 C 70,118 72,132 76,142 L 124,142 C 128,132 130,118 128,104 C 126,88 122,76 116,70 Z"
        {...zp("back_upper")}><title>{ZONE_NAMES.back_upper}</title></path>
      {/* Lower back */}
      <path d="M 76,142 C 74,150 73,160 74,170 C 75,178 78,184 82,186 L 118,186 C 122,184 125,178 126,170 C 127,160 126,150 124,142 Z"
        {...zp("back_lower")}><title>{ZONE_NAMES.back_lower}</title></path>
    </>
  );

  // ─── Background silhouette ─────────────────────────────────────────────────

  // Subtle body outline behind all zones for visual context
  const silhouetteFill = "rgba(15,23,42,0.3)";
  const silhouetteStroke = "#1e3a5f";
  const silhouetteProps = { fill: silhouetteFill, stroke: silhouetteStroke, strokeWidth: 1.2 };

  const backgroundSilhouette = (
    <g opacity="0.9" pointerEvents="none">
      {/* Head */}
      <ellipse cx="100" cy="30" rx="23" ry="27" {...silhouetteProps} />
      {/* Neck */}
      <path d="M 91,53 L 88,71 L 112,71 L 109,53 Z" {...silhouetteProps} />
      {/* Torso body */}
      <path d="M 84,71 C 76,77 72,94 70,114 C 68,132 70,150 74,166 C 76,176 78,184 80,190 L 120,190 C 122,184 124,176 126,166 C 130,150 132,132 130,114 C 128,94 124,77 116,71 Z" {...silhouetteProps} />
      {/* Left shoulder blade */}
      <path d="M 84,71 C 76,73 64,80 52,90 C 44,96 40,108 42,116 L 55,112 C 56,106 62,98 74,94 C 82,90 84,80 84,72 Z" {...silhouetteProps} />
      {/* Right shoulder blade */}
      <path d="M 116,71 C 124,73 136,80 148,90 C 156,96 160,108 158,116 L 145,112 C 144,106 138,98 126,94 C 118,90 116,80 116,72 Z" {...silhouetteProps} />
      {/* Left arm */}
      <path d="M 42,116 C 36,134 32,154 32,174 C 31,188 33,200 37,208 L 56,208 C 56,200 56,186 57,172 C 58,152 56,132 55,112 Z" {...silhouetteProps} />
      {/* Right arm */}
      <path d="M 158,116 C 164,134 168,154 168,174 C 169,188 167,200 163,208 L 144,208 C 144,200 144,186 143,172 C 142,152 144,132 145,112 Z" {...silhouetteProps} />
      {/* Left hand */}
      <path d="M 37,208 C 32,218 30,228 32,236 C 34,244 41,250 49,250 C 57,250 63,244 65,236 C 67,228 64,218 58,208 Z" {...silhouetteProps} />
      {/* Right hand */}
      <path d="M 163,208 C 168,218 170,228 168,236 C 166,244 159,250 151,250 C 143,250 137,244 135,236 C 133,228 136,218 142,208 Z" {...silhouetteProps} />
      {/* Pelvis/hips */}
      <path d="M 74,186 C 70,196 68,208 70,220 L 130,220 C 132,208 130,196 126,186 Z" {...silhouetteProps} />
      {/* Left thigh */}
      <path d="M 70,220 C 64,240 62,262 64,282 C 66,296 70,308 76,316 L 96,316 C 102,308 104,296 104,282 C 104,262 100,240 100,220 Z" {...silhouetteProps} />
      {/* Right thigh */}
      <path d="M 100,220 C 100,240 96,262 96,282 C 96,296 98,308 104,316 L 124,316 C 130,308 134,296 134,282 C 136,262 134,240 128,220 Z" {...silhouetteProps} />
      {/* Left knee */}
      <ellipse cx="86" cy="320" rx="16" ry="12" {...silhouetteProps} />
      {/* Right knee */}
      <ellipse cx="114" cy="320" rx="16" ry="12" {...silhouetteProps} />
      {/* Left shin */}
      <path d="M 74,332 C 70,350 70,368 72,382 C 74,392 78,398 83,400 L 96,400 C 100,398 103,392 104,382 C 106,368 104,350 100,332 Z" {...silhouetteProps} />
      {/* Right shin */}
      <path d="M 100,332 C 96,350 96,368 96,382 C 97,392 100,398 104,400 L 117,400 C 122,398 126,392 128,382 C 130,368 130,350 126,332 Z" {...silhouetteProps} />
      {/* Left foot */}
      <path d="M 72,400 C 62,402 52,406 50,412 C 48,418 56,420 68,418 C 80,416 86,410 86,402 Z" {...silhouetteProps} />
      {/* Right foot */}
      <path d="M 104,402 C 104,410 110,416 122,418 C 134,420 142,418 140,412 C 138,406 128,402 118,400 Z" {...silhouetteProps} />
    </g>
  );

  // ─── Shared zones (all views) ──────────────────────────────────────────────
  const sharedZones = (
    <>
      {headZone}
      {neckZone}
      {shoulderLZone}
      {shoulderRZone}
      {armLZone}
      {armRZone}
      {handLZone}
      {handRZone}
      {hipLZone}
      {hipRZone}
      {legLThighZone}
      {legRThighZone}
      {kneeLZone}
      {kneeRZone}
      {legLShinZone}
      {legRShinZone}
      {footLZone}
      {footRZone}
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
        viewBox="0 0 200 420"
        className="w-full max-w-[200px]"
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
          {/* Subtle inner shadow/depth on base shapes */}
          <filter id="inner" x="-10%" y="-10%" width="120%" height="120%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="1.5" result="blur" />
            <feMerge>
              <feMergeNode in="SourceGraphic" />
              <feMergeNode in="blur" />
            </feMerge>
          </filter>
        </defs>

        {/* Background body silhouette */}
        {backgroundSilhouette}

        {/* Interactive zones */}
        {side === "front" ? frontTorso : backTorso}
        {sharedZones}
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
