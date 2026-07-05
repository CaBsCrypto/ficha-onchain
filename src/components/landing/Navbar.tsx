"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "@/hooks/useLanguage";
import { buttonVariants } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
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
            <span className="text-sm font-bold">f</span>
          </span>
          <span className="text-ink">
            ficha <span className="text-slate-300">|</span>{" "}
            <span className="text-clinical">onchain</span>
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

        <div className="flex items-center gap-3">
          <LangSwitch />
          <a href="#waitlist" className={buttonVariants({ size: "sm" })}>
            {t.nav.cta}
          </a>
        </div>
      </nav>
    </header>
  );
}
