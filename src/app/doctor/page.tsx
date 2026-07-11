"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/Button";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { AccessScreen } from "@/components/portal/AccessScreen";
import { RxStatusBadge } from "@/components/prescriptions/RxStatusBadge";
import { formatLedgerDate, statusMeta } from "@/lib/stellar/status";
import { truncateHash } from "@/lib/stellar/config";
import type { OnChainPrescription } from "@/lib/stellar";
import { clearSession, loadSession, type PasskeySession } from "@/lib/passkey";
import { ConsultationPanel } from "@/components/portal/ConsultationPanel";
import {
  isValidRut,
  DOCUMENT_TYPE_LABELS,
  DOCUMENT_TYPE_OPTIONS,
  SEX_LABELS,
  SEX_OPTIONS,
  HEALTH_SYSTEM_LABELS,
  HEALTH_SYSTEM_OPTIONS,
  PRESCRIPTION_TYPE_LABELS,
  PRESCRIPTION_TYPE_OPTIONS,
} from "@/lib/decreto41";
import type {
  PatientDocType,
  HealthSystem,
  PrescriptionType,
  Sex,
} from "@/types";

// Inline icon components (lucide not installed — minimal SVG stubs)
function ShieldIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
  );
}
function CheckIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
  );
}
function AlertIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>
  );
}
function RxIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 6h5a3 3 0 0 1 0 6H5V6zm0 6 6 6M5 12h4"/><path d="m15 13 5 6m0-6-5 6"/></svg>
  );
}

type Tab = "emitir" | "recetas" | "consultas" | "pacientes";

export default function DoctorPortal() {
  const [session, setSession] = useState<PasskeySession | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setSession(loadSession("doctor"));
    setReady(true);
  }, []);

  if (!ready) return null;
  if (!session) return <AccessScreen role="doctor" onAuthenticated={setSession} />;
  return (
    <DoctorDashboard
      session={session}
      onLogout={() => {
        clearSession();
        setSession(null);
      }}
    />
  );
}

interface AuthStatus {
  authorized: boolean;
  source: "chain" | "demo" | "invalid";
  doctor: { fullName: string; licenseId: string; permissions: string[] } | null;
}

// Well-known permission display metadata
const PERMISSION_META: Record<string, { label: string; color: string }> = {
  CANNABIS: { label: "Cannabis medicinal", color: "bg-emerald-100 text-emerald-700 ring-emerald-500/30" },
  MNT_HLTH: { label: "Salud mental", color: "bg-violet-100 text-violet-700 ring-violet-500/30" },
};

