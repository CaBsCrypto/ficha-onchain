"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { truncateHash } from "@/lib/stellar/config";
import { cn } from "@/lib/utils";
import { authedFetch } from "@/lib/auth/authed-fetch";
import {
  LockIcon,
  LockOpenIcon,
  ShieldCheckIcon,
  StethoscopeIcon,
  ClipboardCheckIcon,
} from "@/components/icons/PatientIcons";
import type { AuthorizedDoctor } from "@/components/patient/types";
import { SectionHeader } from "@/components/patient/SectionHeader";
import { type PatientGrant, grantToDoctor } from "@/components/patient/shared";

// ---------------------------------------------------------------------------
// Tab: Mis Accesos (grant / revoke doctor access)
// ---------------------------------------------------------------------------
type AccessRow = {
  accessor: string;
  accessor_role: string;
  action: string;
  detail: string | null;
  created_at: string;
};

const ACCESS_ACTION_LABELS: Record<string, string> = {
  "ficha.entries.read": "Leyó tu historial clínico",
  "ficha.antecedentes.read": "Leyó tus antecedentes",
  "ficha.document.view": "Abrió un examen",
  "mcp.read_records": "Centro externo leyó tu ficha (MCP)",
  "mcp.anchor_record": "Centro externo ancló un registro (MCP)",
};

