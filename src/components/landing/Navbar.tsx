"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "@/hooks/useLanguage";
import { cn } from "@/lib/utils";
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

// ── Verify modal (HowItWorks inline) ─────────────────────────────────────────
function VerifyModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, lang } = useLanguage();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  const steps = [
    {
      icon: (
        <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden>
          <rect x="5" y="2" width="14" height="20" rx="2" stroke="currentColor" strokeWidth="1.7" />
          <path d="M9 7h6M9 11h6M9 15h4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      ),
      title: lang === "es" ? "El médico emite una receta" : "Doctor issues a prescription",
      body: lang === "es"
        ? "La prescripción queda registrada en un contrato inteligente en Stellar Soroban — inmutable y verificable."
        : "The prescription is recorded in a smart contract on Stellar Soroban — immutable and verifiable.",
    },
    {
      icon: (
        <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden>
          <rect x="3" y="3" width="8" height="8" rx="1" stroke="currentColor" strokeWidth="1.7" />
          <rect x="13" y="3" width="8" height="8" rx="1" stroke="currentColor" strokeWidth="1.7" />
          <rect x="3" y="13" width="8" height="8" rx="1" stroke="currentColor" strokeWidth="1.7" />
          <path d="M13 17h2m4 0h-2m0 0v-4m0 4v4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      ),
      title: lang === "es" ? "El paciente genera un QR" : "Patient generates a QR",
      body: lang === "es"
        ? "Desde su portal, el paciente comparte un enlace de verificación con validez de 15 minutos."
        : "From their portal, the patient shares a verification link valid for 15 minutes.",
    },
    {
      icon: (
        <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden>
          <path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
          <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
      title: lang === "es" ? "La farmacia verifica aquí" : "Pharmacy verifies here",
      body: lang === "es"
        ? "Esta página lee la receta directo desde la blockchain — sin intermediarios, sin bases de datos propietarias."
        : "This page reads the prescription straight from the blockchain — no intermediaries, no proprietary databases.",
    },
  ];

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="relative w-full max-w-md overflow-hidden rounded-3xl shadow-2xl"
        style={{
          background: "linear-gradient(160deg, #04111f 0%, #062440 55%, #0c3a5e 100%)",
          border: "1px solid rgba(14,165,233,0.2)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Glow */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(14,165,233,0.28) 0%, transparent 65%)" }}
        />

        {/* Top accent bar */}
        <div
          aria-hidden
          className="h-px w-full"
          style={{ background: "linear-gradient(90deg, transparent, #38bdf8, #0ea5e9, transparent)" }}
        />

        {/* Close */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 z-10 grid h-8 w-8 place-items-center rounded-full text-white/30 transition-colors hover:bg-white/10 hover:text-white"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>

        {/* Header */}
        <div className="relative px-6 pt-8 pb-6 text-center">
          {/* Shield icon */}
          <div
            className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl text-white"
            style={{
              background: "linear-gradient(135deg, #0284c7, #0ea5e9)",
              boxShadow: "0 0 32px rgba(14,165,233,0.45)",
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" className="h-7 w-7" aria-hidden>
              <path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
              <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>

          <p className="text-xs font-semibold uppercase tracking-widest text-sky-400">
            {lang === "es" ? "Verificador de recetas" : "Prescription Verifier"}
          </p>
          <h2 className="mt-1.5 text-xl font-semibold text-white">
            {lang === "es"
              ? "Verificación directa desde blockchain"
              : "Direct blockchain verification"}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-white/50">
            {lang === "es"
              ? "Escanea el QR del paciente para ver su receta verificada en Stellar Soroban."
              : "Scan the patient's QR to view their prescription verified on Stellar Soroban."}
          </p>
        </div>

        {/* Divider */}
        <div
          aria-hidden
          className="mx-6 h-px"
          style={{ background: "linear-gradient(90deg, transparent, rgba(14,165,233,0.25), transparent)" }}
        />

        {/* Steps */}
        <div className="px-6 py-4 space-y-1">
          {steps.map((step, i) => (
            <div key={i} className="flex items-start gap-4 rounded-2xl px-3 py-3.5 transition-colors hover:bg-white/5">
              <div
                className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sky-300"
                style={{ background: "rgba(14,165,233,0.12)", border: "1px solid rgba(14,165,233,0.2)" }}
              >
                {step.icon}
              </div>
              <div>
                <p className="text-sm font-medium text-white/90">{step.title}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-white/40">{step.body}</p>
              </div>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div
          className="mx-4 mb-4 mt-1 rounded-2xl px-5 py-3.5 text-center"
          style={{ background: "rgba(14,165,233,0.08)", border: "1px solid rgba(14,165,233,0.15)" }}
        >
          <p className="text-xs text-white/40">
            {lang === "es" ? "¿Eres farmacéutico? " : "Are you a pharmacist? "}
            <a href="/pharmacy" className="font-medium text-sky-400 hover:text-sky-300 transition-colors">
              {lang === "es" ? "Accede al portal →" : "Access the portal →"}
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export function Navbar() {
  const { t } = useLanguage();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [verifyOpen, setVerifyOpen] = useState(false);

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
    { href: null, label: t.nav.verify, onClick: () => setVerifyOpen(true) },
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
            {links.map((link) =>
              link.onClick ? (
                <button
                  key={link.label}
                  type="button"
                  onClick={link.onClick}
                  className="text-sm font-medium text-muted transition-colors hover:text-ink"
                >
                  {link.label}
                </button>
              ) : (
                <a
                  key={link.href}
                  href={link.href!}
                  className="text-sm font-medium text-muted transition-colors hover:text-ink"
                >
                  {link.label}
                </a>
              )
            )}
          </div>

          {/* Right side */}
          <div className="flex items-center gap-2 sm:gap-3">
            <PrivyLoginButton />
            <div className="hidden sm:block">
              <LangSwitch />
            </div>

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
            {links.map((link) =>
              link.onClick ? (
                <button
                  key={link.label}
                  type="button"
                  onClick={() => { link.onClick!(); setMobileOpen(false); }}
                  className="block w-full text-left rounded-xl px-4 py-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 hover:text-clinical"
                >
                  {link.label}
                </button>
              ) : (
                <a
                  key={link.href}
                  href={link.href!}
                  onClick={() => setMobileOpen(false)}
                  className="block rounded-xl px-4 py-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 hover:text-clinical"
                >
                  {link.label}
                </a>
              )
            )}
            <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-2">
              <LangSwitch />
            </div>
          </div>
        </div>
      </header>

      <VerifyModal open={verifyOpen} onClose={() => setVerifyOpen(false)} />
    </>
  );
}
