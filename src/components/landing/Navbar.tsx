"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "@/hooks/useLanguage";
import { buttonVariants } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { WaitlistModal } from "./WaitlistModal";
import { PrivyLoginButton } from "@/components/auth/PrivyLoginButton";
import type { Language } from "@/types";

/* Soft outline demo buttons — deliberately distinct from the solid primary CTA. */
const demoBase =
  "inline-flex items-center justify-center gap-2 rounded-full border px-4 h-9 text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2";

const demoPatientClass = cn(
  demoBase,
  "border-blue-200 bg-blue-50 text-blue-700 hover:border-blue-300 hover:bg-blue-100 focus-visible:ring-blue-400/50",
);

const demoDoctorClass = cn(
  demoBase,
  "border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-300 hover:bg-emerald-100 focus-visible:ring-emerald-400/50",
);

function LangSwitch() {
  const { lang, setLang } = useLanguage();
  const options: Language[] = ["en", "es"];
  return (
    <div className="flex items-center rounded-full border border-slate-200 bg-white/60 p-0.5 text-xs font-medium">
      {options.map((opt) => (
        <button
          key={opt}
          onClick={() => setLang(opt)}
          aria-pressed={lang === opt}
          className={cn(
            "rounded-full px-2.5 py-1 uppercase transition-colors",
            lang === opt ? "bg-clinical text-white" : "text-muted hover:text-ink",
          )}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

export function Navbar() {
  const { t } = useLanguage();
  const [scrolled, setScrolled] = useState(false);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const links = [
    { href: "#problem", label: t.nav.problem },
    { href: "#solution", label: t.nav.solution },
    { href: "#how", label: t.nav.how },
    { href: "#roadmap", label: t.nav.roadmap },
    { href: "/legal", label: t.nav.legal },
    { href: "/pharmacy", label: t.nav.pharmacy },
  ];

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-all duration-300",
        scrolled ? "glass shadow-sm" : "bg-transparent",
      )}
    >
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <a href="#top" className="group flex items-center gap-2 text-lg font-semibold tracking-tight">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-clinical text-white shadow-sm shadow-clinical/30">
            <span className="text-sm font-bold">T</span>
          </span>
          <span className="text-ink">
            Trust<span className="text-clinical">Leaf</span>
          </span>
        </a>

        <div className="hidden items-center gap-8 md:flex">
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-muted transition-colors hover:text-ink"
            >
              {link.label}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <LangSwitch />
          {/* Demo buttons — inline next to the CTA on large screens.
              Visibility lives on this wrapper so the buttons' own `inline-flex`
              (from demoBase) never clashes with a `hidden` utility. */}
          <div className="hidden items-center gap-2 lg:flex">
            <a href="/demo/paciente" className={demoPatientClass}>
              {t.nav.demoPatient}
            </a>
            <a href="/demo/medico" className={demoDoctorClass}>
              {t.nav.demoDoctor}
            </a>
          </div>
          <PrivyLoginButton />
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className={buttonVariants({ size: "sm" })}
          >
            {t.nav.cta}
          </button>
        </div>
      </nav>

      {/* Demo buttons — collapse into an accessible row below the bar on mobile/tablet */}
      <div className="flex items-center justify-center gap-2 px-6 pb-2 lg:hidden">
        <a href="/demo/paciente" className={cn(demoPatientClass, "flex-1")}>
          {t.nav.demoPatient}
        </a>
        <a href="/demo/medico" className={cn(demoDoctorClass, "flex-1")}>
          {t.nav.demoDoctor}
        </a>
      </div>

      <WaitlistModal open={showModal} onClose={() => setShowModal(false)} />
    </header>
  );
}