function PermissionBadge({ permission }: { permission: string }) {
  const meta = PERMISSION_META[permission] ?? {
    label: permission,
    color: "bg-slate-100 text-slate-600 ring-slate-300/50",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${meta.color}`}
    >
      {meta.label}
    </span>
  );
}

function DoctorDashboard({
  session,
  onLogout,
}: {
  session: PasskeySession;
  onLogout: () => void;
}) {
  const [tab, setTab] = useState<Tab>("emitir");
  const [auth, setAuth] = useState<AuthStatus | null>(null);
  const [items, setItems] = useState<OnChainPrescription[] | null>(null);
  const [itemsError, setItemsError] = useState(false);
  // Pre-filled patient wallet when coming from "Emitir receta" in a consultation.
  const [prefillPatient, setPrefillPatient] = useState<string>("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/doctor-status?wallet=${session.address}`);
        setAuth(await res.json());
      } catch {
        setAuth({ authorized: false, source: "invalid", doctor: null });
      }
    })();
  }, [session.address]);

  const loadItems = useCallback(async () => {
    setItems(null);
    setItemsError(false);
    try {
      const res = await fetch(
        `/api/prescriptions?role=doctor&wallet=${session.address}`,
      );
      if (!res.ok) throw new Error("request failed");
      const data = await res.json();
      setItems(data.prescriptions ?? []);
    } catch {
      setItemsError(true);
      setItems([]);
    }
  }, [session.address]);

  useEffect(() => {
    if (tab === "recetas") loadItems();
  }, [tab, loadItems]);

  return (
    <main className="min-h-screen bg-canvas">
      <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-white/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-4">
          <div className="min-w-0">
            <Link href="/" className="text-xs font-medium text-muted hover:text-clinical">
              TrustLeaf
            </Link>
            <h1 className="truncate text-lg font-semibold text-ink">
              Portal del Médico
            </h1>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <p className="hidden font-mono text-xs text-muted sm:block">
              {truncateHash(session.address, 5, 4)}
            </p>
            {session.mock && <Badge tone="muted">demo</Badge>}
            <button
              onClick={onLogout}
              className="rounded-xl px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-rose-500/10 hover:text-rose-500"
            >
              Salir
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-6">
        <AuthBanner auth={auth} />

        <div className="mt-6 flex flex-wrap gap-2">
          <TabButton active={tab === "pacientes"} onClick={() => setTab("pacientes")}>
            <UsersIcon /> Mis Pacientes
          </TabButton>
          <TabButton active={tab === "emitir"} onClick={() => setTab("emitir")}>
            <RxIcon /> Emitir prescripción
          </TabButton>
          <TabButton active={tab === "consultas"} onClick={() => setTab("consultas")}>
            Consultas Meet
          </TabButton>
          <TabButton active={tab === "recetas"} onClick={() => setTab("recetas")}>
            Mis recetas
          </TabButton>
          {/* External module link — opens the Licencias section */}
          <Link
            href="/licenses"
            className={buttonVariants({ variant: "secondary", size: "sm" })}
          >
            <LicenseIcon />
            Licencias
          </Link>
        </div>

        <div className="mt-6">
          {tab === "pacientes" ? (
            <PacientesTab
              doctorWallet={session.address}
              onIssueRx={(patientWallet) => {
                setPrefillPatient(patientWallet);
                setTab("emitir");
              }}
            />
          ) : tab === "emitir" ? (
            <EmitForm
              doctorWallet={session.address}
              initialPatient={prefillPatient}
              doctorName={auth?.doctor?.fullName ?? ""}
              doctorLicense={auth?.doctor?.licenseId ?? ""}
              onIssued={() => {
                setPrefillPatient("");
                setTab("recetas");
              }}
            />
          ) : tab === "consultas" ? (
            <ConsultationPanel
              doctorWallet={session.address}
              onIssueRx={(patientWallet) => {
                setPrefillPatient(patientWallet);
                setTab("emitir");
              }}
            />
          ) : (
            <PrescriptionList
              items={items}
              error={itemsError}
              onReload={loadItems}
              doctorWallet={session.address}
            />
          )}
        </div>
      </div>
    </main>
  );
}

