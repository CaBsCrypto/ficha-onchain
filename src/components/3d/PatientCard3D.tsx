"use client";

import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { Float, RoundedBox, Text } from "@react-three/drei";

interface CardContent {
  name: string;
  badge: string;
  issued: string;
  hash: string;
  network: string;
}

const INK = "#0f172a";
const CLINICAL = "#0ea5e9";
const MINT = "#10b981";
const MUTED = "#64748b";
const VIOLET = "#8b5cf6";
const INDIGO = "#6366f1";

/** The floating glass card mesh + on-card typography. */
function Card({ content }: { content: CardContent }) {
  return (
    <Float speed={1.6} rotationIntensity={0.5} floatIntensity={0.9}>
      <group rotation={[0.08, -0.35, 0]}>
        {/* Violet glow slab behind the card — vibrant halo */}
        <RoundedBox
          args={[3.95, 2.7, 0.05]}
          radius={0.18}
          smoothness={6}
          position={[0, 0, -0.14]}
        >
          <meshStandardMaterial
            color={VIOLET}
            emissive={VIOLET}
            emissiveIntensity={1.15}
            transparent
            opacity={0.4}
          />
        </RoundedBox>

        {/* Indigo under-glow for extra depth */}
        <RoundedBox
          args={[3.72, 2.5, 0.05]}
          radius={0.16}
          smoothness={6}
          position={[0, 0, -0.13]}
        >
          <meshStandardMaterial
            color={INDIGO}
            emissive={INDIGO}
            emissiveIntensity={0.9}
            transparent
            opacity={0.3}
          />
        </RoundedBox>

        {/* Glass card body */}
        <RoundedBox args={[3.4, 2.15, 0.1]} radius={0.14} smoothness={8}>
          <meshPhysicalMaterial
            color="#ffffff"
            roughness={0.12}
            metalness={0.1}
            clearcoat={1}
            clearcoatRoughness={0.15}
            transmission={0.35}
            thickness={0.6}
            ior={1.35}
            reflectivity={0.4}
            transparent
            opacity={0.92}
            attenuationColor="#e0f2fe"
          />
        </RoundedBox>

        {/* Watermark: faint Stellar-style orbit ring */}
        <mesh position={[0.75, -0.15, 0.045]} rotation={[0, 0, 0.4]}>
          <torusGeometry args={[0.62, 0.03, 16, 64]} />
          <meshBasicMaterial color={CLINICAL} transparent opacity={0.08} />
        </mesh>
        <mesh position={[0.75, -0.15, 0.045]}>
          <circleGeometry args={[0.09, 32]} />
          <meshBasicMaterial color={CLINICAL} transparent opacity={0.1} />
        </mesh>

        {/* Network label (top-right) */}
        <Text
          position={[1.5, 0.82, 0.06]}
          fontSize={0.13}
          color={CLINICAL}
          fillOpacity={0.55}
          anchorX="right"
          anchorY="middle"
          letterSpacing={0.18}
        >
          {content.network.toUpperCase()}
        </Text>

        {/* Patient name */}
        <Text
          position={[-1.5, 0.62, 0.06]}
          fontSize={0.27}
          color={INK}
          anchorX="left"
          anchorY="middle"
          outlineWidth={0.004}
          outlineColor={INK}
        >
          {content.name}
        </Text>

        {/* Issuer */}
        <Text
          position={[-1.5, 0.33, 0.06]}
          fontSize={0.12}
          color={MUTED}
          anchorX="left"
          anchorY="middle"
        >
          {content.issued}
        </Text>

        {/* Verified badge: mint dot + label */}
        <mesh position={[-1.42, -0.52, 0.06]}>
          <circleGeometry args={[0.055, 24]} />
          <meshBasicMaterial color={MINT} />
        </mesh>
        <Text
          position={[-1.3, -0.52, 0.06]}
          fontSize={0.15}
          color={CLINICAL}
          anchorX="left"
          anchorY="middle"
        >
          {content.badge}
        </Text>

        {/* Blockchain hash */}
        <Text
          position={[-1.5, -0.85, 0.06]}
          fontSize={0.13}
          color={MUTED}
          anchorX="left"
          anchorY="middle"
          letterSpacing={0.05}
        >
          {content.hash}
        </Text>
      </group>
    </Float>
  );
}

export interface PatientCard3DProps {
  name: string;
  badge: string;
  issued: string;
  hash: string;
  network: string;
}

/** Skeleton shown while the 3D scene / fonts load. */
export function CardSkeleton() {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <div className="h-[215px] w-[340px] animate-pulse rounded-3xl border border-slate-200/70 bg-gradient-to-br from-white to-clinical-50 shadow-xl shadow-clinical/10" />
    </div>
  );
}

export default function PatientCard3D(props: PatientCard3DProps) {
  return (
    <Canvas
      camera={{ position: [0, 0, 6], fov: 42 }}
      dpr={[1, 2]}
      gl={{ alpha: true, antialias: true }}
      style={{ background: "transparent" }}
    >
      <ambientLight intensity={0.75} />
      <directionalLight position={[4, 5, 5]} intensity={1.3} />
      <pointLight position={[0, 0, -3]} color={VIOLET} intensity={9} distance={12} />
      <pointLight position={[-3, 2, 2]} color={INDIGO} intensity={3} distance={12} />
      <Suspense fallback={null}>
        <Card content={props} />
      </Suspense>
    </Canvas>
  );
}
