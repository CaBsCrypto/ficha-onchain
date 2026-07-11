"use client";

import { useLanguage } from "@/hooks/useLanguage";
import { Reveal } from "@/components/ui/Reveal";
import { METRICS } from "@/lib/metrics";
import { WaitlistForm } from "./WaitlistForm";

export function WaitlistSection() {
  const { t } = useLanguage();
  const count = METRICS.waitlist.toLocaleString();
  const [proofBefore, proofAfter] = t.waitlist.socialProof.split("{count}");

  return (
    <section id="waitlist" className="mx-auto max-w-6xl px-6 py-16 sm:py-24 lg:py-32">
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

            {/* Social-proof counter — light pill reads as a celeste accent
                against the dark gradient. Number lives in @/lib/metrics. */}
            <p className="mx-auto mt-8 inline-flex items-center gap-2.5 rounded-full bg-white/95 px-5 py-2.5 text-sm font-medium text-ink shadow-lg shadow-clinical/10 ring-1 ring-inset ring-white/50">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-mint opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-mint" />
              </span>
              <span>
                {proofBefore}
                <span className="font-semibold text-clinical">{count}</span>
                {proofAfter}
              </span>
            </p>

            <WaitlistForm />
          </div>
        </div>
      </Reveal>
    </section>
  );
}