function AuthBanner({ auth }: { auth: AuthStatus | null }) {
  if (!auth) {
    return (
      <div className="h-16 animate-pulse rounded-2xl border border-slate-200/70 bg-white" />
    );
  }
  const onChain = auth.source === "chain";
  const permissions = auth.doctor?.permissions ?? [];
  return (
    <div
      className={`rounded-2xl border px-5 py-4 ${
        onChain
          ? "border-mint/30 bg-mint-50/60"
          : "border-amber-500/25 bg-amber-50/60"
      }`}
    >
      <div className="flex items-center gap-3">
        <div
          className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
            onChain ? "bg-mint/15 text-mint" : "bg-amber-500/15 text-amber-600"
          }`}
        >
          <ShieldIcon />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">
            {onChain
              ? "Médico verificado en DoctorRegistry"
              : "Autorización demo (no registrado on-chain)"}
          </p>
          <p className="text-xs text-muted">
            {onChain
              ? `${auth.doctor?.fullName ?? "Autorizado"} · Registro ${auth.doctor?.licenseId ?? "—"}`
              : "DoctorRegistry.is_authorized devolvió false — se permite emitir en modo demo."}
          </p>
        </div>
      </div>
      {permissions.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted">Permisos:</span>
          {permissions.map((perm) => (
            <PermissionBadge key={perm} permission={perm} />
          ))}
        </div>
      )}
    </div>
  );
}

interface MintResult {
  mode: "onchain" | "simulated";
  rxId: string | null;
  hash: string;
  rxHash: string;
  explorer?: string;
  reason?: string;
}

function EmitForm({
  doctorWallet,
  initialPatient = "",
  doctorName: initialDoctorName = "",
  doctorLicense = "",
  onIssued,
}: {
  doctorWallet: string;
  initialPatient?: string;
  doctorName?: string;
  doctorLicense?: string;
  onIssued: () => void;
}) {
  // On-chain patient wallet (or demo name).
  const [patient, setPatient] = useState(initialPatient);

  // Decreto 41 — identificación del paciente.
  const [patientName, setPatientName] = useState("");
  const [patientDocType, setPatientDocType] = useState<PatientDocType>("RUT");
  const [patientDocNumber, setPatientDocNumber] = useState("");
  const [patientSex, setPatientSex] = useState<Sex>("NO_ESPECIFICADO");
  const [patientBirthDate, setPatientBirthDate] = useState("");
  const [patientAddress, setPatientAddress] = useState("");
  const [patientPhone, setPatientPhone] = useState("");
  const [patientEmail, setPatientEmail] = useState("");
  const [healthSystem, setHealthSystem] = useState<HealthSystem>("FONASA");
  const [representativeName, setRepresentativeName] = useState("");
  const [representativeRut, setRepresentativeRut] = useState("");

  // Decreto 41 — prescriptor / prestador.
  const [doctorName, setDoctorName] = useState(initialDoctorName);
  const [doctorRut, setDoctorRut] = useState("");
  const [doctorSpecialty, setDoctorSpecialty] = useState("");
  const [clinicName, setClinicName] = useState("");
  const [clinicRut, setClinicRut] = useState("");

  // Decreto 41 — contenido clínico.
  const [medication, setMedication] = useState("");
  const [dosage, setDosage] = useState("");
  const [quantity, setQuantity] = useState("30");
  const [diagnosis, setDiagnosis] = useState("");
  const [cie10Code, setCie10Code] = useState("");
  const [refills, setRefills] = useState("0");
  const [prescriptionType, setPrescriptionType] =
    useState<PrescriptionType>("SIMPLE");
  const [notes, setNotes] = useState("");

  // Decreto 41 — consentimiento informado.
  const [consentGranted, setConsentGranted] = useState(false);
  const [consentDate, setConsentDate] = useState("");

  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<MintResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<string[] | null>(null);

  // Client-side check of the Decreto 41 mandatory set (server re-validates).
  const rutOk = (v: string) => isValidRut(v);
  const canSubmit =
    patient.trim() &&
    patientName.trim() &&
    patientDocNumber.trim() &&
    (patientDocType !== "RUT" || rutOk(patientDocNumber)) &&
    patientBirthDate.trim() &&
    patientAddress.trim() &&
    (patientPhone.trim() || patientEmail.trim()) &&
    doctorName.trim() &&
    rutOk(doctorRut) &&
    doctorSpecialty.trim() &&
    clinicName.trim() &&
    rutOk(clinicRut) &&
    medication.trim() &&
    dosage.trim() &&
    Number(quantity) > 0 &&
    diagnosis.trim() &&
    (!consentGranted || consentDate.trim());

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    setDetails(null);
    try {
      const res = await fetch("/api/mint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patient: patient.trim(),
          medication: medication.trim(),
          dosage: dosage.trim(),
          quantity: Number(quantity),
          notes: notes.trim() || undefined,
          patientName: patientName.trim(),
          patientDocType,
          patientDocNumber: patientDocNumber.trim(),
          patientSex,
          patientBirthDate: patientBirthDate.trim(),
          patientAddress: patientAddress.trim(),
          patientPhone: patientPhone.trim() || undefined,
          patientEmail: patientEmail.trim() || undefined,
          healthSystem,
          representativeName: representativeName.trim() || undefined,
          representativeRut: representativeRut.trim() || undefined,
          doctorName: doctorName.trim(),
          doctorRut: doctorRut.trim(),
          doctorSpecialty: doctorSpecialty.trim(),
          clinicName: clinicName.trim(),
          clinicRut: clinicRut.trim(),
          diagnosis: diagnosis.trim(),
          cie10Code: cie10Code.trim() || undefined,
          refills: Number(refills) || 0,
          prescriptionType,
          consentGranted,
          consentDate: consentGranted ? consentDate.trim() || null : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (Array.isArray(data.details)) setDetails(data.details);
        throw new Error(data.error ?? "No se pudo emitir");
      }
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al emitir");
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <IssueSuccess result={result} onNew={() => setResult(null)} onList={onIssued} />
    );
  }

  return (
    <Card className="p-0">
      <div className="border-b border-slate-200/70 px-6 py-5">
        <h2 className="text-lg font-semibold text-ink">Nueva prescripción</h2>
        <p className="text-xs text-muted">
          Se firma como <span className="font-mono">{truncateHash(doctorWallet, 4, 4)}</span>{" "}
          y se ancla en PrescriptionSoulbound (Testnet). Los campos con{" "}
          <span className="text-rose-500">*</span> son obligatorios (Decreto 41
          MINSAL). El paciente no paga XLM (fee-bump del relayer).
        </p>
        {doctorLicense && (
          <p className="mt-1 text-xs text-muted">
            Registro profesional (DoctorRegistry):{" "}
            <span className="font-mono">{doctorLicense}</span>
          </p>
        )}
      </div>
      <form onSubmit={submit} className="space-y-6 px-6 py-6">
        {/* --- Identificación del paciente --- */}
        <fieldset className="space-y-4" disabled={busy}>
          <SectionTitle>Identificación del paciente</SectionTitle>
          <Field label="Wallet del paciente (G…) o nombre demo" required>
            <input
              value={patient}
              onChange={(e) => setPatient(e.target.value)}
              placeholder="GD7WGS7M…4ZFW"
              className={inputClass}
            />
          </Field>
          <Field label="Nombre completo" required>
            <input
              value={patientName}
              onChange={(e) => setPatientName(e.target.value)}
              placeholder="María González Rojas"
              className={inputClass}
            />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Tipo de documento" required>
              <Select
                value={patientDocType}
                onChange={(v) => setPatientDocType(v as PatientDocType)}
                options={DOCUMENT_TYPE_OPTIONS}
                labels={DOCUMENT_TYPE_LABELS}
              />
            </Field>
            <Field label="Número de documento" required>
              <input
                value={patientDocNumber}
                onChange={(e) => setPatientDocNumber(e.target.value)}
                placeholder={patientDocType === "RUT" ? "12.345.678-5" : "N.º documento"}
                className={inputClass}
              />
            </Field>
          </div>
          {patientDocType === "RUT" &&
            patientDocNumber.trim() &&
            !rutOk(patientDocNumber) && (
              <p className="text-xs text-rose-500">RUT inválido — revisa el dígito verificador.</p>
            )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Sexo" required>
              <Select
                value={patientSex}
                onChange={(v) => setPatientSex(v as Sex)}
                options={SEX_OPTIONS}
                labels={SEX_LABELS}
              />
            </Field>
            <Field label="Fecha de nacimiento" required>
              <input
                type="date"
                value={patientBirthDate}
                onChange={(e) => setPatientBirthDate(e.target.value)}
                className={inputClass}
              />
            </Field>
          </div>
          <Field label="Domicilio" required>
            <input
              value={patientAddress}
              onChange={(e) => setPatientAddress(e.target.value)}
              placeholder="Av. Providencia 1234, Providencia, Santiago"
              className={inputClass}
            />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Teléfono">
              <input
                value={patientPhone}
                onChange={(e) => setPatientPhone(e.target.value)}
                placeholder="+56 9 1234 5678"
                className={inputClass}
              />
            </Field>
            <Field label="Email">
              <input
                type="email"
                value={patientEmail}
                onChange={(e) => setPatientEmail(e.target.value)}
                placeholder="paciente@correo.cl"
                className={inputClass}
              />
            </Field>
          </div>
          <p className="text-xs text-muted">
            Indica al menos un teléfono o email de contacto.
          </p>
          <Field label="Sistema de salud" required>
            <Select
              value={healthSystem}
              onChange={(v) => setHealthSystem(v as HealthSystem)}
              options={HEALTH_SYSTEM_OPTIONS}
              labels={HEALTH_SYSTEM_LABELS}
            />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Representante legal — nombre (opcional)">
              <input
                value={representativeName}
                onChange={(e) => setRepresentativeName(e.target.value)}
                placeholder="Solo si aplica"
                className={inputClass}
              />
            </Field>
            <Field label="Representante legal — RUT (opcional)">
              <input
                value={representativeRut}
                onChange={(e) => setRepresentativeRut(e.target.value)}
                placeholder="12.345.678-5"
                className={inputClass}
              />
            </Field>
          </div>
        </fieldset>

        {/* --- Prescriptor / prestador --- */}
        <fieldset className="space-y-4" disabled={busy}>
          <SectionTitle>Prescriptor y prestador</SectionTitle>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Nombre del médico" required>
              <input
                value={doctorName}
                onChange={(e) => setDoctorName(e.target.value)}
                placeholder="Dra. Valentina Reyes"
                className={inputClass}
              />
            </Field>
            <Field label="RUT del médico" required>
              <input
                value={doctorRut}
                onChange={(e) => setDoctorRut(e.target.value)}
                placeholder="12.345.678-5"
                className={inputClass}
              />
            </Field>
          </div>
          <Field label="Especialidad médica" required>
            <input
              value={doctorSpecialty}
              onChange={(e) => setDoctorSpecialty(e.target.value)}
              placeholder="Medicina Interna"
              className={inputClass}
            />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Clínica / prestador" required>
              <input
                value={clinicName}
                onChange={(e) => setClinicName(e.target.value)}
                placeholder="Clínica Los Andes"
                className={inputClass}
              />
            </Field>
            <Field label="RUT de la clínica" required>
              <input
                value={clinicRut}
                onChange={(e) => setClinicRut(e.target.value)}
                placeholder="76.123.456-7"
                className={inputClass}
              />
            </Field>
          </div>
        </fieldset>

        {/* --- Contenido clínico --- */}
        <fieldset className="space-y-4" disabled={busy}>
          <SectionTitle>Contenido clínico</SectionTitle>
          <Field label="Medicamento" required>
            <input
              value={medication}
              onChange={(e) => setMedication(e.target.value)}
              placeholder="Amoxicilina 500mg"
              className={inputClass}
            />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Dosis y frecuencia" required>
              <input
                value={dosage}
                onChange={(e) => setDosage(e.target.value)}
                placeholder="1 cápsula c/8h"
                className={inputClass}
              />
            </Field>
            <Field label="Cantidad a dispensar" required>
              <input
                type="number"
                min={1}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className={inputClass}
              />
            </Field>
          </div>
          <Field label="Diagnóstico / indicación clínica" required>
            <input
              value={diagnosis}
              onChange={(e) => setDiagnosis(e.target.value)}
              placeholder="Infección respiratoria aguda"
              className={inputClass}
            />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Código CIE-10 (opcional)">
              <input
                value={cie10Code}
                onChange={(e) => setCie10Code(e.target.value)}
                placeholder="J06.9"
                className={inputClass}
              />
            </Field>
            <Field label="Repeticiones permitidas">
              <input
                type="number"
                min={0}
                value={refills}
                onChange={(e) => setRefills(e.target.value)}
                className={inputClass}
              />
            </Field>
          </div>
          <Field label="Tipo de receta" required>
            <Select
              value={prescriptionType}
              onChange={(v) => setPrescriptionType(v as PrescriptionType)}
              options={PRESCRIPTION_TYPE_OPTIONS}
              labels={PRESCRIPTION_TYPE_LABELS}
            />
          </Field>
          <Field label="Instrucciones / notas clínicas (opcional)">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Tomar con alimentos. Suspender si aparece rash."
              rows={3}
              className={`${inputClass} resize-none`}
            />
          </Field>
        </fieldset>

        {/* --- Consentimiento informado --- */}
        <fieldset className="space-y-4" disabled={busy}>
          <SectionTitle>Consentimiento informado (opcional)</SectionTitle>
          <label className="flex items-center gap-3 text-sm text-ink">
            <input
              type="checkbox"
              checked={consentGranted}
              onChange={(e) => setConsentGranted(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-clinical focus:ring-clinical/30"
            />
            El paciente firmó el consentimiento informado
          </label>
          {consentGranted && (
            <Field label="Fecha del consentimiento" required>
              <input
                type="date"
                value={consentDate}
                onChange={(e) => setConsentDate(e.target.value)}
                className={inputClass}
              />
            </Field>
          )}
        </fieldset>

        {error && (
          <div className="rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-600 ring-1 ring-inset ring-rose-500/20">
            <p className="font-medium">{error}</p>
            {details && (
              <ul className="mt-1 list-disc pl-4">
                {details.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="flex justify-end pt-1">
          <Button type="submit" disabled={!canSubmit || busy} className="w-full sm:w-auto">
            {busy ? "Firmando y anclando…" : "Emitir prescripción"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <legend className="text-sm font-semibold text-ink">{children}</legend>
  );
}

function Select({
  value,
  onChange,
  options,
  labels,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  labels: Record<string, string>;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={inputClass}
    >
      {options.map((o) => (
        <option key={o} value={o}>
          {labels[o] ?? o}
        </option>
      ))}
    </select>
  );
}

function IssueSuccess({
  result,
  onNew,
  onList,
}: {
  result: MintResult;
  onNew: () => void;
  onList: () => void;
}) {
  const onchain = result.mode === "onchain";
  return (
    <Card className="text-center">
      <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-mint-50 ring-1 ring-mint/20">
        <CheckIcon />
      </div>
      <h3 className="text-lg font-semibold text-ink">
        Prescripción {onchain ? "emitida on-chain" : "emitida (simulada)"} ✓
      </h3>
      <div className="mt-2 flex justify-center">
        <Badge tone={onchain ? "mint" : "muted"}>
          {onchain ? `Anclada · rx #${result.rxId}` : "modo simulado"}
        </Badge>
      </div>

      {!onchain && result.reason && (
        <p className="mx-auto mt-3 max-w-md text-xs text-muted">
          No se ancló en la red: {result.reason}. El hash SHA-256 igualmente se
          calculó a partir del contenido FHIR.
        </p>
      )}

      <div className="mt-5 space-y-2 rounded-2xl bg-slate-50 p-4 text-left">
        <Kv label="rx_hash (SHA-256)" value={result.rxHash} />
        <Kv label={onchain ? "Tx hash" : "Hash (demo)"} value={result.hash} />
      </div>

      {onchain && result.explorer && (
        <a
          href={result.explorer}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-block text-sm font-medium text-clinical hover:text-clinical-600"
        >
          Ver transacción en Stellar Expert →
        </a>
      )}

      <div className="mt-6 flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={onNew}>
          Emitir otra
        </Button>
        <Button className="flex-1" onClick={onList}>
          Ver mis recetas
        </Button>
      </div>
    </Card>
  );
}

