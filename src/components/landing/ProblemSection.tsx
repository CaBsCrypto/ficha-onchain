"use client";

import { useLanguage } from "@/hooks/useLanguage";
import { Card } from "@/components/ui/Card";
import { Reveal } from "@/components/ui/Reveal";
import { SectionHeading } from "./SectionHeading";

export function ProblemSection() {
  const { t } = useLanguage();
  return (
    <section id="problem" className="mx-auto max-w-6xl px-6 py-16 sm:py-24 lg:py-32">
      <SectionHeading
        kicker={t.problem.kicker}
        title={t.problem.title}
        subtitle={t.problem.subtitle}
      />
      <div className="mt-14 grid gap-6 md:grid-cols-3">
        {t.problem.cards.map((card, i) => (
          <Reveal key={card.title} delay={i * 0.1}>
            <Card interactive className="h-full">
              <div className="flex items-baseline gap-2">
                <span className="text-5xl font-semibold tracking-tight text-clinical">
                  {card.stat}
                </span>
                <span className="text-base text-muted">{card.statLabel}</span>
              </div>
              <h3 className="mt-5 text-xl font-semibold text-ink">{card.title}</h3>
              <p className="mt-2 text-base leading-relaxed text-muted">{card.desc}</p>
            </Card>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