export function AccesosTab({ wallet: _wallet, mock }: { wallet: string; mock: boolean }) {
  // Grants reales desde patient_grants (+ verificación DoctorRegistry on-chain).
  const [doctors, setDoctors] = useState<AuthorizedDoctor[]>([]);
  const [doctorsLoading, setDoctorsLoading] = useState(true);
  useEffect(() => {
    authedFetch("/api/patient/grants")
      .then((r) => (r.ok ? r.json() : { grants: [] }))
      .then((j: { grants?: PatientGrant[] }) =>
        setDoctors((j.grants ?? []).filter((g) => !g.revoked_at).map(grantToDoctor)),
      )
      .catch(() => setDoctors([]))
      .finally(() => setDoctorsLoading(false));
  }, []);
  // Registro de accesos (Ley 20.584) — real, desde api_access_log.
  const [accesses, setAccesses] = useState<AccessRow[]>([]);
  const [accessesLoading, setAccessesLoading] = useState(true);
  useEffect(() => {
    authedFetch("/api/patient/access-log")
      .then((r) => (r.ok ? r.json() : { accesses: [] }))
      .then((j: { accesses?: AccessRow[] }) => setAccesses(j.accesses ?? []))
      .catch(() => setAccesses([]))
      .finally(() => setAccessesLoading(false));
  }, []);
  const [grantWallet, setGrantWallet] = useState("");
  const [granting, setGranting] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [notice, setNotice] = useState<{
    type: "ok" | "err";
    msg: string;
  } | null>(null);

  async function handleGrant(e: React.FormEvent) {
    e.preventDefault();
    const target = grantWallet.trim();
    if (!target || !target.startsWith("G")) return;
    setGranting(true);
    setNotice(null);
    try {
      const res = await authedFetch("/api/patient/grants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: target }),
      });
      const j = (await res.json()) as {
        mode?: string; reason?: string; error?: string; grant?: PatientGrant;
      };
      if (!res.ok || j.error) throw new Error(j.error ?? "grant_failed");
      if (j.grant) setDoctors((prev) => [grantToDoctor(j.grant!), ...prev]);
      setNotice({
        type: "ok",
        msg:
          j.mode === "onchain"
            ? `Acceso otorgado a ${truncateHash(target, 6, 4)} — grant firmado on-chain en Soroban.`
            : `Acceso registrado para ${truncateHash(target, 6, 4)} (modo simulado: ${j.reason ?? "sin firmante"}).`,
      });
      setGrantWallet("");
    } catch (err) {
      setNotice({
        type: "err",
        msg: err instanceof Error ? err.message : "No se pudo otorgar el acceso.",
      });
    } finally {
      setGranting(false);
    }
  }

  async function handleRevoke(doc: AuthorizedDoctor) {
    setRevoking(doc.wallet);
    setNotice(null);
    try {
      const res = await authedFetch("/api/patient/grants", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: doc.wallet }),
      });
      const j = (await res.json()) as { mode?: string; reason?: string; error?: string };
      if (!res.ok || j.error) throw new Error(j.error ?? "revoke_failed");
      setDoctors((prev) => prev.filter((d) => d.wallet !== doc.wallet));
      setNotice({
        type: "ok",
        msg:
          j.mode === "onchain"
            ? `Acceso revocado para ${doc.name} — revoke firmado on-chain.`
            : `Acceso revocado para ${doc.name} (modo simulado: ${j.reason ?? "sin firmante"}).`,
      });
    } catch (err) {
      setNotice({
        type: "err",
        msg: err instanceof Error ? err.message : "No se pudo revocar el acceso.",
      });
    } finally {
      setRevoking(null);
    }
  }

  return (
    <div className="space-y-5">
      {/* Privacy banner */}
      <div className="flex items-start gap-3 rounded-2xl border border-clinical/20 bg-clinical-50/60 px-4 py-3.5">
        <LockIcon className="mt-0.5 h-4 w-4 shrink-0 text-clinical" />
        <p className="text-xs leading-relaxed text-clinical-600">
          <span className="font-semibold">Tú decides quién ve tu ficha.</span>{" "}
          Cada acceso es un grant on-chain en Soroban. Los médicos sin
          autorización no pueden leer tus datos médicos — ni siquiera el equipo
          de TrustLeaf.
        </p>
      </div>

      {/* Registro de accesos — Ley 20.584: quién miró tu ficha, con datos
          reales de api_access_log (a diferencia del grant demo de más abajo). */}
      <Card>
        <SectionHeader
          icon={<ClipboardCheckIcon className="h-4 w-4 text-clinical" />}
          title="Registro de accesos"
          bg="bg-clinical/10"
        />
        <p className="mt-2 text-xs text-muted">
          Quién ha visto tu información clínica — tu derecho según la Ley 20.584.
        </p>
        {accessesLoading ? (
          <p className="mt-3 text-sm text-muted">Cargando registro…</p>
        ) : accesses.length === 0 ? (
          <p className="mt-3 text-sm text-muted">
            Nadie más que tú ha accedido a tu ficha.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100">
            {accesses.map((a, i) => (
              <li key={i} className="flex items-start justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">
                    {ACCESS_ACTION_LABELS[a.action] ?? a.action}
                  </p>
                  <p className="truncate text-xs text-muted">
                    {a.accessor}
                    {a.detail ? ` · ${a.detail}` : ""}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-muted">
                  {new Date(a.created_at).toLocaleString("es-CL", {
                    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
                  })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Notice */}
      {notice && (
        <div
          className={cn(
            "rounded-xl px-4 py-3 text-xs ring-1 ring-inset",
            notice.type === "ok"
              ? "bg-mint-50 text-mint ring-mint/20"
              : "bg-rose-50 text-rose-600 ring-rose-500/20",
          )}
        >
          {notice.msg}
        </div>
      )}

      {/* Authorized doctors list */}
      <Card className="p-0">
        <div className="flex items-center justify-between border-b border-slate-200/70 px-6 py-5">
          <div>
            <h2 className="text-base font-semibold text-ink">Médicos con acceso</h2>
            <p className="text-xs text-muted">
              {doctors.length === 0
                ? "Aún no has autorizado a ningún médico."
                : `${doctors.length} médico${doctors.length > 1 ? "s" : ""} con acceso a tu ficha`}
            </p>
          </div>
          {mock && <Badge tone="muted">demo</Badge>}
        </div>

        {doctorsLoading ? (
          <p className="px-6 py-8 text-center text-sm text-muted">Cargando accesos…</p>
        ) : doctors.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-muted">
              <LockOpenIcon className="h-6 w-6" />
            </div>
            <p className="text-sm text-muted">
              Usa el formulario abajo para autorizar a tu médico.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100/80">
            {doctors.map((doc) => (
              <div
                key={doc.wallet}
                className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center"
              >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-clinical-50 text-clinical">
                    <StethoscopeIcon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-ink">{doc.name}</p>
                      {doc.verified ? (
                        <Badge tone="mint">
                          <ShieldCheckIcon className="h-3 w-3" /> Verificado
                        </Badge>
                      ) : (
                        <Badge tone="muted">Pendiente</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted">{doc.specialty}</p>
                    <p className="font-mono text-[10px] text-muted/70">
                      {truncateHash(doc.wallet, 6, 4)} · desde {doc.grantedAt}
                    </p>
                  </div>
                </div>
                <button
                  disabled={revoking === doc.wallet}
                  onClick={() => handleRevoke(doc)}
                  className="min-h-[44px] shrink-0 rounded-xl px-3 py-2 text-xs font-medium text-rose-500 ring-1 ring-inset ring-rose-500/30 transition hover:bg-rose-50 disabled:opacity-50"
                >
                  {revoking === doc.wallet ? "Revocando…" : "Revocar acceso"}
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Grant access form */}
      <Card className="p-0">
        <div className="border-b border-slate-200/70 px-6 py-5">
          <h2 className="text-base font-semibold text-ink">Autorizar nuevo médico</h2>
          <p className="text-xs text-muted">
            Ingresa la wallet Stellar (G…) del médico que quieres que acceda a tu ficha.
          </p>
        </div>
        <form onSubmit={handleGrant} className="px-6 py-5">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted">
              Wallet del médico <span className="text-rose-500">*</span>
            </span>
            <input
              value={grantWallet}
              onChange={(e) => setGrantWallet(e.target.value)}
              placeholder="GBQD7XK2Q9YAVN4RPLM8W6H5T…"
              className="h-12 w-full rounded-xl border border-slate-200 bg-white px-3 font-mono text-base text-ink placeholder:font-sans placeholder:text-sm placeholder:text-muted/60 focus:border-clinical focus:outline-none focus:ring-2 focus:ring-clinical/20"
            />
          </label>
          {grantWallet && !grantWallet.startsWith("G") && (
            <p className="mt-1.5 text-xs text-rose-500">Las wallets Stellar empiezan con "G"</p>
          )}
          <div className="mt-4 flex justify-end">
            <Button
              type="submit"
              disabled={granting || !grantWallet.trim() || !grantWallet.startsWith("G")}
            >
              {granting ? "Firmando grant…" : "Autorizar acceso"}
            </Button>
          </div>
        </form>
      </Card>

      <p className="text-center text-xs text-muted/70">
        © 2026 Browns Studio · TrustLeaf · Stellar Testnet
      </p>
    </div>
  );
}
