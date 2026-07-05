"use client";

import { useLanguage } from "@/hooks/useLanguage";
import { Reveal } from "@/components/ui/Reveal";
import { SectionHeading } from "./SectionHeading";

function CheckList({ points, tone }: { points: readonly string[]; tone: "clinical" | "mint" }) {
  const dot = tone === "clinical" ? "text-clinical" : "text-mint";
  return (
    <ul className="mt-6 space-y-4">
      {points.map((p) => (
        <li key={p} className="flex items-start gap-3">
          <svg viewBox="0 0 24 24" className={`mt-0.5 h-5 w-5 shrink-0 ${dot}`} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
          <span className="text-sm leading-relaxed text-slate-700">{p}</span>
        </li>
      ))}
    </ul>
  );
}

export function AudienceSection() {
  const { t } = useLanguage();
  return (
    <section className="mx-auto max-w-6xl px-6 py-24 sm:py-28">
      <SectionHeading kicker={t.audience.kicker} title={t.audience.title} />

      <div className="mt-14 grid gap-6 md:grid-cols-2">
        <Reveal>
          <div className="h-full rounded-3xl border border-clinical/15 bg-gradient-to-br from-clinical-50/70 to-white p-8">
            <span className="inline-flex rounded-xl bg-clinical/10 px-3 py-1 text-sm font-semibold text-clinical-600">
              {t.audience.doctors.title}
            </span>
            <CheckList points={t.audience.doctors.points} tone="clinical" />
          </div>
        </Reveal>
        <Reveal delay={0.1}>
          <div className="h-full rounded-3xl border border-mint/15 bg-gradient-to-br from-mint-50/70 to-white p-8">
            <span className="inline-flex rounded-xl bg-mint/10 px-3 py-1 text-sm font-semibold text-mint">
              {t.audience.patients.title}
            </span>
            <CheckList points={t.audience.patients.points} tone="mint" />
          </div>
        </Reveal>
      </div>
    </section>
  );
}
