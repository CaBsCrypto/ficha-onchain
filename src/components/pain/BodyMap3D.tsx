"use client";
// Copyright © 2026 Browns Studio

import React, { useRef, useEffect, useCallback, useState } from "react";

// ─── Props ────────────────────────────────────────────────────────────────────

export interface BodyMap3DProps {
  painData: Record<string, number>;
  fibromyalgiaMode?: boolean;
  readOnly?: boolean;
  onZoneSelect?: (zoneId: string) => void;
  /** Called when area-brush selects multiple zones at once */
  onMultiZoneSelect?: (zoneIds: string[]) => void;
}

// ─── Selector tool type ───────────────────────────────────────────────────────

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

// ─── Segment definitions (A-pose, improved mannequin proportions) ──────────

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
  // ── Head region ──────────────────────────────────────────────────────────
  // Head: slightly oval, tilted forward (mannequin has no face)
  { id: "head",       geoType: "sphere",   geoArgs: [0.135, 24, 24],          pos: [0, 1.60, 0.008],  scale: [0.95, 1.16, 1.02] },
  // Jaw: flatter oval at bottom of head
  { id: "jaw",        geoType: "sphere",   geoArgs: [0.115, 18, 18],          pos: [0, 1.42, 0.048],  scale: [0.84, 0.44, 0.80] },
  // Ears: thin discs on the sides
  { id: "ear_l",      geoType: "sphere",   geoArgs: [0.040, 12, 12],          pos: [-0.140, 1.60, 0], scale: [0.35, 0.70, 0.28] },
  { id: "ear_r",      geoType: "sphere",   geoArgs: [0.040, 12, 12],          pos: [ 0.140, 1.60, 0], scale: [0.35, 0.70, 0.28] },
  // ── Neck ─────────────────────────────────────────────────────────────────
  { id: "neck",       geoType: "cylinder", geoArgs: [0.058, 0.072, 0.15, 16], pos: [0, 1.37, 0] },
  // ── Chest (wider at top — pec area) ──────────────────────────────────────
  { id: "chest",      geoType: "cylinder", geoArgs: [0.210, 0.178, 0.28, 22], pos: [0, 1.12, 0.008] },
  // ── Abdomen (narrower at waist, slightly forward) ─────────────────────────
  { id: "abdomen",    geoType: "cylinder", geoArgs: [0.168, 0.190, 0.22, 22], pos: [0, 0.86, 0.010] },
  // ── Back (offset negative Z — visible when rotated) ──────────────────────
  { id: "back_upper", geoType: "cylinder", geoArgs: [0.210, 0.178, 0.28, 22], pos: [0, 1.12, -0.008] },
  { id: "back_lower", geoType: "cylinder", geoArgs: [0.168, 0.190, 0.22, 22], pos: [0, 0.86, -0.010] },
  // ── Pelvis / hips ─────────────────────────────────────────────────────────
  { id: "hip_l",      geoType: "sphere",   geoArgs: [0.105, 16, 16],          pos: [-0.138, 0.59, 0] },
  { id: "hip_r",      geoType: "sphere",   geoArgs: [0.105, 16, 16],          pos: [ 0.138, 0.59, 0] },
  // ── Shoulders (deltoid caps — wider, rounder) ─────────────────────────────
  { id: "shoulder_l", geoType: "sphere",   geoArgs: [0.105, 18, 18],          pos: [-0.292, 1.24, 0] },
  { id: "shoulder_r", geoType: "sphere",   geoArgs: [0.105, 18, 18],          pos: [ 0.292, 1.24, 0] },
  // ── Upper arms (slight A-pose angle: ~20°) ────────────────────────────────
  { id: "arm_l",      geoType: "cylinder", geoArgs: [0.068, 0.056, 0.30, 16], pos: [-0.400, 0.985, 0], rot: [0, 0,  0.22] },
  { id: "arm_r",      geoType: "cylinder", geoArgs: [0.068, 0.056, 0.30, 16], pos: [ 0.400, 0.985, 0], rot: [0, 0, -0.22] },
  // ── Elbow joints (connector, shares arm zone) ─────────────────────────────
  { id: "arm_l",      geoType: "sphere",   geoArgs: [0.062, 14, 14],          pos: [-0.450, 0.832, 0] },
  { id: "arm_r",      geoType: "sphere",   geoArgs: [0.062, 14, 14],          pos: [ 0.450, 0.832, 0] },
  // ── Forearms ─────────────────────────────────────────────────────────────
  { id: "forearm_l",  geoType: "cylinder", geoArgs: [0.056, 0.044, 0.26, 16], pos: [-0.462, 0.700, 0], rot: [0, 0,  0.08] },
  { id: "forearm_r",  geoType: "cylinder", geoArgs: [0.056, 0.044, 0.26, 16], pos: [ 0.462, 0.700, 0], rot: [0, 0, -0.08] },
  // ── Wrists ───────────────────────────────────────────────────────────────
  { id: "wrist_l",    geoType: "sphere",   geoArgs: [0.048, 14, 14],          pos: [-0.468, 0.562, 0] },
  { id: "wrist_r",    geoType: "sphere",   geoArgs: [0.048, 14, 14],          pos: [ 0.468, 0.562, 0] },
  // ── Hands (wider palm shape) ──────────────────────────────────────────────
  { id: "hand_l",     geoType: "sphere",   geoArgs: [0.075, 16, 16],          pos: [-0.464, 0.466, 0.010], scale: [1.10, 0.60, 1.20] },
  { id: "hand_r",     geoType: "sphere",   geoArgs: [0.075, 16, 16],          pos: [ 0.464, 0.466, 0.010], scale: [1.10, 0.60, 1.20] },
  // ── Thighs (wider at top) ─────────────────────────────────────────────────
  { id: "leg_l",      geoType: "cylinder", geoArgs: [0.098, 0.082, 0.34, 18], pos: [-0.130, 0.280, 0] },
  { id: "leg_r",      geoType: "cylinder", geoArgs: [0.098, 0.082, 0.34, 18], pos: [ 0.130, 0.280, 0] },
  // ── Knees ─────────────────────────────────────────────────────────────────
  { id: "knee_l",     geoType: "sphere",   geoArgs: [0.084, 16, 16],          pos: [-0.130, 0.040, 0.055], scale: [1, 0.86, 1.05] },
  { id: "knee_r",     geoType: "sphere",   geoArgs: [0.084, 16, 16],          pos: [ 0.130, 0.040, 0.055], scale: [1, 0.86, 1.05] },
  // ── Shins/calves (reuse leg zone) ────────────────────────────────────────
  { id: "leg_l",      geoType: "cylinder", geoArgs: [0.074, 0.058, 0.30, 18], pos: [-0.130, -0.235, 0] },
  { id: "leg_r",      geoType: "cylinder", geoArgs: [0.074, 0.058, 0.30, 18], pos: [ 0.130, -0.235, 0] },
  // ── Feet ─────────────────────────────────────────────────────────────────
  { id: "foot_l",     geoType: "box",      geoArgs: [0.098, 0.068, 0.200],    pos: [-0.130, -0.432, 0.072] },
  { id: "foot_r",     geoType: "box",      geoArgs: [0.098, 0.068, 0.200],    pos: [ 0.130, -0.432, 0.072] },
];

