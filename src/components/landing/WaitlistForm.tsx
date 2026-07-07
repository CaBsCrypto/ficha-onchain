"use client";

import { useState, type FormEvent } from "react";
import { useLanguage } from "@/hooks/useLanguage";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Shared waitlist email form — used by both the on-page section and the
 * navbar modal so the input, button, and submit logic never drift apart.
 * Colors assume a dark blue→purple gradient background.
 */
export function WaitlistForm() {
  const { t } = useLanguage();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "error" | "submitting" | "done">(
    "idle",
  );

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (status === "submitting") return;
    if (!EMAIL_RE.test(email)) {
      setStatus("error");
      return;
    }
    setStatus("submitting");
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) throw new Error("request failed");
      setStatus("done");
      setEmail("");
    } catch {
      // Network / server error — surface the same inline error as invalid input.
      setStatus("error");
    }
  }

  if (status === "done") {
    return (
      <p className="mt-8 inline-flex items-center gap-2 rounded-full bg-mint/15 px-5 py-3 text-sm font-medium text-mint">
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
        {t.waitlist.success}
      </p>
    );
  }

  return (
    <>
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
          className="h-14 flex-1 rounded-full border border-white/20 bg-white/10 px-6 text-white placeholder-white/50 focus:border-white/40 focus:outline-none focus:ring-2 focus:ring-white/30"
        />
        <button
          type="submit"
          disabled={status === "submitting"}
          className="inline-flex h-14 items-center justify-center rounded-full bg-white px-8 text-base font-medium text-[#4c1d95] transition-all duration-200 hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 disabled:opacity-70"
        >
          {status === "submitting" ? "…" : t.waitlist.cta}
        </button>
      </form>

      {status === "error" && (
        <p className="mt-3 text-sm text-rose-300">{t.waitlist.invalid}</p>
      )}
    </>
  );
}
