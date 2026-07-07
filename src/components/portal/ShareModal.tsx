"use client";

import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import type { OnChainPrescription } from "@/lib/stellar";

interface ShareState {
  url: string;
  token: string;
  expiresAt: number;
}

export function ShareModal({
  rx,
  patientWallet,
  onClose,
}: {
  rx: OnChainPrescription;
  patientWallet: string;
  onClose: () => void;
}) {
  const [state, setState] = useState<ShareState | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // 1. Request a fresh 15-min share token for this prescription.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/share", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rxId: rx.id, patient: patientWallet }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "No se pudo generar el enlace");
        if (!alive) return;
        setState({
          url: data.url,
          token: data.token,
          expiresAt: Date.now() + data.expiresInSeconds * 1000,
        });
        setQrDataUrl(
          await QRCode.toDataURL(data.url, {
            width: 320,
            margin: 1,
            color: { dark: "#0f172a", light: "#ffffff" },
          }),
        );
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : "Error");
      }
    })();
    return () => {
      alive = false;
    };
  }, [rx.id, patientWallet]);

  // 2. Tick the countdown.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const remaining = useMemo(() => {
    if (!state) return null;
    const secs = Math.max(0, Math.round((state.expiresAt - now) / 1000));
    return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
  }, [state, now]);

  const expired = state ? now >= state.expiresAt : false;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-ink">Compartir receta</h2>
            <p className="text-sm text-muted">{rx.medication}</p>
          </div>
          <button
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-xl text-muted transition-colors hover:bg-slate-100 hover:text-ink"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        <div className="mt-5 flex flex-col items-center">
          {error ? (
            <p className="rounded-xl bg-rose-50 px-4 py-8 text-center text-sm text-rose-600">
              {error}
            </p>
          ) : !qrDataUrl ? (
            <div className="grid h-[280px] w-[280px] place-items-center rounded-2xl bg-slate-50 text-sm text-muted">
              Generando código…
            </div>
          ) : (
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrDataUrl}
                alt="Código QR de la receta"
                width={280}
                height={280}
                className={`rounded-2xl ring-1 ring-slate-200 transition-opacity ${
                  expired ? "opacity-20" : ""
                }`}
              />
              {expired && (
                <div className="absolute inset-0 grid place-items-center">
                  <Badge tone="muted">Enlace expirado</Badge>
                </div>
              )}
            </div>
          )}

          {remaining && !expired && (
            <p className="mt-4 text-sm text-muted">
              Válido por{" "}
              <span className="font-mono font-semibold text-clinical tabular-nums">
                {remaining}
              </span>
            </p>
          )}

          <p className="mt-2 text-center text-xs text-muted/80">
            Un profesional escanea este código para verificar la receta en{" "}
            <span className="font-mono">/verify</span> sin necesidad de login.
          </p>
        </div>

        <div className="mt-5 flex gap-2">
          {state && (
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => navigator.clipboard?.writeText(state.url)}
            >
              Copiar enlace
            </Button>
          )}
          <Button className="flex-1" onClick={onClose}>
            Listo
          </Button>
        </div>
      </div>
    </div>
  );
}
