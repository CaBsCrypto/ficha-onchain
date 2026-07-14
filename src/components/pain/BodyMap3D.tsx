"use client";
// Copyright © 2026 Browns Studio

import React, { useRef, useEffect, useCallback, useState } from "react";

// ─── Props ────────────────────────────────────────────────────────────────────

export interface BodyMap3DProps {
  painData: Record<string, number>;
  fibromyalgiaMode?: boolean;
  readOnly?: boolean;
  onZoneSelect?: (zoneId: string) => void;
  onMultiZoneSelect?: (zoneIds: string[]) => void;
  onNeedlePlaced?: (zoneId: string, level: number) => void;
}

type SelectorTool = "pin" | "area";

// ─── Zone names ───────────────────────────────────────────────────────────────

const ZONE_NAMES: Record<string, string> = {
  head: "Cabeza",        jaw: "Mandíbula",
  ear_l: "Oreja Izq.",  ear_r: "Oreja Der.",
  neck: "Cuello",
  shoulder_l: "Hombro Izq.", shoulder_r: "Hombro Der.",
  chest: "Pecho",        abdomen: "Abdomen",
  back_upper: "Espalda Alta", back_lower: "Espalda Baja",
  hip_l: "Cadera Izq.", hip_r: "Cadera Der.",
  arm_l: "Brazo Izq.",   arm_r: "Brazo Der.",
  forearm_l: "Antebrazo Izq.", forearm_r: "Antebrazo Der.",
  wrist_l: "Muñeca Izq.", wrist_r: "Muñeca Der.",
  hand_l: "Mano Izq.",   hand_r: "Mano Der.",
  leg_l: "Pierna Izq.",  leg_r: "Pierna Der.",
  knee_l: "Rodilla Izq.", knee_r: "Rodilla Der.",
  foot_l: "Pie Izq.",    foot_r: "Pie Der.",
};

// ─── Invisible hit zone definitions (match A-pose proportions of GLB model) ──

type GeoType = "sphere" | "cylinder" | "box";
interface SegDef {
  id: string;
  geoType: GeoType;
  geoArgs: number[];
  pos: [number, number, number];
  rot?: [number, number, number];
  scale?: [number, number, number];
}

const SEGMENT_DEFS: SegDef[] = [
  { id: "head",       geoType: "sphere",   geoArgs: [0.135, 16, 16], pos: [0, 1.60, 0.008],  scale: [0.95, 1.16, 1.02] },
  { id: "jaw",        geoType: "sphere",   geoArgs: [0.115, 12, 12], pos: [0, 1.42, 0.048],  scale: [0.84, 0.44, 0.80] },
  { id: "ear_l",      geoType: "sphere",   geoArgs: [0.040, 10, 10], pos: [-0.140, 1.60, 0], scale: [0.35, 0.70, 0.28] },
  { id: "ear_r",      geoType: "sphere",   geoArgs: [0.040, 10, 10], pos: [ 0.140, 1.60, 0], scale: [0.35, 0.70, 0.28] },
  { id: "neck",       geoType: "cylinder", geoArgs: [0.058, 0.072, 0.15, 12], pos: [0, 1.37, 0] },
  { id: "chest",      geoType: "cylinder", geoArgs: [0.210, 0.178, 0.28, 16], pos: [0, 1.12, 0.008] },
  { id: "abdomen",    geoType: "cylinder", geoArgs: [0.168, 0.190, 0.22, 16], pos: [0, 0.86, 0.010] },
  { id: "back_upper", geoType: "cylinder", geoArgs: [0.210, 0.178, 0.28, 16], pos: [0, 1.12, -0.008] },
  { id: "back_lower", geoType: "cylinder", geoArgs: [0.168, 0.190, 0.22, 16], pos: [0, 0.86, -0.010] },
  { id: "hip_l",      geoType: "sphere",   geoArgs: [0.105, 12, 12], pos: [-0.138, 0.59, 0] },
  { id: "hip_r",      geoType: "sphere",   geoArgs: [0.105, 12, 12], pos: [ 0.138, 0.59, 0] },
  { id: "shoulder_l", geoType: "sphere",   geoArgs: [0.105, 12, 12], pos: [-0.292, 1.24, 0] },
  { id: "shoulder_r", geoType: "sphere",   geoArgs: [0.105, 12, 12], pos: [ 0.292, 1.24, 0] },
  { id: "arm_l",      geoType: "cylinder", geoArgs: [0.068, 0.056, 0.30, 12], pos: [-0.400, 0.985, 0], rot: [0, 0,  0.22] },
  { id: "arm_r",      geoType: "cylinder", geoArgs: [0.068, 0.056, 0.30, 12], pos: [ 0.400, 0.985, 0], rot: [0, 0, -0.22] },
  { id: "forearm_l",  geoType: "cylinder", geoArgs: [0.056, 0.044, 0.26, 12], pos: [-0.462, 0.700, 0], rot: [0, 0,  0.08] },
  { id: "forearm_r",  geoType: "cylinder", geoArgs: [0.056, 0.044, 0.26, 12], pos: [ 0.462, 0.700, 0], rot: [0, 0, -0.08] },
  { id: "wrist_l",    geoType: "sphere",   geoArgs: [0.048, 10, 10], pos: [-0.468, 0.562, 0] },
  { id: "wrist_r",    geoType: "sphere",   geoArgs: [0.048, 10, 10], pos: [ 0.468, 0.562, 0] },
  { id: "hand_l",     geoType: "sphere",   geoArgs: [0.075, 12, 12], pos: [-0.464, 0.466, 0.010], scale: [1.10, 0.60, 1.20] },
  { id: "hand_r",     geoType: "sphere",   geoArgs: [0.075, 12, 12], pos: [ 0.464, 0.466, 0.010], scale: [1.10, 0.60, 1.20] },
  { id: "leg_l",      geoType: "cylinder", geoArgs: [0.098, 0.082, 0.34, 14], pos: [-0.130, 0.280, 0] },
  { id: "leg_r",      geoType: "cylinder", geoArgs: [0.098, 0.082, 0.34, 14], pos: [ 0.130, 0.280, 0] },
  { id: "knee_l",     geoType: "sphere",   geoArgs: [0.084, 12, 12], pos: [-0.130, 0.040, 0.055], scale: [1, 0.86, 1.05] },
  { id: "knee_r",     geoType: "sphere",   geoArgs: [0.084, 12, 12], pos: [ 0.130, 0.040, 0.055], scale: [1, 0.86, 1.05] },
  { id: "foot_l",     geoType: "box",      geoArgs: [0.098, 0.068, 0.200],    pos: [-0.130, -0.432, 0.072] },
  { id: "foot_r",     geoType: "box",      geoArgs: [0.098, 0.068, 0.200],    pos: [ 0.130, -0.432, 0.072] },
];

