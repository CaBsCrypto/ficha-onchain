"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useLanguage } from "@/hooks/useLanguage";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function ShieldIcon() {
  return (
    <svg viewBox="0 0 48 48" fill="none" className="h-12 w-12" aria-hidden>
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
        stroke="white"
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

function AvatarStack() {
  const colors = ["#0ea5e9", "#8b5cf6", "#10b981", "#f59e0b", "#ef4444"];
  const letters = ["A", "D", "M", "P", "C"];
  return (
    <div className="flex items-center -space-x-2">
      {colors.map((c, i) => (
        <div
          key={i}
          className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-[#1a1040] text-[10px] font-bold text-white"
          style={{ background: c, zIndex: colors.length - i }}
        >
          {letters[i]}
        </div>
      ))}
    </div>
  );
}

export function WaitlistModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useLanguage();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "error" | "submitting" | "done">("idle");

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

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (status === "submitting") return;
    if (!EMAIL_RE.test(email)) { setStatus("error"); return; }
    setStatus("submitting");
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) throw new Error("failed");
      setStatus("done");
      setEmail("");
    } catch {
      setStatus("error");
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={t.waitlist.title}
    >
      <div
        className="relative w-full max-w-md overflow-hidden rounded-3xl text-white shadow-2xl"
        style={{
          background: "linear-gradient(135deg, #0f172a 0%, #1e1b4b 45%, #0f172a 100%)",
          border: "1px solid rgba(148,163,184,0.12)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Glow */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background: "radial-gradient(ellipse at 50% 0%, rgba(99,102,241,0.3) 0%, transparent 65%)",
          }}
        />

        {/* Top accent bar */}
        <div
          aria-hidden
          className="h-px w-full"
          style={{ background: "linear-gradient(90deg, transparent, #818cf8, #38bdf8, transparent)" }}
        />

        {/* Close */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 z-10 grid h-8 w-8 place-items-center rounded-full text-white/40 transition-colors hover:bg-white/10 hover:text-white"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>

        <div className="relative px-8 pb-8 pt-8">
          {/* Icon */}
          <div className="mb-5 flex justify-center">
            <ShieldIcon />
          </div>

          {/* Kicker */}
          <p className="text-center text-xs font-semibold uppercase tracking-widest text-sky-400">
            {t.waitlist.kicker}
          </p>

          {/* Title */}
          <h2 className="mt-2 text-center text-2xl font-semibold leading-snug tracking-tight text-white sm:text-3xl">
            {t.waitlist.title}
          </h2>

          {/* Subtitle */}
          <p className="mx-auto mt-3 max-w-xs text-center text-sm leading-relaxed text-white/55">
            {t.waitlist.subtitle}
          </p>

          {/* Form */}
          {status === "done" ? (
            <div className="mt-7 flex flex-col items-center gap-2">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30">
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              </div>
              <p className="text-center text-sm font-medium text-emerald-300">{t.waitlist.success}</p>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="mt-6 space-y-3" noValidate>
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); if (status === "error") setStatus("idle"); }}
                placeholder={t.waitlist.placeholder}
                aria-label="Email"
                aria-invalid={status === "error"}
                className="w-full rounded-xl border px-4 py-3 text-sm text-white placeholder-white/35 outline-none transition-all focus:ring-2 focus:ring-sky-500/60"
                style={{
                  background: "rgba(255,255,255,0.06)",
                  borderColor: status === "error" ? "rgba(239,68,68,0.6)" : "rgba(255,255,255,0.1)",
                }}
              />
              <button
                type="submit"
                disabled={status === "submitting"}
                className="w-full rounded-xl py-3 text-sm font-semibold text-white transition-all disabled:opacity-60"
                style={{
                  background: "linear-gradient(135deg, #0ea5e9, #6366f1)",
                  boxShadow: "0 0 24px rgba(99,102,241,0.4)",
                }}
              >
                {status === "submitting" ? "…" : t.waitlist.cta}
              </button>
              {status === "error" && (
                <p className="text-center text-xs text-rose-400">{t.waitlist.invalid}</p>
              )}
            </form>
          )}

          {/* Social proof */}
          <div className="mt-6 flex items-center justify-center gap-3">
            <AvatarStack />
            <p className="text-xs text-white/40">
              {t.waitlist.socialProof.replace("{count}", "147")}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
