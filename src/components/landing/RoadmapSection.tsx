"use client";

import { useLanguage } from "@/hooks/useLanguage";
import { Reveal } from "@/components/ui/Reveal";
import { Badge } from "@/components/ui/Badge";
import { SectionHeading } from "./SectionHeading";

export function RoadmapSection() {
  const { t } = useLanguage();
  return (
    <section id="roadmap" className="relative py-16 sm:py-24 lg:py-32">
      <div className="absolute inset-0 bg-grid opacity-60" />
      <div className="relative mx-auto max-w-6xl px-6">
        <SectionHeading kicker={t.roadmap.kicker} title={t.roadmap.title} />

        <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {t.roadmap.phases.map((phase, i) => (
            <Reveal key={phase.phase} delay={i * 0.1}>
              <div className="relative h-full rounded-3xl border border-slate-200/70 bg-white p-6">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-clinical">
                    {phase.phase}
                  </span>
                  <Badge tone={i === 0 ? "mint" : "muted"}>{phase.status}</Badge>
                </div>
                <h3 className="mt-4 text-lg font-semibold text-ink">
                  {phase.title}
                </h3>
                <p className="mt-2 text-base leading-relaxed text-muted">
                  {phase.desc}
                </p>
                <div className="mt-6 h-1 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-clinical to-mint"
                    style={{ width: `${[70, 25, 8, 4][i] ?? 5}%` }}
                  />
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
