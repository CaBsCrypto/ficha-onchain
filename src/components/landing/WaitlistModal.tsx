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
      style={{ background: "rgba(8,15,30,0.8)", backdropFilter: "blur(10px)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={t.waitlist.title}
    >
      <div
        className="relative w-full max-w-2xl overflow-hidden rounded-3xl shadow-2xl"
        style={{
          background: "linear-gradient(135deg, #04111f 0%, #062440 50%, #041929 100%)",
          border: "1px solid rgba(14,165,233,0.18)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Glow top-left */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background: "radial-gradient(ellipse at 20% 0%, rgba(14,165,233,0.22) 0%, transparent 60%)",
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
          aria-label="Close"
          className="absolute right-4 top-4 z-10 grid h-8 w-8 place-items-center rounded-full text-white/30 transition-colors hover:bg-white/10 hover:text-white"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>

        {/* Two-column layout */}
        <div className="relative grid sm:grid-cols-[1fr_1.15fr]">

          {/* Left — identity */}
          <div className="flex flex-col justify-center px-8 py-10 sm:py-12">
            <div className="mb-5">
              <ShieldIcon />
            </div>
            <p className="text-xs font-semibold uppercase tracking-widest text-sky-400">
              {t.waitlist.kicker}
            </p>
            <h2 className="mt-2 text-2xl font-semibold leading-snug tracking-tight text-white">
              {t.waitlist.title}
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-white/50">
              {t.waitlist.subtitle}
            </p>

            {/* Social proof */}
            <div className="mt-6 flex items-center gap-3">
              <AvatarStack />
              <p className="text-xs text-white/35">
                {t.waitlist.socialProof.replace("{count}", "147")}
              </p>
            </div>
          </div>

          {/* Divider */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-6 left-[calc(50%-0.5px)] hidden w-px sm:block"
            style={{ background: "linear-gradient(to bottom, transparent, rgba(14,165,233,0.2), transparent)" }}
          />

          {/* Right — form */}
          <div className="flex flex-col justify-center px-8 py-10 sm:py-12">
            {status === "done" ? (
              <div className="flex flex-col items-center gap-3 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30">
                  <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-emerald-300">{t.waitlist.success}</p>
              </div>
            ) : (
              <>
                <p className="mb-4 text-sm font-medium text-white/60">
                  {t.lang === "es" ? "Ingresa tu correo para reservar tu lugar" : "Enter your email to reserve your spot"}
                </p>
                <form onSubmit={onSubmit} className="space-y-3" noValidate>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); if (status === "error") setStatus("idle"); }}
                    placeholder={t.waitlist.placeholder}
                    aria-label="Email"
                    aria-invalid={status === "error"}
                    className="w-full rounded-xl border px-4 py-3 text-sm text-white placeholder-white/30 outline-none transition-all focus:ring-2 focus:ring-sky-500/50"
                    style={{
                      background: "rgba(14,165,233,0.06)",
                      borderColor: status === "error" ? "rgba(239,68,68,0.5)" : "rgba(14,165,233,0.2)",
                    }}
                  />
                  <button
                    type="submit"
                    disabled={status === "submitting"}
                    className="w-full rounded-xl py-3 text-sm font-semibold text-white transition-all disabled:opacity-60"
                    style={{
                      background: "linear-gradient(135deg, #0284c7, #0ea5e9)",
                      boxShadow: "0 0 28px rgba(14,165,233,0.35)",
                    }}
                  >
                    {status === "submitting" ? "…" : t.waitlist.cta}
                  </button>
                  {status === "error" && (
                    <p className="text-center text-xs text-rose-400">{t.waitlist.invalid}</p>
                  )}
                </form>

                <p className="mt-5 text-xs text-white/25 text-center">
                  {t.lang === "es" ? "Sin spam. Te contactaremos cuando abramos." : "No spam. We'll reach out when we launch."}
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
