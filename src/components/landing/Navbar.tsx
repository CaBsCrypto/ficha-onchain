"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "@/hooks/useLanguage";
import { buttonVariants } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { WaitlistModal } from "./WaitlistModal";
import { PrivyLoginButton } from "@/components/auth/PrivyLoginButton";
import type { Language } from "@/types";

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
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 8);
      if (window.scrollY > 8) setMobileOpen(false);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const links = [
    { href: "#problem", label: t.nav.problem },
    { href: "#solution", label: t.nav.solution },
    { href: "#how", label: t.nav.how },
    { href: "#roadmap", label: t.nav.roadmap },
    { href: "/traction", label: t.nav.traction },
    { href: "/verify", label: t.nav.verify },
    { href: "/legal", label: t.nav.legal },
    { href: "/pharmacy", label: t.nav.pharmacy },
  ];

  return (
    <>
      {/* Mobile menu overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <header
        className={cn(
          "fixed inset-x-0 top-0 z-50 transition-all duration-300",
          scrolled ? "glass shadow-sm" : "bg-transparent",
        )}
      >
        <nav className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:h-16 sm:px-6">
          {/* Logo */}
          <a href="#top" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-clinical text-white shadow-sm shadow-clinical/30">
              <span className="text-sm font-bold">T</span>
            </span>
            <span className="text-ink">
              Trust<span className="text-clinical">Leaf</span>
            </span>
          </a>

          {/* Desktop nav links */}
          <div className="hidden items-center gap-6 md:flex lg:gap-8">
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

          {/* Right side */}
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="hidden sm:block">
              <LangSwitch />
            </div>

            <div className="hidden sm:block">
              <PrivyLoginButton />
            </div>
            <button
              type="button"
              onClick={() => setShowModal(true)}
              className={cn(buttonVariants({ size: "sm" }), "hidden sm:inline-flex")}
            >
              {t.nav.cta}
            </button>

            {/* Hamburger — mobile only */}
            <button
              type="button"
              onClick={() => setMobileOpen((v) => !v)}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white/80 text-slate-600 transition-colors hover:bg-white md:hidden"
              aria-label="Menú"
            >
              {mobileOpen ? (
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                  <path d="M3 6h18M3 12h18M3 18h18" />
                </svg>
              )}
            </button>
          </div>
        </nav>

        {/* Mobile dropdown menu */}
        <div
          className={cn(
            "overflow-hidden transition-all duration-300 md:hidden",
            mobileOpen ? "max-h-[400px] opacity-100" : "max-h-0 opacity-0",
          )}
        >
          <div className="border-t border-slate-100 bg-white/95 backdrop-blur-sm px-4 py-4 space-y-1">
            {links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className="block rounded-xl px-4 py-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 hover:text-clinical"
              >
                {link.label}
              </a>
            ))}
            <div className="mt-3 pt-3 border-t border-slate-100 flex flex-col gap-2">

              <div className="flex items-center justify-between gap-2">
                <LangSwitch />
                <button
                  type="button"
                  onClick={() => { setShowModal(true); setMobileOpen(false); }}
                  className={buttonVariants({ size: "sm" })}
                >
                  {t.nav.cta}
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <WaitlistModal open={showModal} onClose={() => setShowModal(false)} />
    </>
  );
}
