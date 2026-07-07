"use client";

import { useLanguage } from "@/hooks/useLanguage";
import { Reveal } from "@/components/ui/Reveal";
import { WaitlistForm } from "./WaitlistForm";

export function WaitlistSection() {
  const { t } = useLanguage();

  return (
    <section id="waitlist" className="mx-auto max-w-6xl px-6 py-28 sm:py-32">
      <Reveal>
        <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#1e3a8a] via-[#7c3aed] to-[#0f0f1a] px-6 py-20 text-center sm:px-16">
          <div className="bg-spotlight pointer-events-none absolute inset-0 opacity-60" />
          <div className="relative mx-auto max-w-xl">
            <p className="text-base font-semibold uppercase tracking-wider text-violet-300">
              {t.waitlist.kicker}
            </p>
            <h2 className="mt-3 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              {t.waitlist.title}
            </h2>
            <p className="mt-4 text-xl leading-relaxed text-white/70">
              {t.waitlist.subtitle}
            </p>

            <WaitlistForm />
          </div>
        </div>
      </Reveal>
    </section>
  );
}
