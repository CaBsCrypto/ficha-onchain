/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
/**
 * RegionDetail3D — a pop-up that opens a DEDICATED 3D sub-model of one body
 * region so the patient can mark pain at a much finer grain than the full-body
 * map allows (individual phalanges, knuckles, palm, wrist…).
 *
 * This does NOT touch BodyMap3D. It renders as an overlay; the body map stays
 * intact underneath. The sub-model here is built PROCEDURALLY from primitives
 * (no external GLB asset exists for a detailed hand) — every anatomical part is
 * its own mesh, so raycasting hits a single part precisely. If a sculpted GLB is
 * sourced later it can replace the procedural build inside this same container
 * without changing the callers.
 *
 * Sub-zones are returned to the caller as { partId: level }, keyed with compound
 * ids like "hand_r.index.dist" so they merge straight into the existing pain
 * diary data (zone→level) with no backend change. The body map can then show an
 * aggregate for the parent zone.
 *
 * THREE r128 is loaded globally by BodyMap3D (UMD from CDN); we reuse
 * window.THREE and, if this ever mounts first, load the same script.
 */
import { useRef, useEffect, useState, useCallback } from "react";

// ─── Part definitions (right arm+hand, palm toward camera, fingers up) ─────────
type Kind = "cylinder" | "sphere" | "box";
interface PartDef {
  id: string;      // compound sub-zone id, e.g. "index.dist"
  name: string;    // human label, e.g. "Índice · punta"
  kind: Kind;
  args: number[];  // geometry args (see makeGeo)
  pos: [number, number, number];
  rot?: [number, number, number];
  scale?: [number, number, number];
}

// Finger layout: x offset, knuckle height, phalange lengths [proximal, middle, distal].
const FINGERS = [
  { key: "index",  label: "Índice",  x: -0.039, mcpY: 0.060, lens: [0.045, 0.030, 0.023] },
  { key: "middle", label: "Medio",   x: -0.013, mcpY: 0.066, lens: [0.050, 0.034, 0.026] },
  { key: "ring",   label: "Anular",  x:  0.013, mcpY: 0.061, lens: [0.046, 0.031, 0.024] },
  { key: "little", label: "Meñique", x:  0.037, mcpY: 0.050, lens: [0.036, 0.024, 0.020] },
] as const;

const SEG_LABEL: Record<string, string> = { prox: "base", med: "medio", dist: "punta" };

function buildArmHandParts(): PartDef[] {
  const parts: PartDef[] = [];

  // Forearm + wrist + palm.
  parts.push({ id: "forearm", name: "Antebrazo", kind: "cylinder", args: [0.048, 0.064, 0.30, 16], pos: [0, -0.25, 0] });
  parts.push({ id: "wrist",   name: "Muñeca",    kind: "sphere",   args: [0.052, 16, 14],           pos: [0, -0.086, 0], scale: [1.15, 0.62, 0.95] });
  parts.push({ id: "palm",    name: "Palma",     kind: "box",      args: [0.104, 0.12, 0.040],      pos: [0, 0.005, 0] });

  const R = 0.0115; // phalange radius

  for (const f of FINGERS) {
    let y = f.mcpY;
    // MCP knuckle — user explicitly wants "nudillos" tappable.
    parts.push({ id: `${f.key}.mcp`, name: `Nudillo ${f.label.toLowerCase()}`, kind: "sphere", args: [0.0135, 12, 12], pos: [f.x, y, 0.006] });
    const segs = ["prox", "med", "dist"] as const;
    for (let i = 0; i < 3; i++) {
      const L = f.lens[i];
      const r = R * (1 - i * 0.12);
      parts.push({
        id: `${f.key}.${segs[i]}`,
        name: `${f.label} · ${SEG_LABEL[segs[i]]}`,
        kind: "cylinder",
        args: [r * 0.9, r, L, 12],
        pos: [f.x, y + L / 2, 0.006],
      });
      y += L;
      if (i < 2) parts.push({ id: `${f.key}.${segs[i]}_joint`, name: `${f.label} · articulación`, kind: "sphere", args: [r * 1.05, 10, 10], pos: [f.x, y, 0.006] });
    }
  }

  // Thumb — off the radial side, angled out and forward.
  parts.push({ id: "thumb.mcp",  name: "Nudillo pulgar", kind: "sphere",   args: [0.016, 12, 12],           pos: [-0.058, -0.012, 0.012] });
  parts.push({ id: "thumb.prox", name: "Pulgar · base",  kind: "cylinder", args: [0.0135, 0.015, 0.044, 12], pos: [-0.078, 0.012, 0.02], rot: [0.2, 0, 0.75] });
  parts.push({ id: "thumb.dist", name: "Pulgar · punta", kind: "cylinder", args: [0.011, 0.0135, 0.034, 12], pos: [-0.100, 0.040, 0.028], rot: [0.2, 0, 0.75] });

  return parts;
}

