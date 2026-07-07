"use client";

import { useLanguage } from "@/hooks/useLanguage";
import { Reveal } from "@/components/ui/Reveal";
import { Badge } from "@/components/ui/Badge";
import { SectionHeading } from "./SectionHeading";
import { Icon, type IconName } from "@/components/legal/LegalIcons";

/* One icon per compliance point, matched by index to t.legal.compliance. */
const complianceIcons: IconName[] = ["shieldCheck", "scale", "link", "leaf"];

export function LegalSection() {
  const { t } = useLanguage();
  const legal = t.legal;

  return (
    <section id="legal" className="relative overflow-hidden py-28 sm:py-32">
      <div className="absolute inset-0 bg-gradient-to-b from-mint-50/40 to-clinical-50/50" />
      <div className="relative mx-auto max-w-6xl px-6">
        <SectionHeading
          kicker={legal.kicker}
          title={legal.title}
          subtitle={legal.subheading}
        />

        <div className="mt-16 grid gap-6 lg:grid-cols-2 lg:items-stretch">
          {/* Compliance checklist */}
          <Reveal className="h-full">
            <div className="glass flex h-full flex-col rounded-3xl p-8">
              <div className="flex items-start gap-4">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-clinical text-white shadow-md shadow-clinical/25">
                  <Icon name="shield" className="h-6 w-6" />
                </span>
                <h3 className="text-xl font-semibold leading-snug text-ink">
                  {legal.heading}
                </h3>
              </div>

              <ul className="mt-8 grid gap-4 sm:grid-cols-2">
                {legal.compliance.map((item, i) => (
                  <li
                    key={item.label}
                    className="flex items-center gap-3 rounded-2xl border border-slate-200/70 bg-white/70 px-4 py-3"
                  >
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-mint-50 text-mint">
                      <Icon name={complianceIcons[i]} className="h-5 w-5" />
                    </span>
                    <span className="flex-1 text-sm font-medium text-ink">
                      {item.label}
                    </span>
                    <Icon name="check" className="h-5 w-5 shrink-0 text-mint" />
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>

          {/* Cannabis medicine highlight card */}
          <Reveal delay={0.1} className="h-full">
            <div className="relative flex h-full flex-col overflow-hidden rounded-3xl border border-mint/20 bg-gradient-to-br from-mint-50 to-white p-8 shadow-sm">
              <div className="absolute -right-6 -top-6 h-28 w-28 rounded-full bg-mint/10 blur-2xl" />
              <div className="relative flex items-center gap-3">
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-mint text-white shadow-md shadow-mint/25">
                  <Icon name="leaf" className="h-6 w-6" />
                </span>
                <span className="text-sm font-semibold uppercase tracking-wider text-mint">
                  {legal.cannabis.title}
                </span>
              </div>

              <p className="relative mt-6 text-2xl font-semibold leading-snug text-ink">
                {legal.cannabis.copy}
              </p>

              <div className="relative mt-auto pt-8">
                <Badge tone="amber">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                  {legal.soon}
                </Badge>
              </div>
            </div>
          </Reveal>
        </div>

        <Reveal delay={0.15} className="mt-10 text-center">
          <a
            href="/legal"
            className="inline-flex items-center gap-2 text-base font-semibold text-clinical transition-colors hover:text-clinical-600"
          >
            {legal.cta}
            <span aria-hidden="true">→</span>
          </a>
        </Reveal>
      </div>
    </section>
  );
}