function PrescriptionList({
  items,
  error,
  onReload,
  doctorWallet,
}: {
  items: OnChainPrescription[] | null;
  error?: boolean;
  onReload: () => void;
  doctorWallet: string;
}) {
  const [revoking, setRevoking] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function revoke(rx: OnChainPrescription) {
    setRevoking(rx.id);
    setNote(null);
    try {
      const res = await fetch("/api/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rxId: rx.id }),
      });
      const data = await res.json();
      setNote(
        data.mode === "onchain"
          ? `Receta #${rx.id} revocada on-chain (${data.status}).`
          : `Revocación simulada de #${rx.id}: ${data.reason ?? ""}`,
      );
      if (data.mode === "onchain") onReload();
    } catch {
      setNote("No se pudo revocar.");
    } finally {
      setRevoking(null);
    }
  }

  if (items === null) {
    return (
      <div className="space-y-4">
        {[0, 1].map((i) => (
          <div
            key={i}
            className="h-24 animate-pulse rounded-3xl border border-slate-200/70 bg-white"
          />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Card className="text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-rose-500">
          <AlertIcon />
        </div>
        <h2 className="text-lg font-semibold text-ink">
          No se pudieron cargar las recetas
        </h2>
        <p className="mt-2 text-sm text-muted">
          Hubo un problema al leer tus prescripciones desde la red. Revisa tu
          conexión e inténtalo de nuevo.
        </p>
        <Button variant="secondary" className="mt-5" onClick={onReload}>
          Reintentar
        </Button>
      </Card>
    );
  }

  if (items.length === 0) {
    return (
      <Card className="text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-muted">
          <RxIcon />
        </div>
        <h2 className="text-lg font-semibold text-ink">Sin recetas emitidas</h2>
        <p className="mt-2 text-sm text-muted">
          Las prescripciones que emitas como{" "}
          <span className="font-mono">{truncateHash(doctorWallet, 4, 4)}</span>{" "}
          aparecerán aquí, leídas desde los eventos <code>rx_mint</code> de la red.
        </p>
        <Button variant="secondary" className="mt-5" onClick={onReload}>
          Actualizar
        </Button>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {note && (
        <p className="rounded-xl bg-clinical-50 px-3 py-2 text-xs text-clinical-600 ring-1 ring-inset ring-clinical/20">
          {note}
        </p>
      )}
      {items.map((rx) => {
        const canRevoke = statusMeta(rx.status).active && rx.status !== "ConsumoParcial";
        return (
          <Card key={rx.id} className="p-0">
            <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="truncate font-semibold text-ink">{rx.medication}</h3>
                  <RxStatusBadge status={rx.status} />
                </div>
                <p className="mt-1 text-sm text-muted">{rx.dosage}</p>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                  <span>Receta #{rx.id}</span>
                  <span>{formatLedgerDate(rx.timestamp)}</span>
                  <span className="font-mono">
                    Paciente {truncateHash(rx.patientWallet, 4, 4)}
                  </span>
                  <span className="font-mono">
                    {rx.balance}/{rx.unitsTotal} u.
                  </span>
                </div>
              </div>
              {canRevoke && (
                <Button
                  variant="secondary"
                  className="shrink-0"
                  disabled={revoking === rx.id}
                  onClick={() => revoke(rx)}
                >
                  {revoking === rx.id ? "Revocando…" : "Revocar"}
                </Button>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

// --- small shared UI --------------------------------------------------------

const inputClass =
  "h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-ink placeholder:text-muted/60 focus:border-clinical focus:outline-none focus:ring-2 focus:ring-clinical/20";

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted">
        {label}
        {required && <span className="ml-0.5 text-rose-500">*</span>}
      </span>
      {children}
    </label>
  );
}

function Kv({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-xs uppercase tracking-wide text-muted">{label}</span>
      <p className="break-all font-mono text-xs text-clinical-600">{value}</p>
    </div>
  );
}

function LicenseIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="mr-1"
      aria-hidden
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="9" y1="13" x2="15" y2="13" />
      <line x1="9" y1="17" x2="15" y2="17" />
    </svg>
  );
}

// -----------------
// ---------------------------------------------------------------------------
// Mis Pacientes tab
// ---------------------------------------------------------------------------

interface MockPatient {
  wallet: string;
  name: string;
  age: number;
  lastRx: string;
  condition: string;
}

const MOCK_PATIENTS: MockPatient[] = [
  { wallet: "GBQD7XK2Q9YAV4RPLM8W6H5T1BUFS0DQKX9ZE7NR", name: "María González R.", age: 52, lastRx: "2026-06-18", condition: "Hipertensión / Hipotiroidismo" },
  { wallet: "GCMK8P2NJZR5HVQA3DLM7W4F6C9BUFS0DQKX9ZE7", name: "Roberto Silva P.", age: 38, lastRx: "2026-07-02", condition: "Diabetes tipo 2" },
  { wallet: "GDXF3KP1NZQH5YVRA4DLM8W3F7C9BUFS0EQKX2ZE", name: "Carmen Rojas M.", age: 67, lastRx: "2026-06-25", condition: "Artritis reumatoidea" },
];

function PacientesTab({
  doctorWallet,
  onIssueRx,
}: {
  doctorWallet: string;
  onIssueRx: (patientWallet: string) => void;
}) {
  const patients = MOCK_PATIENTS; // production: read from AccessControl contract

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-2xl border border-clinical/20 bg-clinical-50/60 px-4 py-3.5">
        <svg viewBox="0 0 24 24" fill="none" className="mt-0.5 h-4 w-4 shrink-0 text-clinical" aria-hidden>
          <path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
        </svg>
        <p className="text-xs leading-relaxed text-clinical-600">
          <span className="font-semibold">Pacientes con acceso autorizado.</span>{" "}
          Solo ves pacientes que te otorgaron un grant explícito en el contrato
          AccessControl de Soroban.{" "}
          <span className="text-clinical/70">(datos de ejemplo en modo demo)</span>
        </p>
      </div>

      {patients.length === 0 ? (
        <Card className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-muted">
            <UsersIcon />
          </div>
          <h2 className="text-lg font-semibold text-ink">Sin pacientes autorizados</h2>
          <p className="mt-2 text-sm text-muted">
            Los pacientes que te otorguen acceso a su ficha aparecerán aquí.
            Comparte tu wallet{" "}
            <span className="font-mono">{truncateHash(doctorWallet, 4, 4)}</span>{" "}
            para que te autoricen.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-muted">
            {patients.length} paciente{patients.length > 1 ? "s" : ""} con acceso activo
          </p>
          {patients.map((p) => (
            <Card key={p.wallet} className="p-0" interactive>
              <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-4">
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-clinical-50 text-clinical">
                    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden>
                      <circle cx="12" cy="7" r="4" stroke="currentColor" strokeWidth="1.7" />
                      <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold text-ink">{p.name}</h3>
                      <Badge tone="muted">{p.age} años</Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-muted">{p.condition}</p>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted/80">
                      <span className="font-mono">{truncateHash(p.wallet, 5, 4)}</span>
                      <span>Última receta: {p.lastRx}</span>
                    </div>
                  </div>
                </div>
                <Button
                  className="shrink-0"
                  onClick={() => onIssueRx(p.wallet)}
                >
                  <RxIcon /> Emitir receta
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function UsersIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden>
      <circle cx="9" cy="7" r="3.5" stroke="currentColor" strokeWidth="1.7" />
      <path d="M2 20c0-3.5 3.1-6 7-6s7 2.5 7 6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M19 8c1.1.5 2 1.7 2 3M21 20c0-2.5-1.8-4.5-4-5.3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium ring-1 ring-inset transition-colors ${
        active
          ? "bg-clinical text-white ring-clinical"
          : "bg-white text-muted ring-slate-200 hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}
