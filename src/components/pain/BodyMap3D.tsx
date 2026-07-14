"use client";
// Copyright © 2026 Browns Studio

import React, { useRef, useEffect, useCallback } from "react";

// ─── Props ────────────────────────────────────────────────────────────────────

export interface BodyMap3DProps {
  painData: Record<string, number>;
  fibromyalgiaMode?: boolean;
  readOnly?: boolean;
  onZoneSelect?: (zoneId: string) => void;
}

// ─── Zone names ───────────────────────────────────────────────────────────────

const ZONE_NAMES: Record<string, string> = {
  head: "Cabeza",
  jaw: "Mandíbula",
  ear_l: "Oreja Izq.",
  ear_r: "Oreja Der.",
  neck: "Cuello",
  shoulder_l: "Hombro Izq.",
  shoulder_r: "Hombro Der.",
  chest: "Pecho",
  abdomen: "Abdomen",
  back_upper: "Espalda Alta",
  back_lower: "Espalda Baja",
  hip_l: "Cadera Izq.",
  hip_r: "Cadera Der.",
  arm_l: "Brazo Izq.",
  arm_r: "Brazo Der.",
  forearm_l: "Antebrazo Izq.",
  forearm_r: "Antebrazo Der.",
  wrist_l: "Muñeca Izq.",
  wrist_r: "Muñeca Der.",
  hand_l: "Mano Izq.",
  hand_r: "Mano Der.",
  leg_l: "Pierna Izq.",
  leg_r: "Pierna Der.",
  knee_l: "Rodilla Izq.",
  knee_r: "Rodilla Der.",
  foot_l: "Pie Izq.",
  foot_r: "Pie Der.",
};

// ─── Segment definitions ──────────────────────────────────────────────────────
// Each entry defines one Three.js mesh that IS a clickable body zone.
// Multiple entries can share the same id (e.g., thigh + shin both = "leg_l").

type GeoType = "sphere" | "cylinder" | "box";

interface SegDef {
  id: string;
  geoType: GeoType;
  geoArgs: number[];                    // sphere:[r,w,h] cylinder:[rt,rb,h,s] box:[w,h,d]
  pos: [number, number, number];
  rot?: [number, number, number];       // rx, ry, rz in radians
  scale?: [number, number, number];
}