// ─── Pain indicator positions (center of each zone for overlay spheres) ───────

const ZONE_CENTERS: Record<string, [number, number, number]> = {};
for (const d of SEGMENT_DEFS) {
  if (!ZONE_CENTERS[d.id]) ZONE_CENTERS[d.id] = d.pos;
}

// ─── Fibromyalgia tender points ───────────────────────────────────────────────

const FIBRO_POINTS: Array<{ id: string; name: string; position: [number, number, number] }> = [
  { id: "fibro_occiput_l",      name: "Occipucio Izq.",       position: [-0.07, 1.68, -0.10] },
  { id: "fibro_occiput_r",      name: "Occipucio Der.",       position: [ 0.07, 1.68, -0.10] },
  { id: "fibro_cervical_l",     name: "Cervical Bajo Izq.",   position: [-0.05, 1.32, -0.08] },
  { id: "fibro_cervical_r",     name: "Cervical Bajo Der.",   position: [ 0.05, 1.32, -0.08] },
  { id: "fibro_trapezius_l",    name: "Trapecio Izq.",        position: [-0.21, 1.22, -0.05] },
  { id: "fibro_trapezius_r",    name: "Trapecio Der.",        position: [ 0.21, 1.22, -0.05] },
  { id: "fibro_supraspinous_l", name: "Supraespinoso Izq.",   position: [-0.23, 1.10, -0.14] },
  { id: "fibro_supraspinous_r", name: "Supraespinoso Der.",   position: [ 0.23, 1.10, -0.14] },
  { id: "fibro_rib2_l",         name: "2ª Costilla Izq.",     position: [-0.10, 1.10,  0.14] },
  { id: "fibro_rib2_r",         name: "2ª Costilla Der.",     position: [ 0.10, 1.10,  0.14] },
  { id: "fibro_epicondyle_l",   name: "Epicóndilo Izq.",      position: [-0.39, 0.84,  0.06] },
  { id: "fibro_epicondyle_r",   name: "Epicóndilo Der.",      position: [ 0.39, 0.84,  0.06] },
  { id: "fibro_gluteal_l",      name: "Glúteo Izq.",          position: [-0.16, 0.56, -0.18] },
  { id: "fibro_gluteal_r",      name: "Glúteo Der.",          position: [ 0.16, 0.56, -0.18] },
  { id: "fibro_trochanter_l",   name: "Trocánter Izq.",       position: [-0.23, 0.46, -0.10] },
  { id: "fibro_trochanter_r",   name: "Trocánter Der.",       position: [ 0.23, 0.46, -0.10] },
  { id: "fibro_knee_l",         name: "Rodilla (medial) Izq.",position: [-0.07, 0.02,  0.10] },
  { id: "fibro_knee_r",         name: "Rodilla (medial) Der.",position: [ 0.07, 0.02,  0.10] },
];

// ─── Colors ───────────────────────────────────────────────────────────────────

function painHex(level: number | undefined): number {
  if (!level || level === 0) return -1; // -1 = hidden
  if (level <= 3) return 0x4ade80;
  if (level <= 6) return 0xfbbf24;
  if (level <= 9) return 0xf97316;
  return 0xef4444;
}

