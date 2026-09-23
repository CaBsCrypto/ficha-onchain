"use client";

import { useEffect, useRef } from "react";
import { useLanguage } from "@/hooks/useLanguage";

import { WaitlistForm } from "./WaitlistForm";

function ShieldIcon() {
  return (
    <svg viewBox="0 0 48 48" fill="none" className="h-8 w-8" aria-hidden>
      <path
        d="M24 4L8 10v14c0 10 7 18.4 16 21 9-2.6 16-11 16-21V10L24 4z"
        fill="url(#shieldGrad)"
        opacity="0.25"
      />
      <path
        d="M24 4L8 10v14c0 10 7 18.4 16 21 9-2.6 16-11 16-21V10L24 4z"
        stroke="url(#shieldGrad)"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M17 24l5 5 9-10"
        stroke="#0284c7"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <defs>
        <linearGradient id="shieldGrad" x1="8" y1="4" x2="40" y2="39" gradientUnits="userSpaceOnUse">
          <stop stopColor="#38bdf8" />
          <stop offset="1" stopColor="#818cf8" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function WaitlistModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { t, lang } = useLanguage();
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    dialog.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === 'Tab') {
        const items = [...(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), summary, a[href]') ?? [])];
        const first = items[0], last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      previous?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: "rgba(15,23,42,0.32)", backdropFilter: "blur(6px)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={t.waitlist.title}
    >
      <div
        ref={dialog}
        className="relative flex max-h-[calc(100dvh-2rem)] w-full max-w-[480px] flex-col overflow-hidden rounded-3xl shadow-2xl shadow-slate-900/15"
        style={{
          background: "linear-gradient(135deg, #f0f9ff 0%, #ffffff 65%, #f8fafc 100%)",
          border: "1px solid rgba(14,165,233,0.18)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Glow top-left */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background: "radial-gradient(ellipse at 20% 0%, rgba(14,165,233,0.06) 0%, transparent 60%)",
          }}
        />

        {/* Top accent bar */}
        <div
          aria-hidden
          className="h-px w-full"
          style={{ background: "linear-gradient(90deg, transparent, #0ea5e9, #38bdf8, transparent)" }}
        />

        {/* Close */}
        <button
          type="button"
          onClick={onClose}
          aria-label={lang === 'pt' ? 'Fechar' : lang === 'es' ? 'Cerrar' : 'Close'}
          className="absolute right-4 top-4 z-10 grid h-11 w-11 place-items-center rounded-full bg-white/95 text-slate-500 transition-colors hover:bg-sky-100 hover:text-sky-800 focus-visible:outline-2 focus-visible:outline-sky-600"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>

        <div className="relative overflow-y-auto overscroll-contain px-6 pb-6 pt-6 sm:px-8 sm:pb-8">
          <div className="pr-12">
            <ShieldIcon />
            <p className="mt-4 text-xs font-semibold uppercase tracking-widest text-sky-700">
              {t.waitlist.kicker}
            </p>
            <h2 className="mt-2 text-2xl font-semibold leading-snug tracking-tight text-ink">
              {t.waitlist.title}
            </h2>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-slate-600">
            {t.waitlist.subtitle}
          </p>
          <WaitlistForm compact tone="light" />
        </div>
      </div>
    </div>
  );
}
