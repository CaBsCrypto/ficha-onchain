"use client";

import { useCallback, useEffect, useMemo, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { ShareModal } from "@/components/portal/ShareModal";
import { truncateHash } from "@/lib/stellar/config";
import type { OnChainPrescription } from "@/lib/stellar";
import type { Consultation } from "@/lib/consultations/store";
import { clearSession, loadSession, type PasskeySession } from "@/lib/passkey";
import { usePrivy, useLogout } from "@privy-io/react-auth";
import { usePrivyEmail } from "@/hooks/usePrivyEmail";
import { authedFetch } from "@/lib/auth/authed-fetch";

import {
  type PatientRx,
  type AuthorizedDoctor,
} from "@/components/patient/types";
import { type PatientGrant, grantToDoctor } from "@/components/patient/shared";
import { RxPharmacyModal } from "@/components/patient/RxPharmacyModal";
import { HealthTimelineView } from "@/components/patient/HealthTimelineView";
import { FichaChatWidget } from "@/components/patient/FichaChatWidget";
import { InicioTab } from "@/components/patient/tabs/InicioTab";
import { RecetasTab } from "@/components/patient/tabs/RecetasTab";
import { FichaTab } from "@/components/patient/tabs/FichaTab";
import { LicenciasTab } from "@/components/patient/tabs/LicenciasTab";
import { AccesosTab } from "@/components/patient/tabs/AccesosTab";
import { ConsultasTab } from "@/components/patient/tabs/ConsultasTab";

type Tab = "inicio" | "recetas" | "licencias" | "ficha" | "timeline" | "chat" | "accesos" | "consultas";

// ---------------------------------------------------------------------------
// Root — session gate
// ---------------------------------------------------------------------------
export default function PatientPortal() {
  const { authenticated, getAccessToken } = usePrivy();
  const { logout: privyLogout } = useLogout({ onSuccess: () => router.push("/") });
  const router = useRouter();
  const [session, setSession] = useState<PasskeySession | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // If there's an existing passkey session, use it immediately
    const existing = loadSession("patient");
    if (existing) {
      setSession(existing);
      setReady(true);
      return;
    }

    if (!authenticated) {
      setReady(true);
      return;
    }

    // Privy-authenticated user: fetch their real Stellar wallet
    // Retry up to 3 times — new users need a moment for Privy to finish setup
    (async () => {
      const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
      let address: string | null = null;

      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const token = await getAccessToken();
          const res = await fetch("/api/privy/stellar-wallet", {
            headers: { Authorization: `Bearer ${token}` },
          });
          const data = await res.json() as { address?: string; error?: string };
          if (data.address) { address = data.address; break; }
          if (attempt < 2) await delay(2000);
        } catch {
          if (attempt < 2) await delay(2000);
        }
      }

      if (address) {
        setSession({ role: "patient", address, mock: false });
      } else {
        console.warn("[PatientPortal] stellar wallet unavailable — demo mode");
        setSession({
          role: "patient",
          address:
            process.env.NEXT_PUBLIC_DEMO_PATIENT_WALLET ??
            "GD7WGS7MACGCZCECTNO5V3CH3FORZ2JQYILB5VDCQOYYEAJQOS2V4ZFW",
          mock: true,
        });
      }
      setReady(true);
    })();
  }, [authenticated, getAccessToken]);

  // Extract display email from Privy user
  const privyEmail = usePrivyEmail();

  if (!ready) return null;
  // No session and not authenticated → go to landing
  if (!session) {
    router.push("/");
    return null;
  }
  return (
    <PatientDashboard
      session={session}
      privyEmail={privyEmail}
      onLogout={() => {
        clearSession();
        setSession(null);
        privyLogout(); // logs out from Privy + redirects to /
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Dashboard shell
// ---------------------------------------------------------------------------
function PatientDashboardInner({
  session,
  onLogout,
  privyEmail,
}: {
  session: PasskeySession;
  onLogout: () => void;
  privyEmail?: string | null;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tab = (searchParams.get("tab") as Tab) ?? "inicio";
  const [items, setItems] = useState<PatientRx[] | null>(null);
  const [rxError, setRxError] = useState<string | null>(null);
  const [share, setShare] = useState<OnChainPrescription | null>(null);
  const [pharmacyRx, setPharmacyRx] = useState<PatientRx | null>(null);
  const [consultations, setConsultations] = useState<Consultation[]>([]);

  // Authorized doctors — real grants from patient_grants (Inicio summary).
  const [authorizedDoctors, setAuthorizedDoctors] = useState<AuthorizedDoctor[]>([]);
  useEffect(() => {
    authedFetch("/api/patient/grants")
      .then((r) => (r.ok ? r.json() : { grants: [] }))
      .then((j: { grants?: PatientGrant[] }) =>
        setAuthorizedDoctors(
          (j.grants ?? []).filter((g) => !g.revoked_at).map(grantToDoctor),
        ),
      )
      .catch(() => setAuthorizedDoctors([]));
  }, []);

  const loadRx = useCallback(async () => {
    setItems(null);
    setRxError(null);
    try {
      const res = await authedFetch(
        `/api/prescriptions?role=patient&wallet=${session.address}`,
      );
      const data = await res.json();
      setItems(data.prescriptions ?? []);
      if (data.error) setRxError(data.error);
    } catch {
      setRxError("No se pudieron cargar las recetas");
      setItems([]);
    }
  }, [session.address]);

  useEffect(() => {
    loadRx();
  }, [loadRx]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await authedFetch(
          `/api/consultations?patientWallet=${encodeURIComponent(session.address)}`,
        );
        const data = await res.json();
        if (!cancelled && Array.isArray(data.data)) {
          setConsultations(data.data as Consultation[]);
        }
      } catch {
        // Non-critical
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session.address]);

  // Active RX count (not expired)
  const activeRxCount = useMemo(
    () => items?.filter((rx) => !rx.expired).length ?? 0,
    [items],
  );

  // Info bar — user identity shown above tab content
  const [copied, setCopied] = useState(false);
  function copyAddress() {
    navigator.clipboard.writeText(session.address).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div>
      {/* Session info bar */}
      <div className="mb-4 flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-2.5">
        <div className="flex items-center gap-2">
          {/* Avatar circle */}
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-sky-100 text-xs font-bold text-sky-600">
            {privyEmail ? privyEmail[0].toUpperCase() : "P"}
          </div>
          <div>
            <p className="text-sm font-medium text-slate-800 leading-none">
              {privyEmail ?? "Paciente"}
            </p>
            <button
              onClick={copyAddress}
              title="Copiar dirección completa"
              className="flex items-center gap-1 group text-left"
            >
              <p className="text-[11px] text-slate-400 font-mono mt-0.5 group-hover:text-sky-500 transition-colors">
                {truncateHash(session.address, 6, 6)}
              </p>
              <span className="text-[10px] text-slate-300 group-hover:text-sky-400 transition-colors mt-0.5">
                {copied ? "✓" : "⎘"}
              </span>
            </button>
          </div>
        </div>
        <button
          onClick={onLogout}
          className="rounded-lg px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-rose-50 hover:text-rose-500"
        >
          Salir
        </button>
      </div>

      {/* Tab content */}
      {tab === "inicio" && (
        <InicioTab
          session={session}
          activeRxCount={activeRxCount}
          authorizedDoctors={authorizedDoctors}
          onGoToRecetas={() => router.push("/patient?tab=recetas")}
          onGoToFicha={() => router.push("/patient?tab=ficha")}
          onGoToConsultas={() => router.push("/patient?tab=consultas")}
        />
      )}
      {tab === "recetas" && (
        <RecetasTab
          items={items}
          error={rxError}
          consultations={consultations}
          onReload={loadRx}
          onShare={setShare}
          onShowPharmacy={setPharmacyRx}
          wallet={session.address}
          mock={session.mock}
        />
      )}
      {tab === "licencias" && <LicenciasTab />}
      {tab === "ficha" && (
        <FichaTab wallet={session.address} mock={session.mock} />
      )}
      {tab === "timeline" && (
        <HealthTimelineView patientEmail={privyEmail ?? ""} />
      )}
      {tab === "chat" && (
        <FichaChatWidget patientEmail={privyEmail ?? ""} />
      )}
      {tab === "accesos" && (
        <AccesosTab wallet={session.address} mock={session.mock} />
      )}
      {tab === "consultas" && (
        <ConsultasTab wallet={session.address} mock={session.mock} />
      )}

      {share && (
        <ShareModal
          rx={share}
          patientWallet={session.address}
          onClose={() => setShare(null)}
        />
      )}

      {pharmacyRx && (
        <RxPharmacyModal rx={pharmacyRx} onClose={() => setPharmacyRx(null)} />
      )}
    </div>
  );
}

function PatientDashboard({
  session,
  onLogout,
  privyEmail,
}: {
  session: PasskeySession;
  onLogout: () => void;
  privyEmail?: string | null;
}) {
  return (
    <Suspense>
      <PatientDashboardInner session={session} onLogout={onLogout} privyEmail={privyEmail} />
    </Suspense>
  );
}
