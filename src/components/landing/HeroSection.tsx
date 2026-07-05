"use client";

import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import { useLanguage } from "@/hooks/useLanguage";
import { buttonVariants } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { CardSkeleton } from "@/components/3d/PatientCard3D";

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

  return (
    <section
      id="top"
      className="relative overflow-hidden bg-grid pt-28 pb-20 sm:pt-36 sm:pb-28"
    >
      <div className="bg-spotlight pointer-events-none absolute inset-0" />
      <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-6 lg:grid-cols-2">
        {/* Copy */}
        <motion.div variants={container} initial="hidden" animate="show">
          <motion.div variants={item}>
            <Badge tone="clinical">
              <span className="h-1.5 w-1.5 rounded-full bg-clinical" />
              {t.hero.badge}
            </Badge>
          </motion.div>

          <motion.h1
            variants={item}
            className="mt-6 text-4xl font-semibold leading-[1.05] tracking-tight text-ink sm:text-6xl"
          >
            {t.hero.title}
            <br />
            <span className="text-gradient">{t.hero.titleAccent}</span>
          </motion.h1>

          <motion.p
            variants={item}
            className="mt-6 max-w-xl text-lg leading-relaxed text-muted"
          >
            {t.hero.subtitle}
          </motion.p>

          <motion.div variants={item} className="mt-9 flex flex-wrap items-center gap-4">
            <a href="#waitlist" className={buttonVariants({ size: "lg" })}>
              {t.hero.cta} <span aria-hidden>→</span>
            </a>
            <a
              href="#how"
              className={buttonVariants({ variant: "secondary", size: "lg" })}
            >
              {t.hero.secondary}
            </a>
          </motion.div>
        </motion.div>

        {/* 3D card */}
        <div className="relative h-[360px] w-full sm:h-[440px]">
          <PatientCard3D
            name={c.name}
            badge={c.badge}
            issued={c.issued}
            hash={c.hash}
            network={c.network}
          />
        </div>
      </div>
    </section>
  );
}
