"use client";

import { useLanguage } from "@/hooks/useLanguage";
import { Reveal } from "@/components/ui/Reveal";
import { SectionHeading } from "./SectionHeading";

function Benefits({ points }: { points: readonly string[] }) {
  return <ul className="mt-5 space-y-3 text-base leading-relaxed text-slate-600">
    {points.map(point => <li key={point}>{point}</li>)}
  </ul>;
}

export function AudienceSection() {
  const { t } = useLanguage();
  const { patients, doctors } = t.audience;
  return (
    <section id="for-you" className="mx-auto max-w-6xl px-6 py-16 sm:py-24 lg:py-32">
      <SectionHeading kicker={t.audience.kicker} title={t.audience.title} subtitle={t.audience.subtitle} />
      <div className="mt-12 grid gap-6 md:grid-cols-[1.3fr_1fr]">
        <Reveal>
          <article className="h-full rounded-3xl border border-sky-200 bg-gradient-to-br from-sky-50 to-white p-6 shadow-sm sm:p-8">
            <p className="text-sm font-semibold text-sky-700">{patients.title}</p>
            <h3 className="mt-3 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{patients.headline}</h3>
            <Benefits points={patients.points} />
            <div className="mt-7 border-t border-sky-200/70 pt-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">{patients.futureLabel}</p>
              <h4 className="mt-2 text-lg font-semibold text-ink">{patients.futureTitle}</h4>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{patients.futureDescription}</p>
            </div>
          </article>
        </Reveal>
        <Reveal delay={0.1}>
          <article className="h-full rounded-3xl border border-slate-200 bg-white p-6 sm:p-8">
            <p className="text-sm font-semibold text-slate-600">{doctors.title}</p>
            <h3 className="mt-3 text-2xl font-semibold tracking-tight text-ink">{doctors.headline}</h3>
            <Benefits points={doctors.points} />
          </article>
        </Reveal>
      </div>
    </section>
  );
}