function painHexNum(level: number): number {
  if (level <= 3) return 0x4ade80;
  if (level <= 6) return 0xfbbf24;
  if (level <= 9) return 0xf97316;
  return 0xef4444;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function BodyMap3D({
  painData,
  fibromyalgiaMode = false,
  readOnly = false,
  onZoneSelect,
  onMultiZoneSelect,
  onNeedlePlaced,
}: BodyMap3DProps) {
  const containerRef  = useRef<HTMLDivElement>(null);
  const tooltipRef    = useRef<HTMLSpanElement>(null);
  const hintRef       = useRef<HTMLSpanElement>(null);
  const sceneRef      = useRef<SceneState | null>(null);
  const [loading, setLoading] = useState(true);

  // Tool is always "pin" — area brush kept for compat but not exposed in UI
  const toolRef = useRef<SelectorTool>("pin");

  const [brush, setBrush] = useState<{ x: number; y: number; r: number } | null>(null);
  const brushRef = useRef<{ x: number; y: number; r: number } | null>(null);

  // ── Needle placement state ─────────────────────────────────────────────────
  const [draggingNeedle, setDraggingNeedle] = useState(false);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const [pendingNeedles, setPendingNeedles] = useState<PendingNeedle[]>([]);
  const [confirmingNeedle, setConfirmingNeedle] = useState<PendingNeedle | null>(null);
  const [confirmLevel, setConfirmLevel] = useState(5);
  const nextIdRef = useRef(0);

  // Drag pointer events (window-level, attached when dragging)
  useEffect(() => {
    if (!draggingNeedle) return;
    function onMove(e: PointerEvent) { setDragPos({ x: e.clientX, y: e.clientY }); }
    function onUp(e: PointerEvent) {
      setDraggingNeedle(false); setDragPos(null);
      const container = containerRef.current;
      const s = sceneRef.current;
      if (!container || !s) return;
      const rect = container.getBoundingClientRect();
      if (e.clientX >= rect.left && e.clientX <= rect.right &&
          e.clientY >= rect.top  && e.clientY <= rect.bottom) {
        const nx = ((e.clientX - rect.left) / rect.width)  * 2 - 1;
        const ny = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
        const hit = s.raycastAt(nx, ny);
        if (hit) {
          const nid = `needle_${nextIdRef.current++}`;
          s.addNeedle(nid, hit.pos, true);
          setPendingNeedles(prev => [...prev, { id: nid, zone: hit.zone, pos: hit.pos }]);
        }
      }
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup",   onUp);
    return () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); };
  }, [draggingNeedle]);

  function handleNeedlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDraggingNeedle(true);
    setDragPos({ x: e.clientX, y: e.clientY });
  }

  const onZoneSelectRef      = useRef(onZoneSelect);
  const onMultiZoneSelectRef = useRef(onMultiZoneSelect);
  useEffect(() => { onZoneSelectRef.current = onZoneSelect; },      [onZoneSelect]);
  useEffect(() => { onMultiZoneSelectRef.current = onMultiZoneSelect; }, [onMultiZoneSelect]);

  const painDataRef = useRef(painData);
  useEffect(() => {
    painDataRef.current = painData;
    const s = sceneRef.current;
    if (!s || !readOnly) return;
    // readOnly: create/update needles from painData at zone centers
    Object.entries(painData).forEach(([zone, lvl]) => {
      const pos = (ZONE_CENTERS[zone] ?? [0, 0.6, 0]) as [number, number, number];
      const roId = `ro_${zone}`;
      if (!s.dynamicNeedles.has(roId)) {
        s.addNeedle(roId, pos, false);
      }
      const color = painHex(lvl);
      if (color !== -1) s.setNeedleColor(roId, color);
    });
  }, [painData, readOnly]);

  useEffect(() => {
    const s = sceneRef.current;
    if (!s) return;
    s.fibroMeshes.forEach((m) => { m.visible = fibromyalgiaMode; });
  }, [fibromyalgiaMode]);

  const initScene = useCallback(() => {
    const container = containerRef.current;
    if (!container || sceneRef.current) return;
    const win = window as WindowWithTHREE;
    const THREE = win.THREE;
    if (!THREE) return;
    // GLTFLoader registers itself on THREE when loaded as a UMD script
    const GLTFLoader = (THREE as unknown as Record<string, unknown>)["GLTFLoader"] as (new () => GLTFLoaderClass) | undefined
      ?? win.GLTFLoader;
    if (!GLTFLoader) return;
    const T: THREECtors = THREE;

    // ── Renderer ─────────────────────────────────────────────────────────────
    const renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    const w = container.clientWidth, h = container.clientHeight;
    renderer.setSize(w, h);
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);

    // ── Camera ────────────────────────────────────────────────────────────────
    // FOV 50° gives a wider view; camera looks at body center (y≈0.58)
    const camera = new T.PerspectiveCamera(50, w / h, 0.05, 200);
    camera.position.set(0, 0.58, 2.8);

    // ── Scene & lights ────────────────────────────────────────────────────────
    const scene = new T.Scene();
    scene.add(new T.AmbientLight(0xffe8d8, 0.90));   // warm ambient
    const key = new T.DirectionalLight(0xfff6ee, 1.6); // warm key light
    key.position.set(1.5, 3.5, 3.0); scene.add(key);
    const fill = new T.DirectionalLight(0x88aacc, 0.55); // cool fill (opposite)
    fill.position.set(-2.5, 1.0, -1.5); scene.add(fill);
    const back = new T.DirectionalLight(0xffe0c0, 0.40); // warm rim from behind
    back.position.set(0.0, 1.0, -3.0); scene.add(back);
    const top = new T.DirectionalLight(0xffffff, 0.25); // soft top
    top.position.set(0, 4, 0); scene.add(top);

    // ── Pivot for rotation ────────────────────────────────────────────────────
    // No offset — model is aligned to hit zones (center ~y=0.58)
    const pivot = new T.Group();
    scene.add(pivot);

    // GLB meshes collected after load (for precise raycasting)
    const glbMeshesArr: THREEMesh[] = [];

    // ── Invisible hit zones (procedural) ─────────────────────────────────────
    const hitMeshes: THREEMesh[] = [];
    const hitByZone = new Map<string, THREEMesh[]>();
    const invMat = new T.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0, transparent: true, opacity: 0 });

    function makeGeo(def: SegDef): THREEGeo {
      if (def.geoType === "sphere")   return new T.SphereGeometry(def.geoArgs[0], def.geoArgs[1], def.geoArgs[2]);
      if (def.geoType === "cylinder") return new T.CylinderGeometry(def.geoArgs[0], def.geoArgs[1], def.geoArgs[2], def.geoArgs[3]);
      return new T.BoxGeometry(def.geoArgs[0], def.geoArgs[1], def.geoArgs[2]);
    }

    for (const def of SEGMENT_DEFS) {
      const m = new T.Mesh(makeGeo(def), invMat as unknown as THREEMeshStdMat);
      m.position.set(...def.pos);
      if (def.rot)   { m.rotation.x = def.rot[0]; m.rotation.y = def.rot[1]; m.rotation.z = def.rot[2]; }
      if (def.scale) m.scale.set(def.scale[0], def.scale[1], def.scale[2]);
      m.userData["id"]   = def.id;
      m.userData["name"] = ZONE_NAMES[def.id] ?? def.id;
      m.userData["hit"]  = true;
      hitMeshes.push(m);
      pivot.add(m);
      const arr = hitByZone.get(def.id) ?? [];
      arr.push(m); hitByZone.set(def.id, arr);
    }

    // ── Dynamic needle system ────────────────────────────────────────────────
    const dynamicNeedles = new Map<string, THREEGroup>();

    const nShaftGeo = new T.CylinderGeometry(0.0035, 0.0018, 0.22, 8);
    const nHeadGeo  = new T.SphereGeometry(0.014, 12, 12);
    const nTipGeo   = new T.CylinderGeometry(0, 0.0035, 0.030, 8);

    function makeNeedleGroup(color: number): THREEGroup {
      const group = new T.Group() as unknown as THREEGroup;
      const mat = new T.MeshStandardMaterial({
        color, roughness: 0.25, metalness: 0.65,
        emissive: color, emissiveIntensity: 0.35,
      }) as unknown as THREEMeshStdMat;
      const shaft = new T.Mesh(nShaftGeo, mat);
      (shaft as unknown as THREEObj3D).position.set(0, 0.11, 0);
      (group as unknown as THREEObj3D).add(shaft as unknown as THREEObj3D);
      const head = new T.Mesh(nHeadGeo, mat);
      (head as unknown as THREEObj3D).position.set(0, 0.235, 0);
      (group as unknown as THREEObj3D).add(head as unknown as THREEObj3D);
      const tip = new T.Mesh(nTipGeo, mat);
      (tip as unknown as THREEObj3D).position.set(0, -0.015, 0);
      (tip as unknown as THREEObj3D).rotation.z = Math.PI;
      (group as unknown as THREEObj3D).add(tip as unknown as THREEObj3D);
      return group;
    }

    // ── Fibromyalgia markers ──────────────────────────────────────────────────
    const fibroMeshes: THREEMesh[] = [];
    const fibroGeo = new T.SphereGeometry(0.032, 10, 10);
    const fibroMat = new T.MeshStandardMaterial({ color: 0xa78bfa, roughness: 0.4, metalness: 0, emissive: 0x6d28d9, emissiveIntensity: 0.60 });
    for (const pt of FIBRO_POINTS) {
      const m = new T.Mesh(fibroGeo, fibroMat as unknown as THREEMeshStdMat);
      m.position.set(...pt.position);
      m.userData["id"] = pt.id; m.userData["name"] = pt.name; m.userData["fibro"] = true;
      m.visible = fibromyalgiaMode;
      fibroMeshes.push(m); pivot.add(m);
    }

    // ── Hover indicator ring ──────────────────────────────────────────────────
    const hoverRingGeo = new T.SphereGeometry(0.072, 16, 16);
    const hoverRingMat = new T.MeshStandardMaterial({ color: 0x7dd3fc, roughness: 0.2, metalness: 0, transparent: true, opacity: 0.55, emissive: 0x38bdf8, emissiveIntensity: 0.50 });
    const hoverRing    = new T.Mesh(hoverRingGeo, hoverRingMat as unknown as THREEMeshStdMat);
    hoverRing.visible  = false;
    pivot.add(hoverRing);

    // ── Load GLB model ────────────────────────────────────────────────────────
    const loader = new GLTFLoader();
    loader.load(
      "/models/body2.glb",
      (gltf) => {
        const model = gltf.scene;
        // Center and scale to fit
        const box    = new T.Box3().setFromObject(model);
        const size   = box.getSize(new T.Vector3());
        const center = box.getCenter(new T.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const targetH = 2.20;
        const scaleFactor = targetH / maxDim;
        model.scale.setScalar(scaleFactor);
        // Align GLB center to match hit zone center (y≈0.58 in scene space)
        // Hit zones span y=-0.43 (feet) to y=1.60 (head), midpoint = 0.585
        const HIT_CENTER_Y = 0.585;
        model.position.set(
          -center.x * scaleFactor,
          -center.y * scaleFactor + HIT_CENTER_Y,
          -center.z * scaleFactor,
        );
        // Keep original GLB materials (textures from file) — only smooth normals
        model.traverse((child) => {
          const c = child as THREEMesh;
          if (c.isMesh) {
            c.geometry.computeVertexNormals();
            c.castShadow    = false;
            c.receiveShadow = false;
            glbMeshesArr.push(c);
          }
        });
        pivot.add(model);
        setLoading(false);
      },
      undefined,
      (err) => {
        console.error("[GLB load]", err);
        // Fallback: show procedural meshes
        hitMeshes.forEach((m) => {
          (m.material as THREEMeshStdMat).opacity = 1;
          (m.material as THREEMeshStdMat).transparent = false;
          (m.material as THREEMeshStdMat).color.setHex(0xc8906a);
        });
        setLoading(false);
      },
    );

    // ── Camera state ──────────────────────────────────────────────────────────
    let rotY = 0, rotX = 0;
    const ROT_X_MIN = -Math.PI / 4, ROT_X_MAX = Math.PI / 3;
    const ZOOM_MIN = 1.2, ZOOM_MAX = 6.0;

    // ── Raycasting ────────────────────────────────────────────────────────────
    const raycaster = new T.Raycaster();
    const pointer   = new T.Vector2();
    let hoveredZone: string | null = null;

    function getTargets() { return [...hitMeshes, ...(fibromyalgiaMode ? fibroMeshes : [])]; }

    function screenToNDC(e: MouseEvent | Touch) {
      const r = renderer.domElement.getBoundingClientRect();
      return {
        nx: ((e.clientX - r.left) / r.width)  * 2 - 1,
        ny: -((e.clientY - r.top) / r.height) * 2 + 1,
        px: e.clientX - r.left,
        py: e.clientY - r.top,
      };
    }

    function projectMeshToScreen(worldPos: THREEVec3): { x: number; y: number } {
      const cosY = Math.cos(rotY), sinY = Math.sin(rotY);
      const cosX = Math.cos(rotX), sinX = Math.sin(rotX);
      let px = worldPos.x, py = worldPos.y, pz = worldPos.z;
      const rx = px * cosY + pz * sinY; pz = -px * sinY + pz * cosY; px = rx;
      const ry2 = py * cosX - pz * sinX; const rz2 = py * sinX + pz * cosX; py = ry2; pz = rz2;
      const camZ = camera.position.z;
      const camY = 0.58; // camera.position.y
      const d = camZ - pz;
      if (d <= 0) return { x: -9999, y: -9999 };
      const fov = 50 * Math.PI / 180;
      const asp = (container?.clientWidth ?? 1) / (container?.clientHeight ?? 1);
      const scale = (1 / Math.tan(fov / 2)) / d;
      const sx = ((px * scale) / asp) * 0.5 + 0.5;
      const sy = (-(py - camY) * scale) * 0.5 + 0.5;
      return { x: sx * (container?.clientWidth ?? 1), y: sy * (container?.clientHeight ?? 1) };
    }

    function showTip(id: string, name: string) {
      const lvl = painDataRef.current[id];
      const tt  = tooltipRef.current, hi = hintRef.current;
      if (tt) { tt.textContent = lvl ? `${name} · Dolor ${lvl}/10` : name; tt.classList.remove("hidden"); }
      if (hi) hi.classList.add("hidden");
    }
    function hideTip() {
      if (tooltipRef.current)  tooltipRef.current.classList.add("hidden");
      if (hintRef.current)     hintRef.current.classList.remove("hidden");
    }

    function updateHover(nx: number, ny: number) {
      if (toolRef.current === "area") { hoverRing.visible = false; hoveredZone = null; return; }
      pointer.set(nx, ny);
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(getTargets());
      const hit  = hits[0]?.object as THREEMesh | undefined;
      if (hit) {
        const id   = hit.userData["id"] as string;
        hoveredZone = id;
        // Move hover ring to hit zone center
        const center = ZONE_CENTERS[id];
        if (center) { hoverRing.position.set(center[0], center[1], center[2] + 0.08); hoverRing.visible = true; }
        renderer.domElement.style.cursor = "pointer";
        showTip(id, hit.userData["name"] as string);
      } else {
        hoveredZone = null;
        hoverRing.visible = false;
        renderer.domElement.style.cursor = "grab";
        hideTip();
      }
    }

    // ── Interaction state ─────────────────────────────────────────────────────
    let isDragging = false, isAreaBrush = false;
    let prevX = 0, prevY = 0, dragStartX = 0, dragStartY = 0;
    let areaCX = 0, areaCY = 0;

    function onMouseDown(e: MouseEvent) {
      const { nx, ny, px, py } = screenToNDC(e);
      isDragging = true;
      prevX = dragStartX = e.clientX; prevY = dragStartY = e.clientY;
      if (toolRef.current === "area" && !readOnly) {
        pointer.set(nx, ny); raycaster.setFromCamera(pointer, camera);
        if (raycaster.intersectObjects(getTargets()).length > 0) {
          isAreaBrush = true; areaCX = px; areaCY = py;
          const b = { x: px, y: py, r: 0 }; brushRef.current = b; setBrush({ ...b });
        }
      } else { renderer.domElement.style.cursor = "grabbing"; }
    }

    function onMouseMove(e: MouseEvent) {
      const { nx, ny, px, py } = screenToNDC(e);
      if (isDragging && isAreaBrush) {
        const dx = px - areaCX, dy = py - areaCY;
        const b = { x: areaCX, y: areaCY, r: Math.sqrt(dx * dx + dy * dy) };
        brushRef.current = b; setBrush({ ...b }); return;
      }
      if (isDragging) {
        rotY += (e.clientX - prevX) * 0.007;
        rotX += (e.clientY - prevY) * 0.007;
        rotX  = Math.max(ROT_X_MIN, Math.min(ROT_X_MAX, rotX));
      } else { updateHover(nx, ny); }
      prevX = e.clientX; prevY = e.clientY;
    }

    function onMouseUp(e: MouseEvent) {
      const dx = Math.abs(e.clientX - dragStartX), dy = Math.abs(e.clientY - dragStartY);
      if (isAreaBrush && brushRef.current) {
        const b = brushRef.current;
        const selected = new Set<string>();
        for (const m of hitMeshes) {
          const wp = m.position;
          const { x, y } = projectMeshToScreen(wp);
          if (Math.sqrt((x - b.x) ** 2 + (y - b.y) ** 2) <= b.r) selected.add(m.userData["id"] as string);
        }
        if (selected.size > 0 && !readOnly) onMultiZoneSelectRef.current?.([...selected]);
        brushRef.current = null; setBrush(null); isAreaBrush = false;
      } else if (isDragging && dx < 6 && dy < 6 && toolRef.current === "pin" && !readOnly) {
        const { nx, ny } = screenToNDC(e);
        const hit = sceneRef.current?.raycastAt(nx, ny);
        if (hit) {
          const nid = `needle_${nextIdRef.current++}`;
          sceneRef.current?.addNeedle(nid, hit.pos, true);
          setPendingNeedles(prev => [...prev, { id: nid, zone: hit.zone, pos: hit.pos }]);
        }
      }
      isDragging = false;
      renderer.domElement.style.cursor = "grab";
    }

    function onWheel(e: WheelEvent) {
      e.preventDefault();
      camera.position.z = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, camera.position.z + e.deltaY * 0.004));
    }

    // Touch
    let touchStartX = 0, touchStartY = 0, pinchDist0 = 0, camZ0 = 0;
    function onTouchStart(e: TouchEvent) {
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        pinchDist0 = Math.sqrt(dx * dx + dy * dy); camZ0 = camera.position.z; return;
      }
      const t = e.touches[0];
      const { nx, ny, px, py } = screenToNDC(t);
      isDragging = true; prevX = touchStartX = t.clientX; prevY = touchStartY = t.clientY;
      if (toolRef.current === "area" && !readOnly) {
        pointer.set(nx, ny); raycaster.setFromCamera(pointer, camera);
        if (raycaster.intersectObjects(getTargets()).length > 0) {
          isAreaBrush = true; areaCX = px; areaCY = py;
          const b = { x: px, y: py, r: 0 }; brushRef.current = b; setBrush({ ...b });
        }
      }
    }
    function onTouchMove(e: TouchEvent) {
      e.preventDefault();
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        camera.position.z = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, camZ0 * (pinchDist0 / dist))); return;
      }
      const t = e.touches[0];
      const { px, py } = screenToNDC(t);
      if (isDragging && isAreaBrush) {
        const ddx = px - areaCX, ddy = py - areaCY;
        const b = { x: areaCX, y: areaCY, r: Math.sqrt(ddx * ddx + ddy * ddy) };
        brushRef.current = b; setBrush({ ...b }); return;
      }
      rotY += (t.clientX - prevX) * 0.010;
      rotX += (t.clientY - prevY) * 0.010;
      rotX = Math.max(ROT_X_MIN, Math.min(ROT_X_MAX, rotX));
      prevX = t.clientX; prevY = t.clientY;
    }
    function onTouchEnd(e: TouchEvent) {
      const t = e.changedTouches[0];
      const dx = Math.abs(t.clientX - touchStartX), dy = Math.abs(t.clientY - touchStartY);
      if (isAreaBrush && brushRef.current) {
        const b = brushRef.current;
        const selected = new Set<string>();
        for (const m of hitMeshes) {
          const { x, y } = projectMeshToScreen(m.position);
          if (Math.sqrt((x - b.x) ** 2 + (y - b.y) ** 2) <= b.r) selected.add(m.userData["id"] as string);
        }
        if (selected.size > 0 && !readOnly) onMultiZoneSelectRef.current?.([...selected]);
        brushRef.current = null; setBrush(null); isAreaBrush = false;
      } else if (dx < 10 && dy < 10 && toolRef.current === "pin" && !readOnly) {
        const { nx, ny } = screenToNDC(t);
        const hit = sceneRef.current?.raycastAt(nx, ny);
        if (hit) {
          const nid = `needle_${nextIdRef.current++}`;
          sceneRef.current?.addNeedle(nid, hit.pos, true);
          setPendingNeedles(prev => [...prev, { id: nid, zone: hit.zone, pos: hit.pos }]);
        }
      }
      isDragging = false;
    }

    const el = renderer.domElement;
    el.addEventListener("mousedown",  onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup",   onMouseUp);
    el.addEventListener("wheel",      onWheel,      { passive: false });
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove",  onTouchMove,  { passive: false });
    el.addEventListener("touchend",   onTouchEnd);
    el.style.cursor = "grab";

    // ── ResizeObserver ────────────────────────────────────────────────────────
    const ro = new ResizeObserver(() => {
      if (!container) return;
      const cw = container.clientWidth, ch = container.clientHeight;
      renderer.setSize(cw, ch);
      const cam = camera as unknown as { aspect: number; updateProjectionMatrix(): void };
      cam.aspect = cw / ch; cam.updateProjectionMatrix();
    });
    ro.observe(container);

    // ── Render loop ───────────────────────────────────────────────────────────
    let rafId = 0, time = 0;
    function animate() {
      rafId = requestAnimationFrame(animate);
      time += 0.020;

      // Slow auto-rotate when not interacting
      if (!isDragging) rotY += 0.003;

      // Pulse hover ring
      if (hoverRing.visible) hoverRing.scale.setScalar(1 + 0.10 * Math.sin(time * 3));

      // Needle quiver — tiny oscillation (acupuncture effect)
      let ni = 0;
      dynamicNeedles.forEach((needle) => {
        const nObj = needle as unknown as THREEObj3D;
        const baseZ = nObj.position.x * -0.35;
        const baseX = -0.12;
        nObj.rotation.z = baseZ + 0.015 * Math.sin(time * 5.5 + ni * 1.3);
        nObj.rotation.x = baseX + 0.008 * Math.sin(time * 4.8 + ni * 0.9);
        ni++;
      });

      // Pulse fibro markers
      if (fibromyalgiaMode) {
        fibroMeshes.forEach((m, i) => { if (m.visible) m.scale.setScalar(1 + 0.20 * Math.sin(time * 1.5 + i * 0.55)); });
      }

      pivot.rotation.y = rotY;
      pivot.rotation.x = rotX;
      renderer.render(scene, camera);
    }
    animate();

    sceneRef.current = {
      renderer, scene, camera, pivot, hitMeshes, hitByZone,
      glbMeshes: glbMeshesArr, dynamicNeedles, fibroMeshes, rafId, ro,
      addNeedle(id: string, pos: [number, number, number], pending: boolean) {
        const color = pending ? 0x38bdf8 : 0x4ade80;
        const needle = makeNeedleGroup(color);
        const nObj = needle as unknown as THREEObj3D;
        nObj.position.set(pos[0], pos[1], pos[2] + 0.04);
        nObj.rotation.z = pos[0] * -0.35;
        nObj.rotation.x = -0.12;
        pivot.add(nObj);
        dynamicNeedles.set(id, needle);
      },
      removeNeedle(id: string) {
        const n = dynamicNeedles.get(id);
        if (n) { pivot.remove(n as unknown as THREEObj3D); dynamicNeedles.delete(id); }
      },
      setNeedleColor(id: string, color: number) {
        const n = dynamicNeedles.get(id);
        if (!n) return;
        (n as unknown as THREEObj3D).traverse((child) => {
          const c = child as THREEMesh;
          if (c.isMesh) {
            (c.material as THREEMeshStdMat).color.setHex(color);
            (c.material as THREEMeshStdMat).emissive?.setHex(color);
          }
        });
      },
      raycastAt(nx: number, ny: number) {
        pointer.set(nx, ny);
        raycaster.setFromCamera(pointer, camera);
        // Precise free-form raycast against actual GLB mesh surface
        const glbHits = raycaster.intersectObjects(glbMeshesArr, true);
        if (glbHits[0]) {
          // p is in world space — convert to pivot-local using Three.js built-in
          const p = glbHits[0].point;
          pivot.worldToLocal(p); // mutates p to pivot-local coords
          // Find nearest zone
          let nearestZone = "torso";
          let minDist = Infinity;
          for (const [zid, zpos] of Object.entries(ZONE_CENTERS)) {
            const d = Math.hypot(p.x - zpos[0], p.y - zpos[1], p.z - zpos[2]);
            if (d < minDist) { minDist = d; nearestZone = zid; }
          }
          return { zone: nearestZone, pos: [p.x, p.y, p.z] as [number, number, number] };
        }
        // Fallback: invisible hit zones
        const hits = raycaster.intersectObjects([...hitMeshes, ...(fibromyalgiaMode ? fibroMeshes : [])]);
        if (hits[0]) {
          const zoneId = (hits[0].object as THREEMesh).userData["id"] as string;
          const zp = ZONE_CENTERS[zoneId] ?? [0, 0.6, 0];
          return { zone: zoneId, pos: zp as [number, number, number] };
        }
        return null;
      },
      cleanup() {
        cancelAnimationFrame(rafId); ro.disconnect();
        el.removeEventListener("mousedown",  onMouseDown);
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup",   onMouseUp);
        el.removeEventListener("wheel",      onWheel);
        el.removeEventListener("touchstart", onTouchStart);
        el.removeEventListener("touchmove",  onTouchMove);
        el.removeEventListener("touchend",   onTouchEnd);
        renderer.dispose();
        if (container.contains(el)) container.removeChild(el);
      },
    };
  }, [fibromyalgiaMode, readOnly]);

  useEffect(() => {
    function hasGLTF() {
      const w = window as WindowWithTHREE;
      return !!(w.GLTFLoader ?? (w.THREE as unknown as Record<string,unknown>)?.["GLTFLoader"]);
    }
    function loadScripts() {
      const win = window as WindowWithTHREE;
      if (win.THREE && hasGLTF()) { initScene(); return; }
      if (win.THREE && !hasGLTF()) {
        const s = document.createElement("script");
        s.src = "https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js";
        s.onload = () => initScene();
        s.onerror = () => initScene(); // fallback: try without GLB
        document.head.appendChild(s); return;
      }
      const s3 = document.createElement("script");
      s3.src = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";
      s3.onload = () => {
        const sg = document.createElement("script");
        sg.src = "https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js";
        sg.onload  = () => initScene();
        sg.onerror = () => initScene(); // fallback: show procedural body
        document.head.appendChild(sg);
      };
      document.head.appendChild(s3);
    }
    loadScripts();
    return () => { sceneRef.current?.cleanup(); sceneRef.current = null; };
  }, [initScene]);

  // Pain level color preview
  function levelColor(lvl: number) {
    if (lvl <= 3) return "#4ade80";
    if (lvl <= 6) return "#fbbf24";
    if (lvl <= 9) return "#f97316";
    return "#ef4444";
  }

  return (
    <div className="select-none w-full flex gap-2" style={{ height: "clamp(420px, 85vw, 560px)" }}>

      {/* ── 3D Canvas ── */}
      <div className="relative flex-1 rounded-xl overflow-hidden">
        {/* Loading spinner */}
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-950/60 z-10 rounded-xl">
            <div className="flex flex-col items-center gap-2">
              <div className="w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-xs text-slate-400">Cargando modelo 3D…</span>
            </div>
          </div>
        )}
        {/* Three.js canvas */}
        <div ref={containerRef} className="absolute inset-0" />

        {/* Tooltip (zone name on hover) */}
        <span ref={tooltipRef} className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 text-sm font-medium text-white bg-slate-900/90 border border-slate-600 px-3 py-1 rounded-full hidden z-10" />
        <span ref={hintRef} className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 text-xs text-slate-400 whitespace-nowrap z-10">
          {readOnly ? "Vista 3D · arrastra · scroll para zoom"
            : "Arrastra una aguja al cuerpo · toca una zona · scroll para zoom"}
        </span>

        {/* Area brush overlay (kept for compat) */}
        {brush && (
          <svg className="pointer-events-none absolute inset-0 w-full h-full">
            <circle cx={brush.x} cy={brush.y} r={brush.r} fill="rgba(167,139,250,0.12)" stroke="#a78bfa" strokeWidth="2" strokeDasharray="6 3" />
            <circle cx={brush.x} cy={brush.y} r="4" fill="#a78bfa" />
          </svg>
        )}

        {/* ── Pain slider for confirming needle level ── */}
        {confirmingNeedle && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/65 rounded-xl">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl p-5 mx-4 w-full max-w-xs shadow-2xl">
              <div className="flex items-center gap-3 mb-4">
                <svg viewBox="0 0 16 60" className="h-10 w-3 flex-shrink-0" style={{ color: levelColor(confirmLevel) }}>
                  <ellipse cx="8" cy="8" rx="6" ry="6" fill="currentColor" />
                  <rect x="6.5" y="13" width="3" height="37" rx="1.5" fill="currentColor" opacity="0.85" />
                  <polygon points="8,54 5.5,49 10.5,49" fill="currentColor" opacity="0.7" />
                </svg>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 mb-0.5">Nivel de dolor</p>
                  <h3 className="text-sm font-semibold text-white">{ZONE_NAMES[confirmingNeedle.zone] ?? confirmingNeedle.zone}</h3>
                </div>
              </div>

              <div className="flex items-center gap-3 mb-2">
                <span className="text-3xl font-bold w-8 text-center tabular-nums" style={{ color: levelColor(confirmLevel) }}>
                  {confirmLevel}
                </span>
                <input
                  type="range" min={1} max={10} value={confirmLevel}
                  onChange={(e) => {
                    const lvl = Number(e.target.value);
                    setConfirmLevel(lvl);
                    sceneRef.current?.setNeedleColor(confirmingNeedle.id, painHexNum(lvl));
                  }}
                  className="flex-1 h-2 rounded-full appearance-none cursor-pointer"
                  style={{ accentColor: levelColor(confirmLevel) }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-slate-500 mb-5 px-1">
                <span>Mínimo</span><span>Máximo</span>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => {
                    sceneRef.current?.removeNeedle(confirmingNeedle.id);
                    setPendingNeedles(prev => prev.filter(n => n.id !== confirmingNeedle.id));
                    setConfirmingNeedle(null);
                  }}
                  className="flex-1 rounded-xl border border-slate-700 py-2.5 text-sm font-medium text-slate-400 hover:bg-slate-800 transition">
                  Quitar
                </button>
                <button
                  onClick={() => {
                    onNeedlePlaced?.(confirmingNeedle.zone, confirmLevel);
                    onZoneSelect?.(confirmingNeedle.zone);
                    sceneRef.current?.setNeedleColor(confirmingNeedle.id, painHexNum(confirmLevel));
                    setPendingNeedles(prev => prev.filter(n => n.id !== confirmingNeedle.id));
                    setConfirmingNeedle(null);
                    setConfirmLevel(5);
                  }}
                  className="flex-1 rounded-xl py-2.5 text-sm font-semibold text-white shadow transition"
                  style={{ backgroundColor: levelColor(confirmLevel) }}>
                  Confirmar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Needle sidebar ── */}
      {!readOnly && (
        <div className="w-16 flex flex-col items-center gap-3 rounded-2xl bg-slate-900/95 border border-slate-700/60 py-4 px-2 backdrop-blur-sm overflow-y-auto">

          {/* Draggable needle */}
          <p className="text-[9px] font-semibold uppercase tracking-widest text-slate-500">Aguja</p>
          <div
            className="touch-none cursor-grab active:cursor-grabbing flex flex-col items-center group"
            onPointerDown={handleNeedlePointerDown}
            title="Arrastra al cuerpo"
          >
            <svg viewBox="0 0 20 70" className="h-14 w-5 text-sky-400 group-hover:text-sky-300 transition-colors drop-shadow-[0_0_8px_rgba(56,189,248,0.7)]">
              <ellipse cx="10" cy="9" rx="8" ry="8" fill="currentColor" />
              <rect x="8.5" y="16" width="3" height="44" rx="1.5" fill="currentColor" opacity="0.8" />
              <polygon points="10,65 7,58 13,58" fill="currentColor" opacity="0.6" />
            </svg>
            <p className="text-[9px] text-slate-500 text-center mt-1 leading-tight">Arrastra</p>
          </div>

          {/* Pending needles list */}
          {pendingNeedles.length > 0 && (
            <>
              <div className="w-full h-px bg-slate-700/60 my-1" />
              <p className="text-[9px] font-semibold uppercase tracking-widest text-sky-500">
                {pendingNeedles.length} {pendingNeedles.length === 1 ? "aguja" : "agujas"}
              </p>
              {pendingNeedles.map((pn) => (
                <div key={pn.id} className="w-full flex flex-col items-center gap-1">
                  <span className="text-[9px] text-slate-300 text-center leading-tight truncate w-full text-center">
                    {ZONE_NAMES[pn.zone] ?? pn.zone}
                  </span>
                  <button
                    onClick={() => { setConfirmingNeedle(pn); setConfirmLevel(5); sceneRef.current?.setNeedleColor(pn.id, painHexNum(5)); }}
                    className="w-full rounded-lg bg-sky-600/80 hover:bg-sky-500 text-white text-[10px] font-semibold py-1 transition"
                  >✓ Dolor</button>
                </div>
              ))}
            </>
          )}

          {/* Fibro legend */}
          {fibromyalgiaMode && (
            <div className="flex flex-col items-center gap-1">
              <span className="w-3 h-3 rounded-full bg-violet-400 inline-block" />
              <span className="text-[9px] text-slate-500 text-center">Fibro</span>
            </div>
          )}

          {/* Pain scale dots */}
          <div className="mt-auto flex flex-col items-center gap-1">
            {[{ c: "#4ade80", l: "1–3" }, { c: "#fbbf24", l: "4–6" }, { c: "#f97316", l: "7–9" }, { c: "#ef4444", l: "10" }].map(({ c, l }) => (
              <div key={l} className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: c }} />
                <span className="text-[9px] text-slate-500">{l}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Drag ghost needle ── */}
      {draggingNeedle && dragPos && (
        <div
          className="pointer-events-none fixed z-[9999]"
          style={{ left: dragPos.x - 10, top: dragPos.y - 50 }}
        >
          <svg viewBox="0 0 20 70" className="h-16 w-5 text-sky-300 drop-shadow-[0_0_12px_rgba(56,189,248,0.95)]">
            <ellipse cx="10" cy="9" rx="8" ry="8" fill="currentColor" />
            <rect x="8.5" y="16" width="3" height="44" rx="1.5" fill="currentColor" opacity="0.9" />
            <polygon points="10,65 7,58 13,58" fill="currentColor" opacity="0.7" />
          </svg>
        </div>
      )}
    </div>
  );
}

