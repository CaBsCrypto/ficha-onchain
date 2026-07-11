"use client";

import { useLanguage } from "@/hooks/useLanguage";
import { Reveal } from "@/components/ui/Reveal";
import { SectionHeading } from "./SectionHeading";

const icons = [
  // Doctor / stethoscope
  <path
    key="doc"
    d="M6 3v5a4 4 0 0 0 8 0V3M4 3h3M13 3h3M10 12v3a5 5 0 0 0 10 0v-1M20 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"
  />,
  // Patient / wallet
  <path key="pat" d="M3 7h15a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Zm0 0 2-3h11l2 3M16 13h.01" />,
  // Verify / shield-check
  <path key="ver" d="M12 3 4 6v6c0 5 3.5 7.5 8 9 4.5-1.5 8-4 8-9V6l-8-3Zm-3 8 2 2 4-4" />,
];

export function SolutionSection() {
  const { t } = useLanguage();
  return (
    <section id="solution" className="relative overflow-hidden py-16 sm:py-24 lg:py-32">
      <div className="absolute inset-0 bg-gradient-to-b from-clinical-50/60 to-mint-50/40" />
      <div className="relative mx-auto max-w-6xl px-6">
        <SectionHeading
          kicker={t.solution.kicker}
          title={t.solution.title}
          subtitle={t.solution.subtitle}
        />

        <Reveal className="mt-16">
          <div className="glass mx-auto flex max-w-4xl flex-col items-stretch gap-4 rounded-3xl p-8 sm:flex-row sm:items-center sm:gap-2">
            {t.solution.steps.map((step, i) => (
              <div key={step.title} className="flex flex-1 items-center gap-2">
                <div className="flex-1 text-center">
                  <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-white shadow-md shadow-clinical/10">
                    <svg
                      viewBox="0 0 24 24"
                      className="h-7 w-7 text-clinical"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.6}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      {icons[i]}
                    </svg>
                  </div>
                  <p className="mt-4 text-lg font-semibold text-ink">{step.title}</p>
                  <p className="mt-1 text-base text-muted">{step.desc}</p>
                </div>
                {i < t.solution.steps.length - 1 && (
                  <span className="hidden shrink-0 text-2xl text-clinical/40 sm:block">
                    →
                  </span>
                )}
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
