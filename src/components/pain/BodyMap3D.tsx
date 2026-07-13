"use client";
// Copyright © 2026 Browns Studio

import React, { useRef, useEffect, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type BodyZone =
  | "head" | "neck" | "shoulder_l" | "shoulder_r"
  | "chest" | "abdomen" | "back_upper" | "back_lower"
  | "arm_l" | "arm_r" | "hand_l" | "hand_r"
  | "hip_l" | "hip_r" | "leg_l" | "leg_r"
  | "knee_l" | "knee_r" | "foot_l" | "foot_r";

type ZoneType = "general" | "fibro";

interface HotspotDef {
  id: string;
  name: string;
  position: [number, number, number];
  type: ZoneType;
}

export interface BodyMap3DProps {
  painData: Record<string, number>;
  fibromyalgiaMode?: boolean;
  readOnly?: boolean;
  onZoneSelect?: (zoneId: string) => void;
}

// ─── Hotspot definitions ──────────────────────────────────────────────────────

const GENERAL_HOTSPOTS: HotspotDef[] = [
  { id: "head",        name: "Cabeza",        position: [0,    1.55, 0],     type: "general" },
  { id: "neck",        name: "Cuello",        position: [0,    1.32, 0],     type: "general" },
  { id: "shoulder_l",  name: "Hombro Izq.",   position: [-0.26, 1.18, 0],   type: "general" },
  { id: "shoulder_r",  name: "Hombro Der.",   position: [0.26,  1.18, 0],   type: "general" },
  { id: "chest",       name: "Pecho",         position: [0,    1.05, 0.12], type: "general" },
  { id: "abdomen",     name: "Abdomen",       position: [0,    0.78, 0.12], type: "general" },
  { id: "back_upper",  name: "Espalda Alta",  position: [0,    1.05, -0.15],type: "general" },
  { id: "back_lower",  name: "Espalda Baja",  position: [0,    0.75, -0.15],type: "general" },
  { id: "arm_l",       name: "Brazo Izq.",    position: [-0.40, 0.95, 0],   type: "general" },
  { id: "arm_r",       name: "Brazo Der.",    position: [0.40,  0.95, 0],   type: "general" },
  { id: "hand_l",      name: "Mano Izq.",     position: [-0.44, 0.52, 0],   type: "general" },
  { id: "hand_r",      name: "Mano Der.",     position: [0.44,  0.52, 0],   type: "general" },
  { id: "hip_l",       name: "Cadera Izq.",   position: [-0.12, 0.52, 0],   type: "general" },
  { id: "hip_r",       name: "Cadera Der.",   position: [0.12,  0.52, 0],   type: "general" },
  { id: "leg_l",       name: "Muslo Izq.",    position: [-0.12, 0.26, 0],   type: "general" },
  { id: "leg_r",       name: "Muslo Der.",    position: [0.12,  0.26, 0],   type: "general" },
  { id: "knee_l",      name: "Rodilla Izq.",  position: [-0.12, 0.00, 0.06],type: "general" },
  { id: "knee_r",      name: "Rodilla Der.",  position: [0.12,  0.00, 0.06],type: "general" },
  { id: "foot_l",      name: "Pie Izq.",      position: [-0.12,-0.60, 0.08],type: "general" },
  { id: "foot_r",      name: "Pie Der.",      position: [0.12, -0.60, 0.08],type: "general" },
];

const FIBRO_HOTSPOTS: HotspotDef[] = [
  { id: "fibro_occiput_l",    name: "Occipucio Izq.",        position: [-0.07, 1.60, -0.10], type: "fibro" },
  { id: "fibro_occiput_r",    name: "Occipucio Der.",        position: [0.07,  1.60, -0.10], type: "fibro" },
  { id: "fibro_cervical_l",   name: "Cervical Bajo Izq.",    position: [-0.05, 1.30, -0.08], type: "fibro" },
  { id: "fibro_cervical_r",   name: "Cervical Bajo Der.",    position: [0.05,  1.30, -0.08], type: "fibro" },
  { id: "fibro_trapezius_l",  name: "Trapecio Izq.",         position: [-0.20, 1.20, -0.05], type: "fibro" },
  { id: "fibro_trapezius_r",  name: "Trapecio Der.",         position: [0.20,  1.20, -0.05], type: "fibro" },
  { id: "fibro_supraspinous_l", name: "Supraespinoso Izq.", position: [-0.22, 1.08, -0.14], type: "fibro" },
  { id: "fibro_supraspinous_r", name: "Supraespinoso Der.", position: [0.22,  1.08, -0.14], type: "fibro" },
  { id: "fibro_rib2_l",       name: "2ª Costilla Izq.",      position: [-0.10, 1.08,  0.14], type: "fibro" },
  { id: "fibro_rib2_r",       name: "2ª Costilla Der.",      position: [0.10,  1.08,  0.14], type: "fibro" },
  { id: "fibro_epicondyle_l", name: "Epicóndilo Izq.",        position: [-0.38, 0.82,  0.06], type: "fibro" },
  { id: "fibro_epicondyle_r", name: "Epicóndilo Der.",        position: [0.38,  0.82,  0.06], type: "fibro" },
  { id: "fibro_gluteal_l",    name: "Glúteo Izq.",            position: [-0.15, 0.54, -0.18], type: "fibro" },
  { id: "fibro_gluteal_r",    name: "Glúteo Der.",            position: [0.15,  0.54, -0.18], type: "fibro" },
  { id: "fibro_trochanter_l", name: "Trocánter Izq.",         position: [-0.22, 0.44, -0.10], type: "fibro" },
  { id: "fibro_trochanter_r", name: "Trocánter Der.",         position: [0.22,  0.44, -0.10], type: "fibro" },
  { id: "fibro_knee_l",       name: "Rodilla (medial) Izq.", position: [-0.07, 0.00, 0.10], type: "fibro" },
  { id: "fibro_knee_r",       name: "Rodilla (medial) Der.", position: [0.07,  0.00, 0.10], type: "fibro" },
];

// ─── Color helpers ────────────────────────────────────────────────────────────

function painColor(level: number | undefined): number {
  if (!level) return 0x334155;
  if (level <= 3) return 0x22c55e;
  if (level <= 6) return 0xeab308;
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
  const tooltipRef = useRef<HTMLSpanElement>(null);
  const sceneRef = useRef<SceneState | null>(null);

  const onZoneSelectRef = useRef(onZoneSelect);
  useEffect(() => { onZoneSelectRef.current = onZoneSelect; }, [onZoneSelect]);

  const painDataRef = useRef(painData);
  useEffect(() => { painDataRef.current = painData; }, [painData]);

  // Update hotspot colors when painData changes (without reinit)
  useEffect(() => {
    const s = sceneRef.current;
    if (!s) return;
    s.hotspotMeshes.forEach((mesh, id) => {
      const mat = mesh.material as THREEMeshPhongMaterial;
      const level = painData[id];
      mat.color.setHex(painColor(level));
      mat.opacity = level ? 1.0 : 0.55;
    });
  }, [painData]);

  // Show/hide fibro hotspots
  useEffect(() => {
    const s = sceneRef.current;
    if (!s) return;
    s.hotspotMeshes.forEach((mesh, id) => {
      const def = [...GENERAL_HOTSPOTS, ...FIBRO_HOTSPOTS].find((h) => h.id === id);
      if (def?.type === "fibro") mesh.visible = fibromyalgiaMode;
    });
  }, [fibromyalgiaMode]);

  const initScene = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    if (sceneRef.current) return; // already inited

    const THREE = (window as WindowWithTHREE).THREE;
    if (!THREE) return;
    // Non-optional rebind so nested closures don't lose narrowing
    const T: THREEConstructors = THREE;

    // ── Renderer ──
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    const w = container.clientWidth;
    const h = container.clientHeight;
    renderer.setSize(w, h);
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);

    // ── Camera ──
    const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
    camera.position.set(0, 0.5, 3.2);

    // ── Scene ──
    const scene = new THREE.Scene();
    const ambient = new THREE.AmbientLight(0xfff8f0, 0.65);
    scene.add(ambient);
    const dirLight = new THREE.DirectionalLight(0xfff0d8, 0.85);
    dirLight.position.set(0.5, 2, 1.5);
    scene.add(dirLight);
    const fillLight = new THREE.DirectionalLight(0x88aacc, 0.30);
    fillLight.position.set(-1.5, 0.5, -1);
    scene.add(fillLight);
    const rimLight = new THREE.DirectionalLight(0xaaccff, 0.20);
    rimLight.position.set(0, -1, -2);
    scene.add(rimLight);

    // ── Body material — warm skin tone ──
    const bodyMat = new THREE.MeshPhongMaterial({
      color: 0xc49a6c,
      shininess: 22,
      specular: 0x3a1a06,
    });

    // Helper
    function addMesh(geo: THREEBufferGeometry, mat: THREEMeshPhongMaterial, x: number, y: number, z: number, rx = 0, rz = 0) {
      const m = new T.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.rotation.x = rx;
      m.rotation.z = rz;
      scene.add(m);
      return m;
    }

    // ── Head ──
    addMesh(new THREE.SphereGeometry(0.12, 16, 16), bodyMat, 0, 1.55, 0);
    // ── Neck ──
    addMesh(new THREE.CylinderGeometry(0.06, 0.07, 0.12, 12), bodyMat, 0, 1.38, 0);
    // ── Torso ──
    addMesh(new THREE.CylinderGeometry(0.18, 0.16, 0.45, 16), bodyMat, 0, 1.03, 0);
    // ── Shoulders ──
    addMesh(new THREE.SphereGeometry(0.09, 12, 12), bodyMat, -0.24, 1.20, 0);
    addMesh(new THREE.SphereGeometry(0.09, 12, 12), bodyMat,  0.24, 1.20, 0);
    // ── Upper arms ──
    addMesh(new THREE.CylinderGeometry(0.06, 0.055, 0.28, 12), bodyMat, -0.36, 0.97, 0, 0,  0.25);
    addMesh(new THREE.CylinderGeometry(0.06, 0.055, 0.28, 12), bodyMat,  0.36, 0.97, 0, 0, -0.25);
    // ── Elbows ──
    addMesh(new THREE.SphereGeometry(0.06, 10, 10), bodyMat, -0.43, 0.82, 0);
    addMesh(new THREE.SphereGeometry(0.06, 10, 10), bodyMat,  0.43, 0.82, 0);
    // ── Forearms ──
    addMesh(new THREE.CylinderGeometry(0.05, 0.045, 0.25, 12), bodyMat, -0.44, 0.66, 0, 0,  0.10);
    addMesh(new THREE.CylinderGeometry(0.05, 0.045, 0.25, 12), bodyMat,  0.44, 0.66, 0, 0, -0.10);
    // ── Hands ──
    addMesh(new THREE.SphereGeometry(0.07, 10, 10), bodyMat, -0.44, 0.50, 0);
    addMesh(new THREE.SphereGeometry(0.07, 10, 10), bodyMat,  0.44, 0.50, 0);
    // ── Pelvis ──
    const pelvisGeo = new THREE.CylinderGeometry(0.16, 0.14, 0.18, 16);
    addMesh(pelvisGeo, bodyMat, 0, 0.57, 0);
    // ── Thighs ──
    addMesh(new THREE.CylinderGeometry(0.09, 0.08, 0.30, 12), bodyMat, -0.12, 0.28, 0);
    addMesh(new THREE.CylinderGeometry(0.09, 0.08, 0.30, 12), bodyMat,  0.12, 0.28, 0);
    // ── Knees ──
    addMesh(new THREE.SphereGeometry(0.08, 10, 10), bodyMat, -0.12, 0.08, 0);
    addMesh(new THREE.SphereGeometry(0.08, 10, 10), bodyMat,  0.12, 0.08, 0);
    // ── Shins ──
    addMesh(new THREE.CylinderGeometry(0.07, 0.06, 0.28, 12), bodyMat, -0.12, -0.20, 0);
    addMesh(new THREE.CylinderGeometry(0.07, 0.06, 0.28, 12), bodyMat,  0.12, -0.20, 0);
    // ── Feet ──
    addMesh(new THREE.BoxGeometry(0.08, 0.06, 0.16), bodyMat, -0.12, -0.40, 0.06);
    addMesh(new THREE.BoxGeometry(0.08, 0.06, 0.16), bodyMat,  0.12, -0.40, 0.06);

    // ── Hotspots ──
    const hotspotMeshes = new Map<string, THREEMesh>();
    const allHotspots = fibromyalgiaMode
      ? [...GENERAL_HOTSPOTS, ...FIBRO_HOTSPOTS]
      : GENERAL_HOTSPOTS;

    const hotspotGeo = new THREE.SphereGeometry(0.032, 10, 10);

    for (const def of [...GENERAL_HOTSPOTS, ...FIBRO_HOTSPOTS]) {
      const level = painDataRef.current[def.id];
      const mat = new THREE.MeshPhongMaterial({
        color: painColor(level),
        transparent: true,
        opacity: level ? 1.0 : 0.55,
        shininess: 80,
      });
      const mesh = new THREE.Mesh(hotspotGeo, mat);
      mesh.position.set(...def.position);
      mesh.visible = def.type === "general" || fibromyalgiaMode;
      mesh.userData = { id: def.id, name: def.name };
      scene.add(mesh);
      hotspotMeshes.set(def.id, mesh);
    }
    void allHotspots; // used above

    // ── Orbital rotation state ──
    let isDragging = false;
    let prevX = 0;
    let prevY = 0;
    let rotY = 0;
    let rotX = 0;
    const ROT_X_MIN = -Math.PI / 6;
    const ROT_X_MAX = Math.PI / 3;

    // ── Raycaster ──
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let hoveredMesh: THREEMesh | null = null;

    function getCanvasRelative(e: MouseEvent | Touch) {
      const rect = renderer.domElement.getBoundingClientRect();
      return {
        x: ((e.clientX - rect.left) / rect.width) * 2 - 1,
        y: -((e.clientY - rect.top) / rect.height) * 2 + 1,
      };
    }

    function updateHover(x: number, y: number) {
      pointer.set(x, y);
      raycaster.setFromCamera(pointer, camera);
      const meshArr = Array.from(hotspotMeshes.values()).filter((m) => m.visible);
      const hits = raycaster.intersectObjects(meshArr);
      const hit = hits[0]?.object as THREEMesh | undefined;

      if (hoveredMesh && hoveredMesh !== hit) {
        hoveredMesh.scale.setScalar(1);
      }
      if (hit) {
        hit.scale.setScalar(1.3);
        renderer.domElement.style.cursor = "pointer";
        const tooltip = tooltipRef.current;
        if (tooltip) {
          const id: string = hit.userData["id"] as string;
          const name: string = hit.userData["name"] as string;
          const lvl = painDataRef.current[id];
          tooltip.textContent = lvl ? `${name} · Dolor: ${lvl}/10` : name;
          tooltip.classList.remove("hidden");
          tooltip.nextElementSibling?.classList.add("hidden");
        }
      } else {
        renderer.domElement.style.cursor = "grab";
        const tooltip = tooltipRef.current;
        if (tooltip) {
          tooltip.classList.add("hidden");
          tooltip.nextElementSibling?.classList.remove("hidden");
        }
      }
      hoveredMesh = hit ?? null;
    }

    // Mouse events
    let dragStartX = 0;
    let dragStartY = 0;
    function onMouseDown(e: MouseEvent) {
      isDragging = true;
      prevX = e.clientX;
      prevY = e.clientY;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      renderer.domElement.style.cursor = "grabbing";
    }
    function onMouseMove(e: MouseEvent) {
      if (isDragging) {
        rotY += (e.clientX - prevX) * 0.008;
        rotX += (e.clientY - prevY) * 0.008;
        rotX = Math.max(ROT_X_MIN, Math.min(ROT_X_MAX, rotX));
        prevX = e.clientX;
        prevY = e.clientY;
      } else {
        const rel = getCanvasRelative(e);
        updateHover(rel.x, rel.y);
      }
    }
    function onMouseUp(e: MouseEvent) {
      // Compare against drag START position (not last mousemove position)
      const totalDx = Math.abs(e.clientX - dragStartX);
      const totalDy = Math.abs(e.clientY - dragStartY);
      if (isDragging && totalDx < 6 && totalDy < 6) {
        // treat as click
        const rel = getCanvasRelative(e);
        pointer.set(rel.x, rel.y);
        raycaster.setFromCamera(pointer, camera);
        const meshArr = Array.from(hotspotMeshes.values()).filter((m) => m.visible);
        const hits = raycaster.intersectObjects(meshArr);
        if (hits[0] && !readOnly) {
          onZoneSelectRef.current?.((hits[0].object as THREEMesh).userData["id"] as string);
        }
      }
      isDragging = false;
      renderer.domElement.style.cursor = "grab";
    }

    // Touch events
    let touchStartX = 0;
    let touchStartY = 0;
    function onTouchStart(e: TouchEvent) {
      if (e.touches.length === 1) {
        isDragging = true;
        prevX = e.touches[0].clientX;
        prevY = e.touches[0].clientY;
        touchStartX = prevX;
        touchStartY = prevY;
      }
    }
    function onTouchMove(e: TouchEvent) {
      if (isDragging && e.touches.length === 1) {
        e.preventDefault();
        rotY += (e.touches[0].clientX - prevX) * 0.010;
        rotX += (e.touches[0].clientY - prevY) * 0.010;
        rotX = Math.max(ROT_X_MIN, Math.min(ROT_X_MAX, rotX));
        prevX = e.touches[0].clientX;
        prevY = e.touches[0].clientY;
      }
    }
    function onTouchEnd(e: TouchEvent) {
      const t = e.changedTouches[0];
      if (Math.abs(t.clientX - touchStartX) < 8 && Math.abs(t.clientY - touchStartY) < 8 && !readOnly) {
        const rel = getCanvasRelative(t);
        pointer.set(rel.x, rel.y);
        raycaster.setFromCamera(pointer, camera);
        const meshArr = Array.from(hotspotMeshes.values()).filter((m) => m.visible);
        const hits = raycaster.intersectObjects(meshArr);
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

    // ── Pivot group for rotation ──
    const pivot = new THREE.Group();
    // Move all scene children except lights into pivot
    // Actually easier: we'll rotate pivot which holds the body group
    const bodyGroup = new THREE.Group();
    scene.children
      .filter((c) => c.type === "Mesh")
      .forEach((c) => { scene.remove(c); bodyGroup.add(c); });
    hotspotMeshes.forEach((m) => { scene.remove(m); bodyGroup.add(m); });
    pivot.add(bodyGroup);
    pivot.position.set(0, -0.5, 0);
    scene.add(pivot);

    // ── ResizeObserver ──
    const ro = new ResizeObserver(() => {
      if (!container) return;
      const cw = container.clientWidth;
      const ch = container.clientHeight;
      renderer.setSize(cw, ch);
      camera.aspect = cw / ch;
      camera.updateProjectionMatrix();
    });
    ro.observe(container);

    // ── Render loop ──
    let rafId = 0;
    let time = 0;
    function animate() {
      rafId = requestAnimationFrame(animate);
      time += 0.022;

      // Idle auto-rotation when not dragging
      if (!isDragging) {
        rotY += 0.004;
      }

      // Pulse hotspots that have pain recorded
      hotspotMeshes.forEach((mesh, id) => {
        if (!mesh.visible) return;
        const level = painDataRef.current[id];
        if (level && level > 0 && hoveredMesh !== mesh) {
          // Pulse speed scales with pain intensity
          const speed = 0.8 + level * 0.06;
          const pulse = 1 + 0.25 * Math.sin(time * speed + id.charCodeAt(0) * 0.7);
          mesh.scale.setScalar(pulse);
        }
      });

      pivot.rotation.y = rotY;
      pivot.rotation.x = rotX;
      renderer.render(scene, camera);
    }
    animate();

    sceneRef.current = {
      renderer,
      scene,
      camera,
      pivot,
      hotspotMeshes,
      rafId,
      ro,
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
    // Dynamically load Three.js if not present
    function tryInit() {
      if ((window as WindowWithTHREE).THREE) {
        initScene();
        return;
      }
      const script = document.createElement("script");
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";
      script.onload = () => initScene();
      document.head.appendChild(script);
    }
    tryInit();
    return () => {
      sceneRef.current?.cleanup();
      sceneRef.current = null;
    };
  }, [initScene]);

  return (
    <div className="flex flex-col items-center gap-2 select-none w-full">
      {/* Tooltip / hint bar */}
      <div className="h-7 flex items-center justify-center">
        <span
          ref={tooltipRef}
          className="text-sm font-medium text-white bg-[#1e293b] border border-[#334155] px-3 py-1 rounded-full hidden"
        />
        <span className="tooltip-hint text-xs text-[#64748B]">
        </span>
      </div>

      {/* Canvas container */}
      <div
        ref={containerRef}
        className="w-full rounded-xl overflow-hidden"
        style={{
          height: "clamp(350px, 55vw, 450px)",
          background: "transparent",
        }}
      />

      {/* Fibro legend */}
      {fibromyalgiaMode && (
        <div className="flex items-center gap-2 text-xs text-[#94A3B8] mt-1">
          <span className="w-2.5 h-2.5 rounded-full bg-[#a78bfa] inline-block" />
          18 puntos de gatillo fibromialgia activos
        </div>
      )}

      {/* Pain scale legend */}
      <div className="flex gap-3 text-xs text-[#64748B] mt-1">
        {[
          { color: "#334155", label: "Sin dolor" },
          { color: "#22c55e", label: "1–3" },
          { color: "#eab308", label: "4–6" },
          { color: "#f97316", label: "7–9" },
          { color: "#ef4444", label: "10" },
        ].map(({ color, label }) => (
          <span key={label} className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: color }} />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Internal types for Three.js (no `any`, narrow to what we use) ─────────────

interface THREEVector2 { set(x: number, y: number): void }
interface THREEVector3 { set(x: number, y: number, z: number): void }
interface THREEColor  { setHex(hex: number): void }
interface THREEBufferGeometry { dispose(): void }
interface THREEMeshPhongMaterial {
  color: THREEColor;
  transparent: boolean;
  opacity: number;
  shininess: number;
  specular: THREEColor;
  dispose(): void;
}
interface THREEObject3D {
  position: THREEVector3;
  rotation: { x: number; y: number; z: number };
  scale: { setScalar(s: number): void };
  add(o: THREEObject3D): void;
  remove(o: THREEObject3D): void;
  visible: boolean;
  type: string;
  userData: Record<string, unknown>;
  children: THREEObject3D[];
}
interface THREEMesh extends THREEObject3D {
  material: THREEMeshPhongMaterial;
}
interface THREEScene extends THREEObject3D { }
interface THREEGroup extends THREEObject3D { }
interface THREECamera { aspect: number; updateProjectionMatrix(): void }
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
  Mesh: new (geo: THREEBufferGeometry, mat: THREEMeshPhongMaterial) => THREEMesh;
  MeshPhongMaterial: new (opts: {
    color?: number;
    shininess?: number;
    specular?: number;
    transparent?: boolean;
    opacity?: number;
  }) => THREEMeshPhongMaterial;
  SphereGeometry: new (r: number, ws: number, hs: number) => THREEBufferGeometry;
  CylinderGeometry: new (rt: number, rb: number, h: number, seg: number) => THREEBufferGeometry;
  BoxGeometry: new (w: number, h: number, d: number) => THREEBufferGeometry;
  Vector2: new () => THREEVector2;
  Raycaster: new () => THREERaycaster;
}

interface WindowWithTHREE {
  THREE?: THREEConstructors;
}

interface SceneState {
  renderer: THREEWebGLRenderer;
  scene: THREEScene;
  camera: THREECamera;
  pivot: THREEGroup;
  hotspotMeshes: Map<string, THREEMesh>;
  rafId: number;
  ro: ResizeObserver;
  cleanup(): void;
}