// ─── Three.js type shims ──────────────────────────────────────────────────────

interface THREEColor      { setHex(h: number): void }
interface THREEVec2       { set(x: number, y: number): void }
interface THREEVec3       { x: number; y: number; z: number; set(x: number, y: number, z: number): void }
interface THREEGeo        { dispose(): void; computeVertexNormals(): void }
interface THREEMeshStdMat { color: THREEColor; roughness: number; metalness: number; emissive?: THREEColor; emissiveIntensity?: number; transparent?: boolean; opacity?: number; dispose(): void }
interface THREEObj3D {
  position: THREEVec3; rotation: { x: number; y: number; z: number };
  scale: { set(x: number, y: number, z: number): void; setScalar(s: number): void };
  add(o: THREEObj3D): void; visible: boolean; isMesh?: boolean;
  userData: Record<string, unknown>; traverse(cb: (o: THREEObj3D) => void): void;
  castShadow: boolean; receiveShadow: boolean;
}
interface THREEMesh extends THREEObj3D { material: THREEMeshStdMat; geometry: THREEGeo }
interface THREEScene  extends THREEObj3D {}
interface THREEGroup  extends THREEObj3D { remove(o: THREEObj3D): void; worldToLocal(v: THREEVec3): THREEVec3 }
interface THREECamera { position: THREEVec3; aspect?: number; updateProjectionMatrix?(): void }
interface THREEBox3   { setFromObject(o: THREEObj3D): THREEBox3; getSize(v: THREEVec3): THREEVec3; getCenter(v: THREEVec3): THREEVec3 }
interface THREERenderer { domElement: HTMLCanvasElement; setPixelRatio(r: number): void; setSize(w: number, h: number): void; setClearColor(c: number, a: number): void; render(s: THREEScene, c: THREECamera): void; dispose(): void }
interface THREECaster  { setFromCamera(p: THREEVec2, c: THREECamera): void; intersectObjects(o: THREEMesh[], recursive?: boolean): Array<{ object: THREEObj3D; point: THREEVec3 }> }
interface GLTF         { scene: THREEGroup }
interface THREECtors {
  WebGLRenderer: new (o: { antialias: boolean; alpha: boolean }) => THREERenderer;
  PerspectiveCamera: new (fov: number, asp: number, n: number, f: number) => THREECamera;
  Scene: new () => THREEScene; Group: new () => THREEGroup;
  AmbientLight: new (c: number, i: number) => THREEObj3D;
  DirectionalLight: new (c: number, i: number) => THREEObj3D & { position: THREEVec3 };
  Mesh: new (g: THREEGeo, m: THREEMeshStdMat) => THREEMesh;
  MeshStandardMaterial: new (o: { color?: number; roughness?: number; metalness?: number; emissive?: number; emissiveIntensity?: number; transparent?: boolean; opacity?: number }) => THREEMeshStdMat;
  SphereGeometry:   new (r: number, w: number, h: number) => THREEGeo;
  CylinderGeometry: new (rt: number, rb: number, h: number, s: number) => THREEGeo;
  BoxGeometry:      new (w: number, h: number, d: number) => THREEGeo;
  Box3:             new () => THREEBox3;
  Vector3:          new () => THREEVec3;
  Vector2:          new () => THREEVec2;
  Raycaster:        new () => THREECaster;
}
interface GLTFLoaderClass { load(url: string, onLoad: (g: GLTF) => void, onProgress: undefined, onError: (e: unknown) => void): void }
interface WindowWithTHREE { THREE?: THREECtors; GLTFLoader?: new () => GLTFLoaderClass }
interface PendingNeedle { id: string; zone: string; pos: [number, number, number] }
interface SceneState {
  renderer: THREERenderer; scene: THREEScene; camera: THREECamera; pivot: THREEGroup;
  hitMeshes: THREEMesh[]; hitByZone: Map<string, THREEMesh[]>;
  glbMeshes: THREEMesh[];
  dynamicNeedles: Map<string, THREEGroup>;
  fibroMeshes: THREEMesh[];
  rafId: number; ro: ResizeObserver;
  addNeedle(id: string, pos: [number, number, number], pending: boolean): void;
  removeNeedle(id: string): void;
  setNeedleColor(id: string, color: number): void;
  raycastAt(nx: number, ny: number): { zone: string; pos: [number, number, number] } | null;
  cleanup(): void;
}
