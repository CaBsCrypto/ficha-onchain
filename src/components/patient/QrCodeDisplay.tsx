"use client";

import { useMemo } from "react";

// ---------------------------------------------------------------------------
// Deterministic visual QR code (no external lib — visual placeholder)
// ---------------------------------------------------------------------------
export function QrCodeDisplay({ seed, size = 196 }: { seed: string; size?: number }) {
  const modules = 25;
  const cells = useMemo(() => {
    const grid: boolean[][] = [];
    let h = 0;
    for (let i = 0; i < seed.length; i++) {
      h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    }
    for (let r = 0; r < modules; r++) {
      grid[r] = [];
      for (let c = 0; c < modules; c++) {
        h = (h * 1103515245 + 12345 + r * 97 + c * 131) >>> 0;
        grid[r][c] = ((h >> 8) & 1) === 1;
      }
    }
    return grid;
  }, [seed]);

  const unit = size / modules;
  const finders = [
    [0, 0],
    [0, modules - 7],
    [modules - 7, 0],
  ];
  const inFinder = (r: number, c: number) =>
    finders.some(([fr, fc]) => r >= fr && r < fr + 7 && c >= fc && c < fc + 7);

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      role="img"
      aria-label="Código QR de la receta"
      className="rounded-lg"
    >
      <rect width={size} height={size} fill="#ffffff" />
      {cells.map((row, r) =>
        row.map((on, c) =>
          on && !inFinder(r, c) ? (
            <rect
              key={`${r}-${c}`}
              x={c * unit}
              y={r * unit}
              width={unit}
              height={unit}
              rx={unit * 0.25}
              fill="#0f172a"
            />
          ) : null,
        ),
      )}
      {finders.map(([fr, fc], i) => (
        <g key={i} transform={`translate(${fc * unit}, ${fr * unit})`}>
          <rect
            width={unit * 7}
            height={unit * 7}
            rx={unit * 1.4}
            fill="#0f172a"
          />
          <rect
            x={unit}
            y={unit}
            width={unit * 5}
            height={unit * 5}
            rx={unit}
            fill="#ffffff"
          />
          <rect
            x={unit * 2}
            y={unit * 2}
            width={unit * 3}
            height={unit * 3}
            rx={unit * 0.7}
            fill="#0ea5e9"
          />
        </g>
      ))}
    </svg>
  );
}
