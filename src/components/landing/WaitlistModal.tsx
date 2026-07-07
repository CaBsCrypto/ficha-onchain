"use client";

import { useEffect } from "react";
import { useLanguage } from "@/hooks/useLanguage";
import { WaitlistForm } from "./WaitlistForm";

/**
 * Waitlist popup — mirrors the WaitlistSection container styling and reuses
 * the shared WaitlistForm. Closes on overlay click, the X button, or Escape.
 */
export function WaitlistModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useLanguage();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={t.waitlist.title}
    >
      <div
        className="relative w-full max-w-lg overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#1e3a8a] via-[#7c3aed] to-[#0f0f1a] px-6 py-12 text-center shadow-2xl sm:px-12"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-spotlight pointer-events-none absolute inset-0 opacity-60" />

        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 z-10 grid h-9 w-9 place-items-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>

        <div className="relative mx-auto max-w-md">
          <p className="text-base font-semibold uppercase tracking-wider text-violet-300">
            {t.waitlist.kicker}
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            {t.waitlist.title}
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-white/70">
            {t.waitlist.subtitle}
          </p>

          <WaitlistForm />
        </div>
      </div>
    </div>
  );
}