const SEGMENT_DEFS: SegDef[] = [
  // ── Head region ──────────────────────────────────────────────────────────
  { id: "head",       geoType: "sphere",   geoArgs: [0.13, 22, 22],        pos: [0, 1.57, 0.005],  scale: [1, 1.14, 1] },
  { id: "jaw",        geoType: "sphere",   geoArgs: [0.11, 16, 16],        pos: [0, 1.39, 0.045],  scale: [0.85, 0.48, 0.80] },
  { id: "ear_l",      geoType: "sphere",   geoArgs: [0.038, 12, 12],       pos: [-0.137, 1.56, 0], scale: [0.38, 0.74, 0.30] },
  { id: "ear_r",      geoType: "sphere",   geoArgs: [0.038, 12, 12],       pos: [ 0.137, 1.56, 0], scale: [0.38, 0.74, 0.30] },
  // ── Neck ─────────────────────────────────────────────────────────────────
  { id: "neck",       geoType: "cylinder", geoArgs: [0.054, 0.068, 0.14, 14], pos: [0, 1.34, 0] },
  // ── Torso ────────────────────────────────────────────────────────────────
  { id: "chest",      geoType: "cylinder", geoArgs: [0.200, 0.172, 0.27, 20], pos: [0, 1.10, 0.006] },
  { id: "abdomen",    geoType: "cylinder", geoArgs: [0.162, 0.178, 0.22, 20], pos: [0, 0.83, 0.006] },
  // Back (z offset negative — visible when body rotated ~180°)
  { id: "back_upper", geoType: "cylinder", geoArgs: [0.200, 0.172, 0.27, 20], pos: [0, 1.10, -0.006] },
  { id: "back_lower", geoType: "cylinder", geoArgs: [0.162, 0.178, 0.22, 20], pos: [0, 0.83, -0.006] },
  // ── Pelvis/hips ───────────────────────────────────────────────────────────
  { id: "hip_l",      geoType: "sphere",   geoArgs: [0.092, 14, 14],       pos: [-0.132, 0.57, 0] },
  { id: "hip_r",      geoType: "sphere",   geoArgs: [0.092, 14, 14],       pos: [ 0.132, 0.57, 0] },
  // ── Shoulders ─────────────────────────────────────────────────────────────
  { id: "shoulder_l", geoType: "sphere",   geoArgs: [0.096, 16, 16],       pos: [-0.275, 1.22, 0] },
  { id: "shoulder_r", geoType: "sphere",   geoArgs: [0.096, 16, 16],       pos: [ 0.275, 1.22, 0] },
  // ── Upper arms ───────────────────────────────────────────────────────────
  { id: "arm_l",      geoType: "cylinder", geoArgs: [0.066, 0.055, 0.29, 14], pos: [-0.390, 0.970, 0], rot: [0, 0,  0.30] },
  { id: "arm_r",      geoType: "cylinder", geoArgs: [0.066, 0.055, 0.29, 14], pos: [ 0.390, 0.970, 0], rot: [0, 0, -0.30] },
  // ── Elbows (connector joints) — share arm zone ────────────────────────────
  { id: "arm_l",      geoType: "sphere",   geoArgs: [0.060, 12, 12],       pos: [-0.446, 0.820, 0] },
  { id: "arm_r",      geoType: "sphere",   geoArgs: [0.060, 12, 12],       pos: [ 0.446, 0.820, 0] },
  // ── Forearms ─────────────────────────────────────────────────────────────
  { id: "forearm_l",  geoType: "cylinder", geoArgs: [0.053, 0.042, 0.25, 14], pos: [-0.454, 0.695, 0], rot: [0, 0,  0.10] },
  { id: "forearm_r",  geoType: "cylinder", geoArgs: [0.053, 0.042, 0.25, 14], pos: [ 0.454, 0.695, 0], rot: [0, 0, -0.10] },
  // ── Wrists ───────────────────────────────────────────────────────────────
  { id: "wrist_l",    geoType: "sphere",   geoArgs: [0.046, 12, 12],       pos: [-0.462, 0.558, 0] },
  { id: "wrist_r",    geoType: "sphere",   geoArgs: [0.046, 12, 12],       pos: [ 0.462, 0.558, 0] },
  // ── Hands ────────────────────────────────────────────────────────────────
  { id: "hand_l",     geoType: "sphere",   geoArgs: [0.072, 14, 14],       pos: [-0.458, 0.466, 0], scale: [1.0, 0.65, 1.15] },
  { id: "hand_r",     geoType: "sphere",   geoArgs: [0.072, 14, 14],       pos: [ 0.458, 0.466, 0], scale: [1.0, 0.65, 1.15] },
  // ── Thighs ───────────────────────────────────────────────────────────────
  { id: "leg_l",      geoType: "cylinder", geoArgs: [0.092, 0.080, 0.32, 14], pos: [-0.128, 0.275, 0] },
  { id: "leg_r",      geoType: "cylinder", geoArgs: [0.092, 0.080, 0.32, 14], pos: [ 0.128, 0.275, 0] },
  // ── Knees ─────────────────────────────────────────────────────────────────
  { id: "knee_l",     geoType: "sphere",   geoArgs: [0.082, 14, 14],       pos: [-0.128, 0.048, 0.048], scale: [1, 0.88, 1] },
  { id: "knee_r",     geoType: "sphere",   geoArgs: [0.082, 14, 14],       pos: [ 0.128, 0.048, 0.048], scale: [1, 0.88, 1] },
  // ── Shins (reuse leg_l / leg_r) ──────────────────────────────────────────
  { id: "leg_l",      geoType: "cylinder", geoArgs: [0.072, 0.058, 0.28, 14], pos: [-0.128, -0.220, 0] },
  { id: "leg_r",      geoType: "cylinder", geoArgs: [0.072, 0.058, 0.28, 14], pos: [ 0.128, -0.220, 0] },
  // ── Feet ─────────────────────────────────────────────────────────────────
  { id: "foot_l",     geoType: "box",      geoArgs: [0.094, 0.066, 0.19],  pos: [-0.128, -0.420, 0.062] },
  { id: "foot_r",     geoType: "box",      geoArgs: [0.094, 0.066, 0.19],  pos: [ 0.128, -0.420, 0.062] },
];