const PARTS = buildArmHandParts();
// Joint spheres between phalanges are visual filler — not independently useful
// to mark, so they collapse onto their preceding segment when picked.
const PICKABLE = new Set(PARTS.filter((p) => !p.id.endsWith("_joint")).map((p) => p.id));

// ─── Colour by pain level (shared scale with the body map) ────────────────────
function levelHex(level: number): number {
  if (level <= 3) return 0x4ade80;
  if (level <= 6) return 0xfbbf24;
  if (level <= 9) return 0xf97316;
  return 0xef4444;
}
function levelCss(level: number): string {
  if (level <= 3) return "#4ade80";
  if (level <= 6) return "#fbbf24";
  if (level <= 9) return "#f97316";
  return "#ef4444";
}

const SKIN = 0xd9a488;

interface Props {
  title: string;
  /** Existing sub-zone levels, keyed WITHOUT the region prefix (e.g. "index.dist"). */
  initial?: Record<string, number>;
  /** Prefix applied to ids when saving, e.g. "hand_r". */
  keyPrefix: string;
  onClose: () => void;
  onSave: (levels: Record<string, number>) => void;
}

export default function RegionDetail3D({ title, initial = {}, keyPrefix, onClose, onSave }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const apiRef = useRef<{ recolor: (levels: Record<string, number>) => void; cleanup: () => void } | null>(null);

  const [levels, setLevels] = useState<Record<string, number>>(initial);
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(null);
  const [loading, setLoading] = useState(true);

  const levelsRef = useRef(levels);
  useEffect(() => { levelsRef.current = levels; apiRef.current?.recolor(levels); }, [levels]);

  // Called from the 3D scene (raycast) when a part is tapped.
  const onPick = useCallback((id: string) => {
    const part = PARTS.find((p) => p.id === id);
    if (part) setSelected({ id: part.id, name: part.name });
  }, []);
  const onPickRef = useRef(onPick);
  useEffect(() => { onPickRef.current = onPick; }, [onPick]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    function initScene() {
      const THREE: any = (window as any).THREE;
      if (!THREE || !container) return;

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      const w = container.clientWidth, h = container.clientHeight;
      renderer.setSize(w, h);
      renderer.setClearColor(0x000000, 0);
      renderer.outputEncoding = THREE.sRGBEncoding;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;
      container.appendChild(renderer.domElement);

      const camera = new THREE.PerspectiveCamera(45, w / h, 0.01, 100);
      camera.position.set(0, 0.02, 0.62);

      const scene = new THREE.Scene();
      scene.add(new THREE.AmbientLight(0xffffff, 0.6));
      const key = new THREE.DirectionalLight(0xfff4ec, 2.1); key.position.set(1.2, 2.0, 2.5); scene.add(key);
      const fill = new THREE.DirectionalLight(0xdce6f2, 0.9); fill.position.set(-2, 0.5, -1); scene.add(fill);
      const back = new THREE.DirectionalLight(0xffffff, 0.6); back.position.set(0, 1.5, -2.5); scene.add(back);

      const pivot = new THREE.Group(); scene.add(pivot);

      function makeGeo(kind: Kind, a: number[]) {
        if (kind === "sphere")   return new THREE.SphereGeometry(a[0], a[1], a[2]);
        if (kind === "box")      return new THREE.BoxGeometry(a[0], a[1], a[2]);
        return new THREE.CylinderGeometry(a[0], a[1], a[2], a[3]);
      }

      const matById = new Map<string, any>();
      for (const p of PARTS) {
        const mat = new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.7, metalness: 0.0 });
        const mesh = new THREE.Mesh(makeGeo(p.kind, p.args), mat);
        mesh.position.set(p.pos[0], p.pos[1], p.pos[2]);
        if (p.rot) mesh.rotation.set(p.rot[0], p.rot[1], p.rot[2]);
        if (p.scale) mesh.scale.set(p.scale[0], p.scale[1], p.scale[2]);
        mesh.userData.id = p.id;
        pivot.add(mesh);
        matById.set(p.id, mat);
      }

      function recolor(lv: Record<string, number>) {
        for (const [id, mat] of matById) {
          const pickId = id.endsWith("_joint") ? id.replace("_joint", "") : id;
          const level = lv[pickId];
          if (level && level > 0) { mat.color.setHex(levelHex(level)); mat.emissive?.setHex(levelHex(level)); if ("emissiveIntensity" in mat) mat.emissiveIntensity = 0.25; }
          else { mat.color.setHex(SKIN); mat.emissive?.setHex(0x000000); }
        }
      }
      recolor(levelsRef.current);

      // ── Interaction: orbit + tap-to-pick ─────────────────────────────────────
      let rotY = -0.15, rotX = 0.05, dist = 0.62;
      let dragging = false, moved = false, px = 0, py = 0;
      const raycaster = new THREE.Raycaster();
      const ndc = new THREE.Vector2();
      const el = renderer.domElement as HTMLCanvasElement;

      function toNDC(cx: number, cy: number) {
        const r = el.getBoundingClientRect();
        ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
      }
      function pickAt(cx: number, cy: number) {
        toNDC(cx, cy); raycaster.setFromCamera(ndc, camera);
        const hits = raycaster.intersectObjects(pivot.children as any[]);
        if (!hits[0]) return;
        let id = (hits[0].object as any).userData.id as string;
        if (id.endsWith("_joint")) id = id.replace("_joint", "");
        if (PICKABLE.has(id)) onPickRef.current(id);
      }

      function onDown(e: PointerEvent) { dragging = true; moved = false; px = e.clientX; py = e.clientY; el.setPointerCapture?.(e.pointerId); }
      function onMove(e: PointerEvent) {
        if (!dragging) return;
        const dx = e.clientX - px, dy = e.clientY - py;
        if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
        rotY += dx * 0.01; rotX += dy * 0.01;
        rotX = Math.max(-1.2, Math.min(1.2, rotX));
        px = e.clientX; py = e.clientY;
      }
      function onUp(e: PointerEvent) {
        if (dragging && !moved) pickAt(e.clientX, e.clientY);
        dragging = false;
      }
      function onWheel(e: WheelEvent) { e.preventDefault(); dist = Math.max(0.32, Math.min(1.1, dist + e.deltaY * 0.0006)); }

      el.addEventListener("pointerdown", onDown);
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      el.addEventListener("wheel", onWheel, { passive: false });

      let raf = 0;
      function animate() {
        raf = requestAnimationFrame(animate);
        pivot.rotation.y = rotY; pivot.rotation.x = rotX;
        camera.position.set(0, 0.02, dist); camera.lookAt(0, 0.02, 0);
        renderer.render(scene, camera);
      }
      animate();
      setLoading(false);

      const ro = new ResizeObserver(() => {
        const nw = container.clientWidth, nh = container.clientHeight;
        renderer.setSize(nw, nh); camera.aspect = nw / nh; camera.updateProjectionMatrix();
      });
      ro.observe(container);

      apiRef.current = {
        recolor,
        cleanup() {
          cancelAnimationFrame(raf); ro.disconnect();
          el.removeEventListener("pointerdown", onDown);
          window.removeEventListener("pointermove", onMove);
          window.removeEventListener("pointerup", onUp);
          el.removeEventListener("wheel", onWheel);
          renderer.dispose();
          if (container.contains(el)) container.removeChild(el);
        },
      };
    }

    // Reuse the global THREE r128 (loaded by BodyMap3D); load it if we're first.
    if ((window as any).THREE) { initScene(); }
    else {
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";
      s.onload = () => initScene();
      s.onerror = () => setLoading(false);
      document.head.appendChild(s);
    }

    return () => { apiRef.current?.cleanup(); apiRef.current = null; };
  }, []);

  function setLevel(lvl: number) {
    if (!selected) return;
    setLevels((prev) => ({ ...prev, [selected.id]: lvl }));
  }
  function clearLevel() {
    if (!selected) return;
    setLevels((prev) => { const n = { ...prev }; delete n[selected.id]; return n; });
    setSelected(null);
  }
  function save() {
    const out: Record<string, number> = {};
    for (const [id, lvl] of Object.entries(levels)) if (lvl > 0) out[`${keyPrefix}.${id}`] = lvl;
    onSave(out);
  }

  const marked = Object.entries(levels).filter(([, v]) => v > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4">
      <div className="w-full sm:max-w-md bg-slate-950 sm:rounded-2xl border-t sm:border border-slate-800 shadow-2xl overflow-hidden flex flex-col" style={{ maxHeight: "92vh" }}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
          <div>
            <p className="text-sm font-semibold text-white">{title}</p>
            <p className="text-[11px] text-slate-400">Toca una parte · arrastra para girar</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl leading-none px-2">✕</button>
        </div>

        {/* 3D canvas */}
        <div className="relative bg-slate-900" style={{ height: "clamp(240px, 42vh, 360px)" }}>
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center z-10">
              <div className="w-7 h-7 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          <div ref={containerRef} className="absolute inset-0" />
          {marked.length > 0 && (
            <div className="absolute top-2 left-2 rounded-md bg-slate-950/80 px-2 py-1 text-[10px] text-slate-300 backdrop-blur-sm">
              {marked.length} zona{marked.length === 1 ? "" : "s"} marcada{marked.length === 1 ? "" : "s"}
            </div>
          )}
        </div>

        {/* Intensity picker for the selected part */}
        <div className="px-4 py-3 border-t border-slate-800">
          {selected ? (
            <>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-white">{selected.name}</span>
                {levels[selected.id] ? (
                  <button onClick={clearLevel} className="text-[11px] text-rose-400 hover:text-rose-300">Quitar</button>
                ) : null}
              </div>
              <div className="grid grid-cols-10 gap-1">
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
                  const active = levels[selected.id] === n;
                  return (
                    <button
                      key={n}
                      onClick={() => setLevel(n)}
                      className="h-8 rounded text-[11px] font-semibold text-white/90 transition-transform"
                      style={{ background: levelCss(n), outline: active ? "2px solid white" : "none", transform: active ? "scale(1.08)" : "none" }}
                    >
                      {n}
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <p className="text-xs text-slate-500 py-2 text-center">Toca una parte del modelo para registrar dolor ahí.</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-slate-800 flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-xl border border-slate-700 py-2.5 text-sm text-slate-300 hover:bg-slate-800">Cancelar</button>
          <button onClick={save} className="flex-1 rounded-xl bg-sky-500 py-2.5 text-sm font-semibold text-white hover:bg-sky-400">Guardar {marked.length > 0 ? `(${marked.length})` : ""}</button>
        </div>
      </div>
    </div>
  );
}
