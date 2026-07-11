"use client";
// Copyright © 2026 Browns Studio

import BodyMap from "./BodyMap";
import type { PainEntry, BodyZone } from "./BodyMap";
import { ZONE_NAMES } from "./BodyMap";

export interface DayRecord {
  date: string; // yyyy-mm-dd
  entries: PainEntry[];
}

interface PainHeatmapProps {
  history: DayRecord[];
}

function formatDayShort(dateStr: string): string {
  const date = new Date(dateStr + "T12:00:00");
  return date.toLocaleDateString("es-CL", { weekday: "short" }).slice(0, 3);
}

export default function PainHeatmap({ history }: PainHeatmapProps) {
  // Aggregate entries: average level per zone across all days
  const zoneAccum: Partial<Record<BodyZone, { total: number; count: number }>> = {};
  for (const day of history) {
    for (const entry of day.entries) {
      const acc = zoneAccum[entry.zone] ?? { total: 0, count: 0 };
      acc.total += entry.level;
      acc.count += 1;
      zoneAccum[entry.zone] = acc;
    }
  }

  const aggregatedEntries: PainEntry[] = (Object.keys(zoneAccum) as BodyZone[]).map((zone) => {
    const acc = zoneAccum[zone]!;
    return {
      zone,
      level: Math.round(acc.total / acc.count),
      timestamp: new Date().toISOString(),
    };
  });

  // Most affected zone
  let mostAffectedZone: BodyZone | null = null;
  let maxAvg = 0;
  for (const e of aggregatedEntries) {
    if (e.level > maxAvg) {
      maxAvg = e.level;
      mostAffectedZone = e.zone;
    }
  }

  // Last 7 days for line chart
  const last7 = [...history]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-7);

  // Ensure we have 7 slots (fill missing with null)
  const today = new Date();
  const chartDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (6 - i));
    const dateStr = d.toISOString().split("T")[0];
    const record = last7.find((r) => r.date === dateStr);
    const avg = record
      ? record.entries.reduce((s, e) => s + e.level, 0) / (record.entries.length || 1)
      : null;
    return { date: dateStr, avg };
  });

  // SVG line chart constants
  const chartW = 280;
  const chartH = 90;
  const padL = 28;
  const padR = 12;
  const padT = 8;
  const padB = 24;
  const innerW = chartW - padL - padR;
  const innerH = chartH - padT - padB;

  function xPos(i: number): number {
    return padL + (i / 6) * innerW;
  }

  function yPos(val: number): number {
    return padT + innerH - (val / 10) * innerH;
  }

  const validPoints = chartDays
    .map((d, i) => (d.avg !== null ? { x: xPos(i), y: yPos(d.avg), avg: d.avg } : null))
    .filter((p): p is { x: number; y: number; avg: number } => p !== null);

  const polylinePoints = validPoints.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <div className="space-y-6">
      {/* Most affected banner */}
      {mostAffectedZone && (
        <div className="flex items-center gap-3 p-3 bg-orange-900/20 border border-orange-800 rounded-xl">
          <svg viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="1.5" className="w-5 h-5 shrink-0">
            <path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          <span className="text-orange-300 text-sm">
            <strong>Zona más afectada (últimos 30 días):</strong> {ZONE_NAMES[mostAffectedZone]}{" "}
            <span className="opacity-70">· Nivel promedio: {maxAvg}/10</span>
          </span>
        </div>
      )}

      {/* Body map */}
      <div className="bg-[#1E293B] rounded-2xl p-4 border border-[#334155]">
        <h3 className="text-white font-semibold text-sm mb-3 text-center">
          Acumulado 30 días
        </h3>
        <BodyMap entries={aggregatedEntries} onZoneClick={() => {}} readOnly />
      </div>

      {/* Line chart */}
      <div className="bg-[#1E293B] rounded-2xl p-4 border border-[#334155]">
        <h3 className="text-white font-semibold text-sm mb-3">
          Nivel promedio diario — últimos 7 días
        </h3>
        <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full" xmlns="http://www.w3.org/2000/svg">
          {/* Grid lines */}
          {[0, 5, 10].map((v) => (
            <g key={v}>
              <line
                x1={padL}
                y1={yPos(v)}
                x2={chartW - padR}
                y2={yPos(v)}
                stroke="#334155"
                strokeWidth="1"
                strokeDasharray="4,4"
              />
              <text x={padL - 4} y={yPos(v) + 4} textAnchor="end" fontSize="9" fill="#64748b">
                {v}
              </text>
            </g>
          ))}

          {/* Polyline */}
          {validPoints.length > 1 && (
            <polyline
              points={polylinePoints}
              fill="none"
              stroke="#10B981"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Dots */}
          {validPoints.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r="4" fill="#10B981" stroke="#0F172A" strokeWidth="2" />
          ))}

          {/* X labels */}
          {chartDays.map((d, i) => (
            <text
              key={i}
              x={xPos(i)}
              y={chartH - 4}
              textAnchor="middle"
              fontSize="9"
              fill="#64748b"
            >
              {formatDayShort(d.date)}
            </text>
          ))}

          {/* No data indicator */}
          {validPoints.length === 0 && (
            <text x={chartW / 2} y={chartH / 2} textAnchor="middle" fontSize="11" fill="#64748b">
              Sin datos
            </text>
          )}
        </svg>
      </div>

      {/* Color legend */}
      <div className="flex flex-wrap gap-3 text-xs text-[#94A3B8]">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-green-500" />
          <span>1-3 Leve</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-yellow-500" />
          <span>4-6 Moderado</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-orange-500" />
          <span>7-9 Intenso</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-500" />
          <span>10 Severo</span>
        </div>
      </div>
    </div>
  );
}