// ─── Fibromyalgia tender points ───────────────────────────────────────────────

interface FibroPoint {
  id: string;
  name: string;
  position: [number, number, number];
}

const FIBRO_POINTS: FibroPoint[] = [
  { id: "fibro_occiput_l",      name: "Occipucio Izq.",       position: [-0.07, 1.66, -0.10] },
  { id: "fibro_occiput_r",      name: "Occipucio Der.",       position: [ 0.07, 1.66, -0.10] },
  { id: "fibro_cervical_l",     name: "Cervical Bajo Izq.",   position: [-0.05, 1.30, -0.08] },
  { id: "fibro_cervical_r",     name: "Cervical Bajo Der.",   position: [ 0.05, 1.30, -0.08] },
  { id: "fibro_trapezius_l",    name: "Trapecio Izq.",        position: [-0.20, 1.20, -0.05] },
  { id: "fibro_trapezius_r",    name: "Trapecio Der.",        position: [ 0.20, 1.20, -0.05] },
  { id: "fibro_supraspinous_l", name: "Supraespinoso Izq.",   position: [-0.22, 1.08, -0.14] },
  { id: "fibro_supraspinous_r", name: "Supraespinoso Der.",   position: [ 0.22, 1.08, -0.14] },
  { id: "fibro_rib2_l",         name: "2ª Costilla Izq.",     position: [-0.10, 1.08,  0.14] },
  { id: "fibro_rib2_r",         name: "2ª Costilla Der.",     position: [ 0.10, 1.08,  0.14] },
  { id: "fibro_epicondyle_l",   name: "Epicóndilo Izq.",      position: [-0.38, 0.82,  0.06] },
  { id: "fibro_epicondyle_r",   name: "Epicóndilo Der.",      position: [ 0.38, 0.82,  0.06] },
  { id: "fibro_gluteal_l",      name: "Glúteo Izq.",          position: [-0.15, 0.54, -0.18] },
  { id: "fibro_gluteal_r",      name: "Glúteo Der.",          position: [ 0.15, 0.54, -0.18] },
  { id: "fibro_trochanter_l",   name: "Trocánter Izq.",       position: [-0.22, 0.44, -0.10] },
  { id: "fibro_trochanter_r",   name: "Trocánter Der.",       position: [ 0.22, 0.44, -0.10] },
  { id: "fibro_knee_l",         name: "Rodilla (medial) Izq.",position: [-0.07, 0.00,  0.10] },
  { id: "fibro_knee_r",         name: "Rodilla (medial) Der.",position: [ 0.07, 0.00,  0.10] },
];

// ─── Color helpers ────────────────────────────────────────────────────────────

