"use client";

import { useState, type MouseEvent } from "react";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import { useLanguage } from "@/hooks/useLanguage";
import { buttonVariants } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { CardSkeleton } from "@/components/3d/PatientCard3D";
import { WaitlistModal } from "./WaitlistModal";

// 3D scene is client-only — never render on the server.
const PatientCard3D = dynamic(() => import("@/components/3d/PatientCard3D"), {
  ssr: false,
  loading: () => <CardSkeleton />,
});

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12, delayChildren: 0.05 } },
};
const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE } },
};

export function HeroSection() {
  const { t } = useLanguage();
  const c = t.hero.card;

  const [modalOpen, setModalOpen] = useState(false);

  // Soft mouse-follow tilt on the 3D card (max ~12°).
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [tilting, setTilting] = useState(false);

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5; // -0.5 → 0.5
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    setTilt({ x: y * -12, y: x * 12 });
  };

  const handleMouseLeave = () => {
    setTilting(false);
    setTilt({ x: 0, y: 0 });
  };

  return (
    <section
      id="top"
      className="relative overflow-hidden bg-grid pt-24 pb-16 sm:pt-40 sm:pb-32"
    >
      <div className="bg-spotlight pointer-events-none absolute inset-0" />
      <div className="relative mx-auto grid max-w-6xl gap-8 px-6 lg:grid-cols-2 lg:grid-rows-2 lg:gap-x-12 lg:gap-y-0">
        {/* Title — top on mobile and desktop (left column, bottom-aligned to meet subtitle at center) */}
        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="lg:col-start-1 lg:row-start-1 lg:self-end"
        >
          <motion.div variants={item}>
            <Badge tone="clinical">
              <span className="h-1.5 w-1.5 rounded-full bg-clinical" />
              {t.hero.badge}
            </Badge>
          </motion.div>

          <motion.h1
            variants={item}
            className="mt-6 text-4xl font-semibold leading-[1.05] tracking-tight text-ink sm:text-6xl lg:text-7xl"
          >
            {t.hero.title}
            <br />
            <span className="text-gradient">{t.hero.titleAccent}</span>
          </motion.h1>
        </motion.div>

        {/* 3D card — middle on mobile, right column (spanning + centered) on desktop */}
        <div
          className="relative mx-auto h-[280px] w-full max-w-[340px] sm:h-[360px] sm:max-w-[420px] lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:h-[440px] lg:max-w-none lg:self-center"
          onMouseEnter={() => setTilting(true)}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          style={{
            transform: `perspective(800px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
            transition: `transform ${tilting ? "0.15s" : "0.4s"} ease-out`,
            willChange: "transform",
          }}
        >
          {/* Diffuse violet/indigo halo behind the floating card */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-6"
            style={{
              background:
                "radial-gradient(circle at 50% 45%, rgba(139,92,246,0.5), rgba(99,102,241,0.22) 45%, transparent 70%)",
              filter: "blur(44px)",
            }}
          />
          <PatientCard3D
            name={c.name}
            badge={c.badge}
            issued={c.issued}
            hash={c.hash}
            network={c.network}
          />
        </div>

        {/* Subtitle + CTAs — below the card on mobile, left column (bottom) on desktop */}
        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="lg:col-start-1 lg:row-start-2 lg:mt-6 lg:self-start"
        >
          <motion.p
            variants={item}
            className="max-w-xl text-xl leading-relaxed text-muted"
          >
            {t.hero.subtitle}
          </motion.p>

          <motion.div variants={item} className="mt-9 flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className={buttonVariants({ size: "lg" })}
            >
              {t.hero.cta} <span aria-hidden>→</span>
            </button>
            <a
              href="#how"
              className={buttonVariants({ variant: "secondary", size: "lg" })}
            >
              {t.hero.secondary}
            </a>
          </motion.div>
        </motion.div>
      </div>

      <WaitlistModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </section>
  );
}
