"use client";

import { useState, type FormEvent } from "react";
import { useLanguage } from "@/hooks/useLanguage";
import { Button } from "@/components/ui/Button";
import { Reveal } from "@/components/ui/Reveal";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function WaitlistSection() {
  const { t } = useLanguage();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "error" | "done">("idle");

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!EMAIL_RE.test(email)) {
      setStatus("error");
      return;
    }
    // TODO: POST to /api/waitlist — stored client-side for now.
    setStatus("done");
    setEmail("");
  }

  return (
    <section id="waitlist" className="mx-auto max-w-6xl px-6 py-24 sm:py-28">
      <Reveal>
        <div className="relative overflow-hidden rounded-[2rem] bg-ink px-6 py-16 text-center sm:px-16">
          <div className="bg-spotlight pointer-events-none absolute inset-0 opacity-60" />
          <div className="relative mx-auto max-w-xl">
            <p className="text-sm font-semibold uppercase tracking-wider text-clinical">
              {t.waitlist.kicker}
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              {t.waitlist.title}
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-slate-300">
              {t.waitlist.subtitle}
            </p>

            {status === "done" ? (
              <p className="mt-8 inline-flex items-center gap-2 rounded-full bg-mint/15 px-5 py-3 text-sm font-medium text-mint">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
                {t.waitlist.success}
              </p>
            ) : (
              <form
                onSubmit={onSubmit}
                className="mx-auto mt-8 flex max-w-md flex-col gap-3 sm:flex-row"
                noValidate
              >
                <input
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (status === "error") setStatus("idle");
                  }}
                  placeholder={t.waitlist.placeholder}
                  aria-label="Email"
                  aria-invalid={status === "error"}
                  className="h-14 flex-1 rounded-full border border-white/15 bg-white/5 px-6 text-white placeholder:text-slate-400 focus:border-clinical focus:outline-none focus:ring-2 focus:ring-clinical/40"
                />
                <Button type="submit" size="lg">
                  {t.waitlist.cta}
                </Button>
              </form>
            )}

            {status === "error" && (
              <p className="mt-3 text-sm text-rose-400">{t.waitlist.invalid}</p>
            )}
          </div>
        </div>
      </Reveal>
    </section>
  );
}