// ─── Fibromyalgia tender points ───────────────────────────────────────────────

interface FibroPoint { id: string; name: string; position: [number, number, number] }
const FIBRO_POINTS: FibroPoint[] = [
  { id: "fibro_occiput_l",      name: "Occipucio Izq.",        position: [-0.07, 1.68, -0.10] },
  { id: "fibro_occiput_r",      name: "Occipucio Der.",        position: [ 0.07, 1.68, -0.10] },
  { id: "fibro_cervical_l",     name: "Cervical Bajo Izq.",    position: [-0.05, 1.32, -0.08] },
  { id: "fibro_cervical_r",     name: "Cervical Bajo Der.",    position: [ 0.05, 1.32, -0.08] },
  { id: "fibro_trapezius_l",    name: "Trapecio Izq.",         position: [-0.21, 1.22, -0.05] },
  { id: "fibro_trapezius_r",    name: "Trapecio Der.",         position: [ 0.21, 1.22, -0.05] },
  { id: "fibro_supraspinous_l", name: "Supraespinoso Izq.",    position: [-0.23, 1.10, -0.14] },
  { id: "fibro_supraspinous_r", name: "Supraespinoso Der.",    position: [ 0.23, 1.10, -0.14] },
  { id: "fibro_rib2_l",         name: "2ª Costilla Izq.",      position: [-0.10, 1.10,  0.14] },
  { id: "fibro_rib2_r",         name: "2ª Costilla Der.",      position: [ 0.10, 1.10,  0.14] },
  { id: "fibro_epicondyle_l",   name: "Epicóndilo Izq.",       position: [-0.39, 0.84,  0.06] },
  { id: "fibro_epicondyle_r",   name: "Epicóndilo Der.",       position: [ 0.39, 0.84,  0.06] },
  { id: "fibro_gluteal_l",      name: "Glúteo Izq.",           position: [-0.16, 0.56, -0.18] },
  { id: "fibro_gluteal_r",      name: "Glúteo Der.",           position: [ 0.16, 0.56, -0.18] },
  { id: "fibro_trochanter_l",   name: "Trocánter Izq.",        position: [-0.23, 0.46, -0.10] },
  { id: "fibro_trochanter_r",   name: "Trocánter Der.",        position: [ 0.23, 0.46, -0.10] },
  { id: "fibro_knee_l",         name: "Rodilla (medial) Izq.", position: [-0.07, 0.02,  0.10] },
  { id: "fibro_knee_r",         name: "Rodilla (medial) Der.", position: [ 0.07, 0.02,  0.10] },
];