const SKIN_HEX  = 0xc5956a;
const HOVER_HEX = 0xbae6fd;

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
}: BodyMap3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef   = useRef<HTMLSpanElement>(null);
  const hintRef      = useRef<HTMLSpanElement>(null);
  const sceneRef     = useRef<SceneState | null>(null);

  const onZoneSelectRef = useRef(onZoneSelect);
  useEffect(() => { onZoneSelectRef.current = onZoneSelect; }, [onZoneSelect]);

  const painDataRef = useRef(painData);
  useEffect(() => { painDataRef.current = painData; }, [painData]);

  // Update segment colors when painData changes (no reinit needed)
  useEffect(() => {
    const s = sceneRef.current;
    if (!s) return;
    s.zoneToMeshes.forEach((meshes, id) => {
      const level = painData[id];
      meshes.forEach((m) => {
        (m.material as THREEMeshStdMaterial).color.setHex(painHex(level));
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
    const T: THREEConstructors = THREE;

    // ── Renderer ────────────────────────────────────────────────────────────
    const renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    const w = container.clientWidth;
    const h = container.clientHeight;
    renderer.setSize(w, h);
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);

    // ── Camera ──────────────────────────────────────────────────────────────
    const camera = new T.PerspectiveCamera(42, w / h, 0.1, 100);
    camera.position.set(0, 0.55, 3.2);

    // ── Scene + lights ───────────────────────────────────────────────────────
    const scene = new T.Scene();
    const ambient = new T.AmbientLight(0xffeedd, 0.55);
    scene.add(ambient);
    const keyLight = new T.DirectionalLight(0xfff0e0, 1.10);
    keyLight.position.set(0.6, 2.2, 1.8);
    scene.add(keyLight);
    const fillLight = new T.DirectionalLight(0x9bb8d8, 0.35);
    fillLight.position.set(-2, 0.6, -1);
    scene.add(fillLight);
    const rimLight = new T.DirectionalLight(0xaaccff, 0.25);
    rimLight.position.set(0, -1.5, -2.5);
    scene.add(rimLight);

    // ── Helpers ─────────────────────────────────────────────────────────────
    function makeMat(hex: number): THREEMeshStdMaterial {
      return new T.MeshStandardMaterial({
        color: hex,
        roughness: 0.74,
        metalness: 0.0,
      });
    }

    function makeGeo(def: SegDef): THREEBufferGeometry {
      switch (def.geoType) {
        case "sphere":   return new T.SphereGeometry  (def.geoArgs[0], def.geoArgs[1], def.geoArgs[2]);
        case "cylinder": return new T.CylinderGeometry(def.geoArgs[0], def.geoArgs[1], def.geoArgs[2], def.geoArgs[3]);
        case "box":      return new T.BoxGeometry     (def.geoArgs[0], def.geoArgs[1], def.geoArgs[2]);
      }
    }

    // ── Build body segments ──────────────────────────────────────────────────
    const segmentMeshes: THREEMesh[] = [];               // all meshes for raycasting
    const zoneToMeshes = new Map<string, THREEMesh[]>(); // zone id → [meshes]

    for (const def of SEGMENT_DEFS) {
      const level = painDataRef.current[def.id];
      const mat   = makeMat(painHex(level));
      const mesh  = new T.Mesh(makeGeo(def), mat);
      mesh.position.set(...def.pos);
      if (def.rot) { mesh.rotation.x = def.rot[0]; mesh.rotation.y = def.rot[1]; mesh.rotation.z = def.rot[2]; }
      if (def.scale) mesh.scale.set(def.scale[0], def.scale[1], def.scale[2]);
      mesh.userData["id"]   = def.id;
      mesh.userData["name"] = ZONE_NAMES[def.id] ?? def.id;
      segmentMeshes.push(mesh);
      const arr = zoneToMeshes.get(def.id) ?? [];
      arr.push(mesh);
      zoneToMeshes.set(def.id, arr);
    }

    // ── Fibromyalgia tender point markers (small glowing dots) ──────────────
    const fibroMeshes: THREEMesh[] = [];
    for (const pt of FIBRO_POINTS) {
      const mat  = new T.MeshStandardMaterial({ color: 0xa78bfa, roughness: 0.4, metalness: 0.1, emissive: 0x6d28d9, emissiveIntensity: 0.5 });
      const mesh = new T.Mesh(new T.SphereGeometry(0.030, 10, 10), mat as unknown as THREEMeshStdMaterial);
      mesh.position.set(...pt.position);
      mesh.userData["id"]     = pt.id;
      mesh.userData["name"]   = pt.name;
      mesh.userData["fibro"]  = true;
      mesh.visible = fibromyalgiaMode;
      fibroMeshes.push(mesh);
    }

    // ── Body group ───────────────────────────────────────────────────────────
    const bodyGroup = new T.Group();
    segmentMeshes.forEach((m) => bodyGroup.add(m));
    fibroMeshes.forEach((m) => bodyGroup.add(m));

    const pivot = new T.Group();
    pivot.position.set(0, -0.5, 0);
    pivot.add(bodyGroup);
    scene.add(pivot);

    // ── Interaction state ────────────────────────────────────────────────────
    const raycaster = new T.Raycaster();
    const pointer   = new T.Vector2();
    let hoveredMesh: THREEMesh | null = null;
    let hoveredOrigHex = SKIN_HEX;

    let isDragging = false;
    let prevX = 0, prevY = 0;
    let dragStartX = 0, dragStartY = 0;
    let rotY = 0, rotX = 0;
    const ROT_X_MIN = -Math.PI / 6;
    const ROT_X_MAX =  Math.PI / 3;

    function getCanvasXY(e: MouseEvent | Touch) {
      const r = renderer.domElement.getBoundingClientRect();
      return {
        x: ((e.clientX - r.left) / r.width)  * 2 - 1,
        y: -((e.clientY - r.top) / r.height) * 2 + 1,
      };
    }

    function showTooltip(id: string, name: string) {
      const lvl = painDataRef.current[id];
      const tt = tooltipRef.current;
      const hint = hintRef.current;
      if (tt) {
        tt.textContent = lvl ? `${name} · Dolor ${lvl}/10` : name;
        tt.classList.remove("hidden");
      }
      if (hint) hint.classList.add("hidden");
    }

    function hideTooltip() {
      const tt = tooltipRef.current;
      const hint = hintRef.current;
      if (tt) tt.classList.add("hidden");
      if (hint) hint.classList.remove("hidden");
    }

    function updateHover(x: number, y: number) {
      pointer.set(x, y);
      raycaster.setFromCamera(pointer, camera);

      // Ray against segments + fibro markers
      const targets = [...segmentMeshes, ...(fibromyalgiaMode ? fibroMeshes : [])];
      const hits = raycaster.intersectObjects(targets);
      const hit  = hits[0]?.object as THREEMesh | undefined;

      if (hoveredMesh && hoveredMesh !== hit) {
        // Restore original color
        (hoveredMesh.material as THREEMeshStdMaterial).color.setHex(hoveredOrigHex);
        hoveredMesh.scale.setScalar(1);
      }

      if (hit) {
        const id  = hit.userData["id"] as string;
        const lvl = painDataRef.current[id];
        if (hoveredMesh !== hit) {
          hoveredOrigHex = painHex(lvl);
          (hit.material as THREEMeshStdMaterial).color.setHex(HOVER_HEX);
          hit.scale.setScalar(1.06);
        }
        renderer.domElement.style.cursor = "pointer";
        showTooltip(id, hit.userData["name"] as string);
      } else {
        renderer.domElement.style.cursor = "grab";
        hideTooltip();
      }
      hoveredMesh = hit ?? null;
    }

    // ── Mouse events ─────────────────────────────────────────────────────────
    function onMouseDown(e: MouseEvent) {
      isDragging = true;
      prevX = dragStartX = e.clientX;
      prevY = dragStartY = e.clientY;
      renderer.domElement.style.cursor = "grabbing";
    }
    function onMouseMove(e: MouseEvent) {
      if (isDragging) {
        rotY += (e.clientX - prevX) * 0.008;
        rotX += (e.clientY - prevY) * 0.008;
        rotX  = Math.max(ROT_X_MIN, Math.min(ROT_X_MAX, rotX));
        prevX = e.clientX;
        prevY = e.clientY;
      } else {
        updateHover(getCanvasXY(e).x, getCanvasXY(e).y);
      }
    }
    function onMouseUp(e: MouseEvent) {
      const dx = Math.abs(e.clientX - dragStartX);
      const dy = Math.abs(e.clientY - dragStartY);
      if (isDragging && dx < 6 && dy < 6 && !readOnly) {
        const { x, y } = getCanvasXY(e);
        pointer.set(x, y);
        raycaster.setFromCamera(pointer, camera);
        const targets = [...segmentMeshes, ...(fibromyalgiaMode ? fibroMeshes : [])];
        const hits = raycaster.intersectObjects(targets);
        if (hits[0]) {
          onZoneSelectRef.current?.((hits[0].object as THREEMesh).userData["id"] as string);
        }
      }
      isDragging = false;
      renderer.domElement.style.cursor = "grab";
    }

    // ── Touch events ─────────────────────────────────────────────────────────
    let touchStartX = 0, touchStartY = 0;
    function onTouchStart(e: TouchEvent) {
      if (e.touches.length === 1) {
        isDragging = true;
        prevX = touchStartX = e.touches[0].clientX;
        prevY = touchStartY = e.touches[0].clientY;
      }
    }
    function onTouchMove(e: TouchEvent) {
      if (!isDragging || e.touches.length !== 1) return;
      e.preventDefault();
      rotY += (e.touches[0].clientX - prevX) * 0.010;
      rotX += (e.touches[0].clientY - prevY) * 0.010;
      rotX  = Math.max(ROT_X_MIN, Math.min(ROT_X_MAX, rotX));
      prevX = e.touches[0].clientX;
      prevY = e.touches[0].clientY;
    }
    function onTouchEnd(e: TouchEvent) {
      const t = e.changedTouches[0];
      const dx = Math.abs(t.clientX - touchStartX);
      const dy = Math.abs(t.clientY - touchStartY);
      if (dx < 8 && dy < 8 && !readOnly) {
        const { x, y } = getCanvasXY(t);
        pointer.set(x, y);
        raycaster.setFromCamera(pointer, camera);
        const targets = [...segmentMeshes, ...(fibromyalgiaMode ? fibroMeshes : [])];
        const hits = raycaster.intersectObjects(targets);
        if (hits[0]) {
          onZoneSelectRef.current?.((hits[0].object as THREEMesh).userData["id"] as string);
        }
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
      const cw = container.clientWidth;
      const ch = container.clientHeight;
      renderer.setSize(cw, ch);
      (camera as unknown as { aspect: number; updateProjectionMatrix(): void }).aspect = cw / ch;
      (camera as unknown as { updateProjectionMatrix(): void }).updateProjectionMatrix();
    });
    ro.observe(container);

    // ── Render loop ───────────────────────────────────────────────────────────
    let rafId = 0;
    let time  = 0;

    function animate() {
      rafId = requestAnimationFrame(animate);
      time += 0.020;

      // Gentle idle rotation
      if (!isDragging) rotY += 0.0035;

      // Pulse fibro markers
      if (fibromyalgiaMode) {
        fibroMeshes.forEach((m, i) => {
          if (!m.visible) return;
          const s = 1 + 0.22 * Math.sin(time * 1.4 + i * 0.55);
          m.scale.setScalar(s);
        });
      }

      // Pulse painful segments (skip hovered so color isn't overwritten)
      zoneToMeshes.forEach((meshes, id) => {
        const lvl = painDataRef.current[id];
        if (!lvl || lvl <= 0) return;
        meshes.forEach((m) => {
          if (m === hoveredMesh) return;
          const speed = 0.7 + lvl * 0.05;
          const pulse = 1 + 0.04 * Math.sin(time * speed + id.charCodeAt(0) * 0.4);
          m.scale.setScalar(pulse);
        });
      });

      pivot.rotation.y = rotY;
      pivot.rotation.x = rotX;
      renderer.render(scene, camera);
    }
    animate();

    // ── Save state ref ────────────────────────────────────────────────────────
    sceneRef.current = {
      renderer, scene, camera, pivot,
      zoneToMeshes, fibroMeshes,
      rafId, ro,
      cleanup() {
        cancelAnimationFrame(rafId);
        ro.disconnect();
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

  return (
    <div className="flex flex-col items-center gap-2 select-none w-full">
      {/* Tooltip / hint */}
      <div className="h-7 flex items-center justify-center">
        <span
          ref={tooltipRef}
          className="text-sm font-medium text-white bg-slate-900 border border-slate-600 px-3 py-1 rounded-full hidden"
        />
        <span ref={hintRef} className="text-xs text-slate-500">
          {readOnly ? "Rotación libre · vista 3D" : "Arrastra para rotar · toca para registrar dolor"}
        </span>
      </div>

      {/* Canvas */}
      <div
        ref={containerRef}
        className="w-full rounded-xl overflow-hidden"
        style={{ height: "clamp(340px, 55vw, 440px)", background: "transparent" }}
      />

      {/* Fibro legend */}
      {fibromyalgiaMode && (
        <div className="flex items-center gap-2 text-xs text-slate-400 mt-1">
          <span className="w-2.5 h-2.5 rounded-full bg-violet-400 inline-block" />
          18 puntos de gatillo fibromialgia
        </div>
      )}

      {/* Pain legend */}
      <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs text-slate-500 mt-1">
        {[
          { c: "#c5956a", l: "Sin dolor" },
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

interface THREEColor         { setHex(hex: number): void }
interface THREEVector2       { set(x: number, y: number): void }
interface THREEVector3       { set(x: number, y: number, z: number): void }
interface THREEBufferGeometry { dispose(): void }
interface THREEMeshStdMaterial {
  color: THREEColor;
  roughness: number;
  metalness: number;
  emissive?: THREEColor;
  emissiveIntensity?: number;
  dispose(): void;
}
interface THREEObject3D {
  position: THREEVector3;
  rotation: { x: number; y: number; z: number };
  scale: { set(x: number, y: number, z: number): void; setScalar(s: number): void };
  add(o: THREEObject3D): void;
  remove(o: THREEObject3D): void;
  visible: boolean;
  type: string;
  userData: Record<string, unknown>;
  children: THREEObject3D[];
}
interface THREEMesh extends THREEObject3D {
  material: THREEMeshStdMaterial;
}
interface THREEScene  extends THREEObject3D {}
interface THREEGroup  extends THREEObject3D {}
interface THREECamera { aspect?: number; updateProjectionMatrix?(): void }
interface THREEWebGLRenderer {
  domElement: HTMLCanvasElement;
  setPixelRatio(r: number): void;
  setSize(w: number, h: number): void;
  setClearColor(color: number, alpha: number): void;
  render(scene: THREEScene, camera: THREECamera): void;
  dispose(): void;
}
interface THREERaycaster {
  setFromCamera(pointer: THREEVector2, camera: THREECamera): void;
  intersectObjects(objs: THREEMesh[]): Array<{ object: THREEObject3D }>;
}
interface THREEConstructors {
  WebGLRenderer: new (opts: { antialias: boolean; alpha: boolean }) => THREEWebGLRenderer;
  PerspectiveCamera: new (fov: number, aspect: number, near: number, far: number) => THREECamera & { position: THREEVector3 };
  Scene: new () => THREEScene;
  Group: new () => THREEGroup;
  AmbientLight: new (color: number, intensity: number) => THREEObject3D;
  DirectionalLight: new (color: number, intensity: number) => THREEObject3D & { position: THREEVector3 };
  Mesh: new (geo: THREEBufferGeometry, mat: THREEMeshStdMaterial) => THREEMesh;
  MeshStandardMaterial: new (opts: {
    color?: number;
    roughness?: number;
    metalness?: number;
    emissive?: number;
    emissiveIntensity?: number;
  }) => THREEMeshStdMaterial;
  SphereGeometry:   new (r: number, ws: number, hs: number) => THREEBufferGeometry;
  CylinderGeometry: new (rt: number, rb: number, h: number, s: number) => THREEBufferGeometry;
  BoxGeometry:      new (w: number, h: number, d: number) => THREEBufferGeometry;
  Vector2: new () => THREEVector2;
  Raycaster: new () => THREERaycaster;
}
interface WindowWithTHREE { THREE?: THREEConstructors }

interface SceneState {
  renderer: THREEWebGLRenderer;
  scene: THREEScene;
  camera: THREECamera;
  pivot: THREEGroup;
  zoneToMeshes: Map<string, THREEMesh[]>;
  fibroMeshes: THREEMesh[];
  rafId: number;
  ro: ResizeObserver;
  cleanup(): void;
}
