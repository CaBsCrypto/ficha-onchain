"use client";

import { useLanguage } from "@/hooks/useLanguage";
import { Reveal } from "@/components/ui/Reveal";
import { SectionHeading } from "./SectionHeading";

export function HowItWorksSection() {
  const { t } = useLanguage();
  return (
    <section id="how" className="mx-auto max-w-6xl px-6 py-16 sm:py-24 lg:py-32">
      <SectionHeading
        kicker={t.how.kicker}
        title={t.how.title}
        subtitle={t.how.subtitle}
      />

      <div className="mt-16 grid gap-8 md:grid-cols-3">
        {t.how.steps.map((step, i) => (
          <Reveal key={step.step} delay={i * 0.12}>
            <div className="relative h-full rounded-3xl border border-slate-200/70 bg-white p-8">
              <span className="text-6xl font-semibold tracking-tighter text-clinical/15">
                {step.step}
              </span>
              <h3 className="mt-4 text-2xl font-semibold text-ink">{step.title}</h3>
              <p className="mt-3 text-base leading-relaxed text-muted">{step.desc}</p>
              {i < t.how.steps.length - 1 && (
                <span className="absolute right-8 top-8 hidden text-clinical/30 md:block">
                  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                </span>
              )}
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