// ─── Colors ───────────────────────────────────────────────────────────────────

const SKIN_HEX  = 0xc8956a;
const HOVER_HEX = 0x7dd3fc;
const SELECT_HEX = 0x38bdf8;

function painHex(level: number | undefined): number {
  if (!level || level === 0) return SKIN_HEX;
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
}: BodyMap3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const tooltipRef   = useRef<HTMLSpanElement>(null);
  const hintRef      = useRef<HTMLSpanElement>(null);
  const sceneRef     = useRef<SceneState | null>(null);

  // Selector tool state (React-controlled, passed down to scene via ref)
  const [tool, setTool] = useState<SelectorTool>("pin");
  const toolRef = useRef<SelectorTool>("pin");
  useEffect(() => { toolRef.current = tool; }, [tool]);

  // Area brush overlay state
  const [brush, setBrush] = useState<{ x: number; y: number; r: number } | null>(null);
  const brushRef = useRef<{ x: number; y: number; r: number } | null>(null);

  const onZoneSelectRef = useRef(onZoneSelect);
  useEffect(() => { onZoneSelectRef.current = onZoneSelect; }, [onZoneSelect]);
  const onMultiZoneSelectRef = useRef(onMultiZoneSelect);
  useEffect(() => { onMultiZoneSelectRef.current = onMultiZoneSelect; }, [onMultiZoneSelect]);

  const painDataRef = useRef(painData);
  useEffect(() => { painDataRef.current = painData; }, [painData]);

  // Update segment colors on painData change
  useEffect(() => {
    const s = sceneRef.current;
    if (!s) return;
    s.zoneToMeshes.forEach((meshes, id) => {
      const level = painData[id];
      meshes.forEach((m) => {
        (m.material as THREEMeshStdMat).color.setHex(painHex(level));
      });
    });
  }, [painData]);

  // Show/hide fibro markers
  useEffect(() => {
    const s = sceneRef.current;
    if (!s) return;
    s.fibroMeshes.forEach((m) => { m.visible = fibromyalgiaMode; });
  }, [fibromyalgiaMode]);

  const initScene = useCallback(() => {
    const container = containerRef.current;
    if (!container || sceneRef.current) return;
    const THREE = (window as WindowWithTHREE).THREE;
    if (!THREE) return;
    const T: THREECtors = THREE;

    // ── Renderer ─────────────────────────────────────────────────────────────
    const renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    const w = container.clientWidth;
    const h = container.clientHeight;
    renderer.setSize(w, h);
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);

    // ── Camera ────────────────────────────────────────────────────────────────
    const camera = new T.PerspectiveCamera(40, w / h, 0.1, 100);
    camera.position.set(0, 0.55, 3.4);

    // ── Lights ────────────────────────────────────────────────────────────────
    const scene = new T.Scene();
    scene.add(new T.AmbientLight(0xfff0e8, 0.60));
    const key = new T.DirectionalLight(0xfff0e0, 1.15);
    key.position.set(0.8, 2.5, 2.0); scene.add(key);
    const fill = new T.DirectionalLight(0x9bb8d8, 0.38);
    fill.position.set(-2.5, 0.8, -1.0); scene.add(fill);
    const rim = new T.DirectionalLight(0xc0d8ff, 0.28);
    rim.position.set(0, -2.0, -3.0); scene.add(rim);

    // ── Material factory ──────────────────────────────────────────────────────
    function makeMat(hex: number): THREEMeshStdMat {
      return new T.MeshStandardMaterial({ color: hex, roughness: 0.72, metalness: 0.0 });
    }

    function makeGeo(def: SegDef): THREEGeo {
      if (def.geoType === "sphere")   return new T.SphereGeometry(def.geoArgs[0], def.geoArgs[1], def.geoArgs[2]);
      if (def.geoType === "cylinder") return new T.CylinderGeometry(def.geoArgs[0], def.geoArgs[1], def.geoArgs[2], def.geoArgs[3]);
      return new T.BoxGeometry(def.geoArgs[0], def.geoArgs[1], def.geoArgs[2]);
    }

    // ── Build segments ────────────────────────────────────────────────────────
    const segmentMeshes: THREEMesh[] = [];
    const zoneToMeshes = new Map<string, THREEMesh[]>();

    for (const def of SEGMENT_DEFS) {
      const level = painDataRef.current[def.id];
      const mesh  = new T.Mesh(makeGeo(def), makeMat(painHex(level)));
      mesh.position.set(...def.pos);
      if (def.rot)   { mesh.rotation.x = def.rot[0]; mesh.rotation.y = def.rot[1]; mesh.rotation.z = def.rot[2]; }
      if (def.scale) mesh.scale.set(def.scale[0], def.scale[1], def.scale[2]);
      mesh.userData["id"]   = def.id;
      mesh.userData["name"] = ZONE_NAMES[def.id] ?? def.id;
      segmentMeshes.push(mesh);
      const arr = zoneToMeshes.get(def.id) ?? [];
      arr.push(mesh);
      zoneToMeshes.set(def.id, arr);
    }

    // ── Fibro markers ─────────────────────────────────────────────────────────
    const fibroMeshes: THREEMesh[] = [];
    const fibroMat = new T.MeshStandardMaterial({ color: 0xa78bfa, roughness: 0.4, metalness: 0.0, emissive: 0x6d28d9, emissiveIntensity: 0.55 });
    for (const pt of FIBRO_POINTS) {
      const m = new T.Mesh(new T.SphereGeometry(0.032, 10, 10), fibroMat as unknown as THREEMeshStdMat);
      m.position.set(...pt.position);
      m.userData["id"] = pt.id; m.userData["name"] = pt.name; m.userData["fibro"] = true;
      m.visible = fibromyalgiaMode;
      fibroMeshes.push(m);
    }

    // ── Scene group ───────────────────────────────────────────────────────────
    const bodyGroup = new T.Group();
    segmentMeshes.forEach((m) => bodyGroup.add(m));
    fibroMeshes.forEach((m) => bodyGroup.add(m));
    const pivot = new T.Group();
    pivot.position.set(0, -0.5, 0);
    pivot.add(bodyGroup);
    scene.add(pivot);

    // ── Raycasting helpers ────────────────────────────────────────────────────
    const raycaster = new T.Raycaster();
    const pointer   = new T.Vector2();
    let hoveredMesh: THREEMesh | null = null;
    let hoveredOrigHex = SKIN_HEX;

    function getTargets() {
      return [...segmentMeshes, ...(fibromyalgiaMode ? fibroMeshes : [])];
    }

    function canvasXY(e: MouseEvent | Touch) {
      const r = renderer.domElement.getBoundingClientRect();
      return {
        nx: ((e.clientX - r.left) / r.width)  * 2 - 1,
        ny: -((e.clientY - r.top) / r.height) * 2 + 1,
        px: e.clientX - r.left,
        py: e.clientY - r.top,
        pw: r.width, ph: r.height,
      };
    }

    /** Project a 3D mesh center to 2D canvas pixel coordinates */
    function projectMesh(m: THREEMesh): { x: number; y: number } {
      const cam = camera as unknown as { matrixWorldInverse: unknown; projectionMatrix: unknown };
      // Use the mesh's world position
      const pos = m.position;
      // We need pivot's world transform — approximate: pivot.position + bodyGroup is at (0, -0.5, 0) + pivot rotation
      // For simplicity, we'll do it numerically
      const cosY = Math.cos(rotY), sinY = Math.sin(rotY);
      const cosX = Math.cos(rotX), sinX = Math.sin(rotX);

      // Apply pivot offset
      let px = pos.x, py = pos.y - 0.5, pz = pos.z;
      // Rotate Y
      const rx = px * cosY + pz * sinY;
      const rz = -px * sinY + pz * cosY;
      px = rx; pz = rz;
      // Rotate X
      const ry2 = py * cosX - pz * sinX;
      const rz2 = py * sinX + pz * cosX;
      py = ry2; pz = rz2;

      // Project with camera (simple perspective at z=3.4, fov~40)
      const fov = 40 * Math.PI / 180;
      const aspect = (container?.clientWidth ?? 1) / (container?.clientHeight ?? 1);
      const camZ = 3.4;
      const d = camZ - pz; // depth
      if (d <= 0) return { x: -9999, y: -9999 };
      const scale = (1 / Math.tan(fov / 2)) / d;
      const sx = ((px * scale) / aspect) * 0.5 + 0.5;
      const sy = ((-py * scale) * 0.5 + 0.5) + 0.04; // slight offset for camera Y
      const cw = container?.clientWidth ?? 1;
      const ch = container?.clientHeight ?? 1;
      return { x: sx * cw, y: sy * ch };
    }

    function showTip(id: string, name: string) {
      const lvl = painDataRef.current[id];
      const tt = tooltipRef.current, hi = hintRef.current;
      if (tt) { tt.textContent = lvl ? `${name} · Dolor ${lvl}/10` : name; tt.classList.remove("hidden"); }
      if (hi) hi.classList.add("hidden");
    }
    function hideTip() {
      const tt = tooltipRef.current, hi = hintRef.current;
      if (tt) tt.classList.add("hidden");
      if (hi) hi.classList.remove("hidden");
    }

    function restoreHovered() {
      if (!hoveredMesh) return;
      const id  = hoveredMesh.userData["id"] as string;
      const lvl = painDataRef.current[id];
      (hoveredMesh.material as THREEMeshStdMat).color.setHex(painHex(lvl));
      hoveredMesh.scale.setScalar(1);
      hoveredMesh = null;
    }

    function updateHover(nx: number, ny: number) {
      if (toolRef.current === "area") return; // no hover in area mode
      pointer.set(nx, ny);
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(getTargets());
      const hit  = hits[0]?.object as THREEMesh | undefined;
      if (hoveredMesh && hoveredMesh !== hit) { restoreHovered(); }
      if (hit) {
        if (hoveredMesh !== hit) {
          hoveredOrigHex = painHex(painDataRef.current[hit.userData["id"] as string]);
          (hit.material as THREEMeshStdMat).color.setHex(HOVER_HEX);
          hit.scale.setScalar(1.07);
        }
        renderer.domElement.style.cursor = "pointer";
        showTip(hit.userData["id"] as string, hit.userData["name"] as string);
      } else {
        renderer.domElement.style.cursor = "grab"; // updateHover returns early when tool==="area"
        hideTip();
      }
      hoveredMesh = hit ?? null;
    }

    // ── Interaction state ─────────────────────────────────────────────────────
    let isDragging   = false;
    let isAreaBrush  = false;
    let prevX = 0, prevY = 0;
    let dragStartX = 0, dragStartY = 0;
    let areaCX = 0, areaCY = 0; // area brush center (canvas px)
    let rotY = 0, rotX = 0;
    const ROT_X_MIN = -Math.PI / 6, ROT_X_MAX = Math.PI / 3;

    function onMouseDown(e: MouseEvent) {
      const { nx, ny, px, py } = canvasXY(e);
      isDragging = true;
      prevX = dragStartX = e.clientX;
      prevY = dragStartY = e.clientY;

      if (toolRef.current === "area" && !readOnly) {
        // Start area brush — check if there's a hit to start from
        pointer.set(nx, ny);
        raycaster.setFromCamera(pointer, camera);
        const hits = raycaster.intersectObjects(getTargets());
        if (hits.length > 0) {
          isAreaBrush = true;
          areaCX = px; areaCY = py;
          const b = { x: px, y: py, r: 0 };
          brushRef.current = b;
          setBrush({ ...b });
        }
      } else {
        renderer.domElement.style.cursor = "grabbing";
      }
    }

    function onMouseMove(e: MouseEvent) {
      const { nx, ny, px, py } = canvasXY(e);

      if (isDragging && isAreaBrush) {
        // Update brush circle
        const dx = px - areaCX, dy = py - areaCY;
        const r  = Math.sqrt(dx * dx + dy * dy);
        const b  = { x: areaCX, y: areaCY, r };
        brushRef.current = b;
        setBrush({ ...b });
        return;
      }

      if (isDragging && toolRef.current === "pin") {
        rotY += (e.clientX - prevX) * 0.008;
        rotX += (e.clientY - prevY) * 0.008;
        rotX  = Math.max(ROT_X_MIN, Math.min(ROT_X_MAX, rotX));
      } else if (!isDragging) {
        updateHover(nx, ny);
      }
      prevX = e.clientX; prevY = e.clientY;
    }

    function onMouseUp(e: MouseEvent) {
      const dx = Math.abs(e.clientX - dragStartX);
      const dy = Math.abs(e.clientY - dragStartY);

      if (isAreaBrush && brushRef.current) {
        // Find zones within the brush circle
        const b = brushRef.current;
        const selected = new Set<string>();
        for (const m of segmentMeshes) {
          const { x, y } = projectMesh(m);
          const dist = Math.sqrt((x - b.x) ** 2 + (y - b.y) ** 2);
          if (dist <= b.r) selected.add(m.userData["id"] as string);
        }
        if (selected.size > 0 && !readOnly) {
          onMultiZoneSelectRef.current?.([...selected]);
        }
        brushRef.current = null;
        setBrush(null);
        isAreaBrush = false;
      } else if (isDragging && dx < 6 && dy < 6 && toolRef.current === "pin" && !readOnly) {
        // Pin click
        const { nx, ny } = canvasXY(e);
        pointer.set(nx, ny);
        raycaster.setFromCamera(pointer, camera);
        const hits = raycaster.intersectObjects(getTargets());
        if (hits[0]) {
          onZoneSelectRef.current?.((hits[0].object as THREEMesh).userData["id"] as string);
        }
      }

      isDragging = false;
      renderer.domElement.style.cursor = toolRef.current === "area" ? "crosshair" : "grab";
    }

    // ── Touch events ──────────────────────────────────────────────────────────
    let touchStartX = 0, touchStartY = 0;
    function onTouchStart(e: TouchEvent) {
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      const { nx, ny, px, py } = canvasXY(t);
      isDragging = true;
      prevX = touchStartX = t.clientX;
      prevY = touchStartY = t.clientY;
      if (toolRef.current === "area" && !readOnly) {
        pointer.set(nx, ny);
        raycaster.setFromCamera(pointer, camera);
        if (raycaster.intersectObjects(getTargets()).length > 0) {
          isAreaBrush = true; areaCX = px; areaCY = py;
          const b = { x: px, y: py, r: 0 };
          brushRef.current = b; setBrush({ ...b });
        }
      }
    }
    function onTouchMove(e: TouchEvent) {
      if (!isDragging || e.touches.length !== 1) return;
      e.preventDefault();
      const t = e.touches[0];
      const { px, py } = canvasXY(t);
      if (isAreaBrush) {
        const dx = px - areaCX, dy = py - areaCY;
        const r = Math.sqrt(dx * dx + dy * dy);
        const b = { x: areaCX, y: areaCY, r };
        brushRef.current = b; setBrush({ ...b });
        return;
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
        for (const m of segmentMeshes) {
          const { x, y } = projectMesh(m);
          if (Math.sqrt((x - b.x) ** 2 + (y - b.y) ** 2) <= b.r) selected.add(m.userData["id"] as string);
        }
        if (selected.size > 0 && !readOnly) onMultiZoneSelectRef.current?.([...selected]);
        brushRef.current = null; setBrush(null); isAreaBrush = false;
      } else if (dx < 10 && dy < 10 && toolRef.current === "pin" && !readOnly) {
        const { nx, ny } = canvasXY(t);
        pointer.set(nx, ny); raycaster.setFromCamera(pointer, camera);
        const hits = raycaster.intersectObjects(getTargets());
        if (hits[0]) onZoneSelectRef.current?.((hits[0].object as THREEMesh).userData["id"] as string);
      }
      isDragging = false;
    }

    const el = renderer.domElement;
    el.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
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
      if (!isDragging && toolRef.current === "pin") rotY += 0.0035;
      if (fibromyalgiaMode) {
        fibroMeshes.forEach((m, i) => {
          if (!m.visible) return;
          m.scale.setScalar(1 + 0.20 * Math.sin(time * 1.5 + i * 0.55));
        });
      }
      zoneToMeshes.forEach((meshes, id) => {
        const lvl = painDataRef.current[id];
        if (!lvl || lvl <= 0) return;
        meshes.forEach((m) => {
          if (m === hoveredMesh) return;
          const pulse = 1 + 0.038 * Math.sin(time * (0.7 + lvl * 0.05) + id.charCodeAt(0) * 0.4);
          m.scale.setScalar(pulse);
        });
      });
      pivot.rotation.y = rotY;
      pivot.rotation.x = rotX;
      renderer.render(scene, camera);
    }
    animate();

    sceneRef.current = {
      renderer, scene, camera, pivot, zoneToMeshes, fibroMeshes, rafId, ro,
      cleanup() {
        cancelAnimationFrame(rafId); ro.disconnect();
        el.removeEventListener("mousedown", onMouseDown);
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
        el.removeEventListener("touchstart", onTouchStart);
        el.removeEventListener("touchmove", onTouchMove);
        el.removeEventListener("touchend", onTouchEnd);
        renderer.dispose();
        if (container.contains(el)) container.removeChild(el);
      },
    };
  }, [fibromyalgiaMode, readOnly]);

  useEffect(() => {
    function tryInit() {
      if ((window as WindowWithTHREE).THREE) { initScene(); return; }
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";
      s.onload = () => initScene();
      document.head.appendChild(s);
    }
    tryInit();
    return () => { sceneRef.current?.cleanup(); sceneRef.current = null; };
  }, [initScene]);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col items-center gap-2 select-none w-full">

      {/* ── Selector tool bar ─────────────────────────────────────────────── */}
      {!readOnly && (
        <div className="flex items-center gap-1 rounded-full border border-slate-700 bg-slate-900/80 p-1">
          {/* Pin / needle tool */}
          <button
            onClick={() => setTool("pin")}
            title="Zona puntual"
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${
              tool === "pin"
                ? "bg-sky-500 text-white shadow-md shadow-sky-500/30"
                : "text-slate-400 hover:text-white"
            }`}
          >
            {/* Pin icon */}
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="17" x2="12" y2="22" />
              <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />
            </svg>
            Puntual
          </button>

          {/* Area brush tool */}
          <button
            onClick={() => setTool("area")}
            title="Área de dolor"
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${
              tool === "area"
                ? "bg-violet-500 text-white shadow-md shadow-violet-500/30"
                : "text-slate-400 hover:text-white"
            }`}
          >
            {/* Circle/area icon */}
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <circle cx="12" cy="12" r="9" strokeDasharray="4 2" />
              <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
            </svg>
            Área
          </button>
        </div>
      )}

      {/* ── Hint text / tooltip ───────────────────────────────────────────── */}
      <div className="h-6 flex items-center justify-center">
        <span ref={tooltipRef}
          className="text-sm font-medium text-white bg-slate-900 border border-slate-600 px-3 py-0.5 rounded-full hidden" />
        <span ref={hintRef} className="text-xs text-slate-500">
          {readOnly
            ? "Vista 3D · arrastra para rotar"
            : tool === "pin"
              ? "Toca una zona exacta · arrastra para rotar"
              : "Mantén y arrastra para seleccionar un área de dolor"}
        </span>
      </div>

      {/* ── Canvas + area brush overlay ───────────────────────────────────── */}
      <div ref={canvasWrapRef} className="relative w-full rounded-xl overflow-hidden"
        style={{ height: "clamp(340px, 55vw, 440px)" }}>
        {/* Three.js canvas */}
        <div ref={containerRef} className="absolute inset-0" />

        {/* Area brush SVG overlay */}
        {brush && (
          <svg className="pointer-events-none absolute inset-0 w-full h-full">
            <circle
              cx={brush.x} cy={brush.y} r={brush.r}
              fill={`rgba(167,139,250,0.12)`}
              stroke="#a78bfa"
              strokeWidth="2"
              strokeDasharray="6 3"
            />
            <circle cx={brush.x} cy={brush.y} r="4" fill="#a78bfa" />
          </svg>
        )}
      </div>

      {/* Fibro legend */}
      {fibromyalgiaMode && (
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span className="w-2.5 h-2.5 rounded-full bg-violet-400 inline-block" />
          18 puntos de gatillo fibromialgia activos
        </div>
      )}

      {/* Pain scale */}
      <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs text-slate-500">
        {[
          { c: "#c8956a", l: "Sin dolor" },
          { c: "#4ade80", l: "Leve 1–3" },
          { c: "#fbbf24", l: "Mod. 4–6" },
          { c: "#f97316", l: "Intenso 7–9" },
          { c: "#ef4444", l: "Severo 10" },
        ].map(({ c, l }) => (
          <span key={l} className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: c }} />
            {l}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Three.js type shims ──────────────────────────────────────────────────────

interface THREEColor       { setHex(h: number): void }
interface THREEVec2        { set(x: number, y: number): void }
interface THREEVec3        { x: number; y: number; z: number; set(x: number, y: number, z: number): void }
interface THREEGeo         { dispose(): void }
interface THREEMeshStdMat  {
  color: THREEColor; roughness: number; metalness: number;
  emissive?: THREEColor; emissiveIntensity?: number; dispose(): void;
}
interface THREEObj3D {
  position: THREEVec3;
  rotation: { x: number; y: number; z: number };
  scale: { set(x: number, y: number, z: number): void; setScalar(s: number): void };
  add(o: THREEObj3D): void; remove(o: THREEObj3D): void;
  visible: boolean; type: string;
  userData: Record<string, unknown>;
  children: THREEObj3D[];
}
interface THREEMesh extends THREEObj3D { material: THREEMeshStdMat }
interface THREEScene  extends THREEObj3D {}
interface THREEGroup  extends THREEObj3D {}
interface THREECamera { aspect?: number; updateProjectionMatrix?(): void }
interface THREERenderer {
  domElement: HTMLCanvasElement;
  setPixelRatio(r: number): void; setSize(w: number, h: number): void;
  setClearColor(c: number, a: number): void;
  render(s: THREEScene, c: THREECamera): void; dispose(): void;
}
interface THREECaster {
  setFromCamera(p: THREEVec2, c: THREECamera): void;
  intersectObjects(o: THREEMesh[]): Array<{ object: THREEObj3D }>;
}
interface THREECtors {
  WebGLRenderer: new (o: { antialias: boolean; alpha: boolean }) => THREERenderer;
  PerspectiveCamera: new (fov: number, asp: number, n: number, f: number) => THREECamera & { position: THREEVec3 };
  Scene: new () => THREEScene; Group: new () => THREEGroup;
  AmbientLight: new (c: number, i: number) => THREEObj3D;
  DirectionalLight: new (c: number, i: number) => THREEObj3D & { position: THREEVec3 };
  Mesh: new (g: THREEGeo, m: THREEMeshStdMat) => THREEMesh;
  MeshStandardMaterial: new (o: { color?: number; roughness?: number; metalness?: number; emissive?: number; emissiveIntensity?: number }) => THREEMeshStdMat;
  SphereGeometry:   new (r: number, w: number, h: number) => THREEGeo;
  CylinderGeometry: new (rt: number, rb: number, h: number, s: number) => THREEGeo;
  BoxGeometry:      new (w: number, h: number, d: number) => THREEGeo;
  Vector2: new () => THREEVec2;
  Raycaster: new () => THREECaster;
}
interface WindowWithTHREE { THREE?: THREECtors }
interface SceneState {
  renderer: THREERenderer; scene: THREEScene; camera: THREECamera; pivot: THREEGroup;
  zoneToMeshes: Map<string, THREEMesh[]>; fibroMeshes: THREEMesh[];
  rafId: number; ro: ResizeObserver; cleanup(): void;
}
