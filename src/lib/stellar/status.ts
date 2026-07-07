/** Display metadata for the on-chain prescription Status enum. Browser-safe. */
import type { RxStatus } from "./client";

export interface StatusMeta {
  label: string;
  /** true when the prescription can still be dispensed / is not revoked. */
  active: boolean;
  tone: "mint" | "clinical" | "amber" | "rose" | "muted";
}

export const STATUS_META: Record<RxStatus, StatusMeta> = {
  Registrada: { label: "Registrada", active: true, tone: "clinical" },
  Activa: { label: "Activa", active: true, tone: "mint" },
  ConsumoParcial: { label: "Consumo parcial", active: true, tone: "amber" },
  Bloqueada: { label: "Bloqueada", active: false, tone: "rose" },
  Quemada: { label: "Consumida", active: false, tone: "muted" },
  Revocada: { label: "Revocada", active: false, tone: "rose" },
};

export function statusMeta(status: RxStatus): StatusMeta {
  return STATUS_META[status] ?? STATUS_META.Registrada;
}

/** Ledger timestamp (unix seconds) → localized date string. */
export function formatLedgerDate(ts: number, locale = "es-CL"): string {
  if (!ts) return "—";
  return new Date(ts * 1000).toLocaleDateString(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
