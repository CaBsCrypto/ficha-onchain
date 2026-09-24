"use client";

import { useLanguage } from "@/hooks/useLanguage";
import { Reveal } from "@/components/ui/Reveal";

import { WaitlistForm } from "./WaitlistForm";

export function WaitlistSection() {
  const { t } = useLanguage();


  return (
    <section id="waitlist" className="mx-auto max-w-6xl px-6 py-16 sm:py-24 lg:py-32">
      <Reveal>
        <div className="relative overflow-hidden rounded-[2rem] border border-sky-100 bg-gradient-to-br from-sky-50 via-white to-sky-50 px-6 py-20 text-center shadow-sm sm:px-16">
          <div className="relative mx-auto max-w-xl">
            <p className="text-base font-semibold uppercase tracking-wider text-sky-700">
              {t.waitlist.kicker}
            </p>
            <h2 className="mt-3 text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">
              {t.waitlist.title}
            </h2>
            <p className="mt-4 text-xl leading-relaxed text-slate-600">
              {t.waitlist.subtitle}
            </p>

            <WaitlistForm tone="light" />
          </div>
        </div>
      </Reveal>
    </section>
  );
}
