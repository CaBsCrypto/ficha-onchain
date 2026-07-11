"use client";

import Link from "next/link";
import { useLanguage } from "@/hooks/useLanguage";
import { Navbar } from "@/components/landing/Navbar";
import { Footer } from "@/components/landing/Footer";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Reveal } from "@/components/ui/Reveal";
import { METRICS, STELLAR_EXPLORER_URL } from "@/lib/metrics";

export default function TractionPage() {
  const { t } = useLanguage();
  const page = t.traction;

  /* Stat cards — values live in @/lib/metrics, bump them by hand as we grow.
     `href` turns a card into a link out to the on-chain proof. */
  const stats = [
    { label: page.metrics.prescriptions, value: METRICS.prescriptions.toLocaleString() },
    { label: page.metrics.doctors, value: METRICS.doctors.toLocaleString() },
    {
      label: page.metrics.stellarTx,
      value: METRICS.stellarTx.toLocaleString(),
      href: STELLAR_EXPLORER_URL,
    },
    { label: page.metrics.waitlist, value: METRICS.waitlist.toLocaleString() },
  ];

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
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-clinical opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-clinical" />
                </span>
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

        {/* Metrics grid */}
        <section className="relative py-8">
          <div className="mx-auto max-w-6xl px-6">
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {stats.map((stat, i) => {
                const inner = (
                  <Card interactive className="h-full text-center">
                    <p className="text-5xl font-semibold tracking-tight text-clinical">
                      {stat.value}
                    </p>
                    <p className="mt-3 text-sm font-medium text-muted">
                      {stat.label}
                    </p>
                    {stat.href && (
                      <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-clinical-600">
                        Stellar testnet
                        <span aria-hidden="true">↗</span>
                      </span>
                    )}
                  </Card>
                );
                return (
                  <Reveal key={stat.label} delay={i * 0.08}>
                    {stat.href ? (
                      <a
                        href={stat.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block h-full rounded-3xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-clinical/50 focus-visible:ring-offset-2"
                      >
                        {inner}
                      </a>
                    ) : (
                      inner
                    )}
                  </Reveal>
                );
              })}
            </div>
          </div>
        </section>

        {/* Verified on Stellar */}
        <section className="relative py-12">
          <div className="mx-auto max-w-6xl px-6">
            <Reveal>
              <Card className="overflow-hidden bg-gradient-to-br from-clinical-50 to-white">
                <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
                  <div className="flex items-start gap-4">
                    <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-clinical text-white shadow-sm shadow-clinical/30">
                      <svg
                        viewBox="0 0 24 24"
                        className="h-6 w-6"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
                        <path d="m9 12 2 2 4-4" />
                      </svg>
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-lg font-semibold text-ink">
                          {page.verified.title}
                        </h2>
                        <Badge tone="clinical">Testnet</Badge>
                      </div>
                      <p className="mt-1 max-w-md text-sm leading-relaxed text-muted">
                        {page.verified.desc}
                      </p>
                    </div>
                  </div>
                  <a
                    href={STELLAR_EXPLORER_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-clinical px-6 text-sm font-medium text-white shadow-lg shadow-clinical/25 transition-all duration-200 hover:-translate-y-0.5 hover:bg-clinical-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-clinical/50 focus-visible:ring-offset-2"
                  >
                    {page.verified.cta}
                    <span aria-hidden="true">↗</span>
                  </a>
                </div>
              </Card>
            </Reveal>
          </div>
        </section>

        {/* Chilean compliance */}
        <section className="relative py-12 pb-24">
          <div className="mx-auto max-w-6xl px-6">
            <Reveal>
              <h2 className="text-2xl font-semibold tracking-tight text-ink">
                {page.compliance.title}
              </h2>
              <p className="mt-2 max-w-2xl text-base leading-relaxed text-muted">
                {page.compliance.desc}
              </p>
            </Reveal>

            <div className="mt-8 grid gap-6 sm:grid-cols-3">
              {page.compliance.items.map((item, i) => (
                <Reveal key={item.label} delay={i * 0.08}>
                  <Card className="h-full">
                    <div className="flex items-center gap-3">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-mint-50 text-mint">
                        <svg
                          viewBox="0 0 24 24"
                          className="h-5 w-5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                      </span>
                      <h3 className="text-base font-semibold text-ink">
                        {item.label}
                      </h3>
                    </div>
                    <p className="mt-3 text-sm leading-relaxed text-muted">
                      {item.desc}
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
