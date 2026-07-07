"use client";

import Link from "next/link";
import { useLanguage } from "@/hooks/useLanguage";
import { Navbar } from "@/components/landing/Navbar";
import { Footer } from "@/components/landing/Footer";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Reveal } from "@/components/ui/Reveal";
import { Icon, type IconName } from "@/components/legal/LegalIcons";

/* Icons matched by index to t.legal.page.available / .upcoming. */
const availableIcons: IconName[] = [
  "prescription",
  "signature",
  "scan",
  "clipboardCheck",
];
const upcomingIcons: IconName[] = ["scale", "bell", "report"];

export default function LegalPage() {
  const { t } = useLanguage();
  const page = t.legal.page;

  return (
    <>
      <Navbar />
      <main className="flex-1">
        {/* Header */}
        <section className="relative overflow-hidden pt-36 pb-16 sm:pt-40">
          <div className="absolute inset-0 bg-grid opacity-60" />
          <div className="absolute inset-0 bg-spotlight" />
          <div className="relative mx-auto max-w-4xl px-6 text-center">
            <Reveal>
              <span className="inline-flex items-center gap-2 rounded-full bg-clinical-50 px-4 py-1.5 text-sm font-medium text-clinical-600 ring-1 ring-inset ring-clinical/20">
                <Icon name="shield" className="h-4 w-4" />
                {page.badge}
              </span>
              <h1 className="mt-6 text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
                {page.title}
              </h1>
              <p className="mx-auto mt-4 max-w-2xl text-xl leading-relaxed text-muted">
                {page.subtitle}
              </p>
            </Reveal>
          </div>
        </section>

        {/* Active features */}
        <section className="relative py-12">
          <div className="mx-auto max-w-6xl px-6">
            <Reveal className="flex flex-wrap items-center gap-3">
              <h2 className="text-2xl font-semibold tracking-tight text-ink">
                {page.availableTitle}
              </h2>
              <Badge tone="mint">
                <span className="h-1.5 w-1.5 rounded-full bg-mint" />
                {page.availableBadge}
              </Badge>
            </Reveal>

            <div className="mt-8 grid gap-6 sm:grid-cols-2">
              {page.available.map((feat, i) => (
                <Reveal key={feat.title} delay={i * 0.08}>
                  <Card interactive className="h-full">
                    <div className="flex items-start justify-between gap-4">
                      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-mint-50 text-mint">
                        <Icon name={availableIcons[i]} className="h-6 w-6" />
                      </span>
                      <Badge tone="mint">
                        <span className="h-1.5 w-1.5 rounded-full bg-mint" />
                        {page.availableBadge}
                      </Badge>
                    </div>
                    <h3 className="mt-5 text-lg font-semibold text-ink">
                      {feat.title}
                    </h3>
                    <p className="mt-2 text-base leading-relaxed text-muted">
                      {feat.desc}
                    </p>
                  </Card>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* In-development features */}
        <section className="relative py-12 pb-24">
          <div className="mx-auto max-w-6xl px-6">
            <Reveal className="flex flex-wrap items-center gap-3">
              <h2 className="text-2xl font-semibold tracking-tight text-ink">
                {page.soonTitle}
              </h2>
              <Badge tone="amber">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                {page.soonBadge}
              </Badge>
            </Reveal>

            <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {page.upcoming.map((feat, i) => (
                <Reveal key={feat.title} delay={i * 0.08}>
                  <Card className="h-full border-dashed bg-amber-50/30">
                    <div className="flex items-start justify-between gap-4">
                      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-amber-50 text-amber-600">
                        <Icon name={upcomingIcons[i]} className="h-6 w-6" />
                      </span>
                      <Badge tone="amber">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                        {page.soonBadge}
                      </Badge>
                    </div>
                    <h3 className="mt-5 text-lg font-semibold text-ink">
                      {feat.title}
                    </h3>
                    <p className="mt-2 text-base leading-relaxed text-muted">
                      {feat.desc}
                    </p>
                  </Card>
                </Reveal>
              ))}
            </div>

            <Reveal className="mt-14 text-center">
              <Link
                href="/"
                className="inline-flex items-center gap-2 text-base font-semibold text-clinical transition-colors hover:text-clinical-600"
              >
                <span aria-hidden="true">←</span>
                {page.back}
              </Link>
            </Reveal>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
