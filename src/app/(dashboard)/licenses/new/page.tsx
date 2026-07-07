"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { AccessScreen } from "@/components/portal/AccessScreen";
import { truncateHash } from "@/lib/stellar/config";
import { clearSession, loadSession, type PasskeySession } from "@/lib/passkey";
import type {
  DocumentType,
  LaborFitnessContent,
  DisabilityContent,
  MedicalLicenseContent,
  PsychCareContent,
} from "@/types";

// ---------------------------------------------------------------------------
// Inline labels / categories (server-only fhir module cannot be imported here)
// ---------------------------------------------------------------------------

const DOC_LABELS: Record<DocumentType, string> = {
  LaborRest: "Reposo Laboral",
  LaborFitness: "Aptitud Laboral",
  Disability: "Incapacidad",
  MedicalLicense: "Licencia Médica",
  DegreeTitle: "Certificado de Título",
  ProfCredential: "Habilitación Profesional",
  PsychCare: "Atención Psicológica",
  PsychEval: "Evaluación Psicológica",
  TreatmentDischarge: "Alta de Tratamiento",
};

interface DocGroup {
  category: string;
  label: string;
  types: DocumentType[];
}

const DOC_GROUPS: DocGroup[] = [
  {
    category: "medical_certificate",
    label: "Certificados Médicos",
    types: ["LaborRest", "LaborFitness", "Disability"],
  },
  {
    category: "professional_license",
    label: "Licencias Profesionales",
    types: ["MedicalLicense", "DegreeTitle", "ProfCredential"],
  },
  {
    category: "mental_health",
    label: "Salud Mental",
    types: ["PsychCare", "PsychEval", "TreatmentDischarge"],
  },
];

// DOC_HAS_EXPIRY — types that need an expiresAt date
const DOC_HAS_EXPIRY = new Set<DocumentType>(["MedicalLicense", "ProfCredential"]);

// ---------------------------------------------------------------------------
// Form state — all possible fields across all 9 types
// ---------------------------------------------------------------------------

interface FormState {
  // ── Doc type ──────────────────────────────────────────────────────────────
  docType: DocumentType;

  // ── Common ────────────────────────────────────────────────────────────────
  recipientWallet: string;
  recipientFullName: string;
  recipientIdNumber: string;
  issuerName: string;
  issuerLicenseId: string;
  notes: string;
  expiresAt: string; // ISO date string, used for types in DOC_HAS_EXPIRY

  // ── LaborRest ─────────────────────────────────────────────────────────────
  restDays: string;
  startDate: string;
  endDate: string;
  diagnosisCode: string;
  diagnosisText: string;

  // ── LaborFitness ──────────────────────────────────────────────────────────
  fitnessResult: LaborFitnessContent["fitnessResult"] | "";
  restrictions: string; // comma-separated
  validUntil: string;

  // ── Disability ────────────────────────────────────────────────────────────
  disabilityType: DisabilityContent["disabilityType"] | "";
  percentage: string;

  // ── MedicalLicense ────────────────────────────────────────────────────────
  licenseType: MedicalLicenseContent["licenseType"] | "";
  specialty: string;
  licenseNumber: string;
  validFrom: string;
  issuingBody: string;

  // ── DegreeTitle ───────────────────────────────────────────────────────────
  profession: string;
  university: string;
  graduationDate: string;
  registrationNumber: string;

  // ── ProfCredential ────────────────────────────────────────────────────────
  credentialType: string;
  profCredProfession: string;
  profCredIssuingBody: string;
  profCredValidFrom: string;
  profCredValidUntil: string;

  // ── PsychCare ─────────────────────────────────────────────────────────────
  attendanceStatus: PsychCareContent["attendanceStatus"] | "";
  approximatePeriod: string;
  purposeOfCertificate: string;

  // ── PsychEval ─────────────────────────────────────────────────────────────
  evaluationPurpose: string;
  evaluationDate: string;
  resultSummary: string;
  evaluatorSpecialty: string;

  // ── TreatmentDischarge ────────────────────────────────────────────────────
  dischargeDate: string;
  dischargeSummary: string;
}

const emptyForm: FormState = {
  docType: "LaborRest",
  recipientWallet: "",
  recipientFullName: "",
  recipientIdNumber: "",
  issuerName: "",
  issuerLicenseId: "",
  notes: "",
  expiresAt: "",
  restDays: "1",
  startDate: "",
  endDate: "",
  diagnosisCode: "",
  diagnosisText: "",
  fitnessResult: "",
  restrictions: "",
  validUntil: "",
  disabilityType: "",
  percentage: "",
  licenseType: "",
  specialty: "",
  licenseNumber: "",
  validFrom: "",
  issuingBody: "",
  profession: "",
  university: "",
  graduationDate: "",
  registrationNumber: "",
  credentialType: "",
  profCredProfession: "",
  profCredIssuingBody: "",
  profCredValidFrom: "",
  profCredValidUntil: "",
  attendanceStatus: "",
  approximatePeriod: "",
  purposeOfCertificate: "",
  evaluationPurpose: "",
  evaluationDate: "",
  resultSummary: "",
  evaluatorSpecialty: "",
  dischargeDate: "",
  dischargeSummary: "",
};

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export default function NewLicensePage() {
  const [session, setSession] = useState<PasskeySession | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setSession(loadSession("doctor"));
    setReady(true);
  }, []);

  if (!ready) return null;
  if (!session) return <AccessScreen role="doctor" onAuthenticated={setSession} />;

  return (
    <NewLicenseForm
      session={session}
      onLogout={() => {
        clearSession();
        setSession(null);
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Mint result type
// ---------------------------------------------------------------------------

interface MintResult {
  mode: "onchain" | "simulated";
  docId: string | null;
  docType: string;
  docLabel: string;
  hash: string;
  contentHash: string;
  explorer?: string;
  reason?: string;
}

// ---------------------------------------------------------------------------
// Main form component
// ---------------------------------------------------------------------------

function NewLicenseForm({
  session,
  onLogout,
}: {
  session: PasskeySession;
  onLogout: () => void;
}) {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<MintResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Pre-fill issuer from doctor-status API
  useEffect(() => {
    fetch(`/api/doctor-status?wallet=${session.address}`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.authorized && data?.doctor) {
          setForm((prev) => ({
            ...prev,
            issuerName: prev.issuerName || data.doctor.fullName || "",
            issuerLicenseId: prev.issuerLicenseId || data.doctor.licenseId || "",
          }));
        }
      })
      .catch(() => {});
  }, [session.address]);

  function set(field: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleTypeSelect(t: DocumentType) {
    setForm((prev) => ({ ...prev, docType: t }));
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const payload = buildPayload(form);
    if (!payload) {
      setError("Completa todos los campos requeridos para este tipo de documento.");
      setBusy(false);
      return;
    }

    const expiresAt = DOC_HAS_EXPIRY.has(form.docType) && form.expiresAt
      ? Math.floor(new Date(form.expiresAt).getTime() / 1000)
      : 0;

    try {
      const res = await fetch("/api/documents/mint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient: form.recipientWallet.trim(),
          docType: form.docType,
          expiresAt: expiresAt || undefined,
          payload,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo emitir");
      setResult(data.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al emitir");
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <PageShell session={session} onLogout={onLogout}>
        <IssueSuccess result={result} onNew={() => setResult(null)} />
      </PageShell>
    );
  }

  return (
    <PageShell session={session} onLogout={onLogout}>
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* ── 1. Type selector ─────────────────────────────────────────── */}
        <Card className="p-0">
          <div className="border-b border-slate-200/70 px-6 py-4">
            <h2 className="font-semibold text-ink">Tipo de documento</h2>
          </div>
          <div className="divide-y divide-slate-100 px-6 py-4">
            {DOC_GROUPS.map((group) => (
              <div key={group.category} className="py-3 first:pt-0 last:pb-0">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                  {group.label}
                </p>
                <div className="flex flex-wrap gap-2">
                  {group.types.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => handleTypeSelect(t)}
                      className={`rounded-full px-3 py-1.5 text-sm font-medium ring-1 ring-inset transition-colors ${
                        form.docType === t
                          ? "bg-clinical text-white ring-clinical"
                          : "bg-white text-muted ring-slate-200 hover:text-ink"
                      }`}
                    >
                      {DOC_LABELS[t]}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* ── 2. Common fields ─────────────────────────────────────────── */}
        <Card className="p-0">
          <div className="border-b border-slate-200/70 px-6 py-4">
            <h2 className="font-semibold text-ink">Datos del destinatario</h2>
          </div>
          <div className="space-y-4 px-6 py-5">
            <Field label="Wallet del destinatario (G…)">
              <input
                value={form.recipientWallet}
                onChange={(e) => set("recipientWallet", e.target.value)}
                placeholder="GD7WGS7M…4ZFW"
                className={inputClass}
                disabled={busy}
              />
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Nombre completo">
                <input
                  value={form.recipientFullName}
                  onChange={(e) => set("recipientFullName", e.target.value)}
                  placeholder="María García López"
                  className={inputClass}
                  disabled={busy}
                />
              </Field>
              <Field label="RUT / ID (opcional, off-chain)">
                <input
                  value={form.recipientIdNumber}
                  onChange={(e) => set("recipientIdNumber", e.target.value)}
                  placeholder="12.345.678-9"
                  className={inputClass}
                  disabled={busy}
                />
              </Field>
            </div>
          </div>
        </Card>

        {/* ── 3. Issuer fields ─────────────────────────────────────────── */}
        <Card className="p-0">
          <div className="border-b border-slate-200/70 px-6 py-4">
            <h2 className="font-semibold text-ink">Datos del emisor</h2>
          </div>
          <div className="space-y-4 px-6 py-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Nombre del profesional / institución">
                <input
                  value={form.issuerName}
                  onChange={(e) => set("issuerName", e.target.value)}
                  placeholder="Dr. Andrés Morales"
                  className={inputClass}
                  disabled={busy}
                />
              </Field>
              <Field label="N° de registro / licencia (opcional)">
                <input
                  value={form.issuerLicenseId}
                  onChange={(e) => set("issuerLicenseId", e.target.value)}
                  placeholder="SIS-12345"
                  className={inputClass}
                  disabled={busy}
                />
              </Field>
            </div>
          </div>
        </Card>

        {/* ── 4. Type-specific fields ──────────────────────────────────── */}
        <TypeFields form={form} set={set} busy={busy} />

        {/* ── 5. Notes + expiry ────────────────────────────────────────── */}
        <Card className="p-0">
          <div className="border-b border-slate-200/70 px-6 py-4">
            <h2 className="font-semibold text-ink">Notas y vigencia</h2>
          </div>
          <div className="space-y-4 px-6 py-5">
            {DOC_HAS_EXPIRY.has(form.docType) && (
              <Field label="Fecha de vencimiento">
                <input
                  type="date"
                  value={form.expiresAt}
                  onChange={(e) => set("expiresAt", e.target.value)}
                  className={inputClass}
                  disabled={busy}
                />
              </Field>
            )}
            <Field label="Notas adicionales (opcional)">
              <textarea
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
                placeholder="Indicaciones, restricciones u observaciones."
                rows={3}
                className={`${inputClass} resize-none`}
                disabled={busy}
              />
            </Field>
          </div>
        </Card>

        {/* ── Error ────────────────────────────────────────────────────── */}
        {error && (
          <p className="rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-600 ring-1 ring-inset ring-rose-500/20">
            {error}
          </p>
        )}

        {/* ── Submit ───────────────────────────────────────────────────── */}
        <div className="flex justify-end">
          <Button type="submit" disabled={busy} className="w-full sm:w-auto">
            {busy ? "Firmando y anclando…" : `Emitir ${DOC_LABELS[form.docType]}`}
          </Button>
        </div>
      </form>
    </PageShell>
  );
}

// ---------------------------------------------------------------------------
// Type-specific field sections
// ---------------------------------------------------------------------------

function TypeFields({
  form,
  set,
  busy,
}: {
  form: FormState;
  set: (field: keyof FormState, value: string) => void;
  busy: boolean;
}) {
  const today = new Date().toISOString().slice(0, 10);

  switch (form.docType) {
    case "LaborRest":
      return (
        <Card className="p-0">
          <SectionHeader title="Datos del reposo" />
          <div className="space-y-4 px-6 py-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="Días de reposo">
                <input
                  type="number"
                  min={1}
                  value={form.restDays}
                  onChange={(e) => set("restDays", e.target.value)}
                  className={inputClass}
                  disabled={busy}
                />
              </Field>
              <Field label="Fecha de inicio">
                <input
                  type="date"
                  value={form.startDate}
                  onChange={(e) => set("startDate", e.target.value)}
                  className={inputClass}
                  disabled={busy}
                />
              </Field>
              <Field label="Fecha de término">
                <input
                  type="date"
                  value={form.endDate}
                  onChange={(e) => set("endDate", e.target.value)}
                  className={inputClass}
                  disabled={busy}
                />
              </Field>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Código diagnóstico CIE-10 (opt.)">
                <input
                  value={form.diagnosisCode}
                  onChange={(e) => set("diagnosisCode", e.target.value)}
                  placeholder="J06.9"
                  className={inputClass}
                  disabled={busy}
                />
              </Field>
              <Field label="Diagnóstico en texto (opt.)">
                <input
                  value={form.diagnosisText}
                  onChange={(e) => set("diagnosisText", e.target.value)}
                  placeholder="IRA alta"
                  className={inputClass}
                  disabled={busy}
                />
              </Field>
            </div>
          </div>
        </Card>
      );

    case "LaborFitness":
      return (
        <Card className="p-0">
          <SectionHeader title="Datos de aptitud laboral" />
          <div className="space-y-4 px-6 py-5">
            <Field label="Resultado">
              <select
                value={form.fitnessResult}
                onChange={(e) => set("fitnessResult", e.target.value)}
                className={inputClass}
                disabled={busy}
              >
                <option value="">Seleccionar…</option>
                <option value="apt">Apto</option>
                <option value="not_apt">No apto</option>
                <option value="apt_with_restrictions">Apto con restricciones</option>
              </select>
            </Field>
            {form.fitnessResult === "apt_with_restrictions" && (
              <Field label="Restricciones (separadas por coma)">
                <input
                  value={form.restrictions}
                  onChange={(e) => set("restrictions", e.target.value)}
                  placeholder="No levantar peso, evitar turnos nocturnos"
                  className={inputClass}
                  disabled={busy}
                />
              </Field>
            )}
            <Field label="Válido hasta (opcional)">
              <input
                type="date"
                value={form.validUntil}
                onChange={(e) => set("validUntil", e.target.value)}
                className={inputClass}
                disabled={busy}
              />
            </Field>
          </div>
        </Card>
      );

    case "Disability":
      return (
        <Card className="p-0">
          <SectionHeader title="Datos de incapacidad" />
          <div className="space-y-4 px-6 py-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Tipo de incapacidad">
                <select
                  value={form.disabilityType}
                  onChange={(e) => set("disabilityType", e.target.value)}
                  className={inputClass}
                  disabled={busy}
                >
                  <option value="">Seleccionar…</option>
                  <option value="temporary">Temporal</option>
                  <option value="permanent">Permanente</option>
                </select>
              </Field>
              {form.disabilityType === "permanent" && (
                <Field label="Porcentaje de incapacidad (0–100)">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={form.percentage}
                    onChange={(e) => set("percentage", e.target.value)}
                    className={inputClass}
                    disabled={busy}
                  />
                </Field>
              )}
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Fecha de inicio">
                <input
                  type="date"
                  value={form.startDate}
                  onChange={(e) => set("startDate", e.target.value)}
                  className={inputClass}
                  disabled={busy}
                />
              </Field>
              {form.disabilityType !== "permanent" && (
                <Field label="Fecha de término (temporal)">
                  <input
                    type="date"
                    value={form.endDate}
                    onChange={(e) => set("endDate", e.target.value)}
                    className={inputClass}
                    disabled={busy}
                  />
                </Field>
              )}
            </div>
            <Field label="Código CIE-10 (opcional)">
              <input
                value={form.diagnosisCode}
                onChange={(e) => set("diagnosisCode", e.target.value)}
                placeholder="M54.5"
                className={inputClass}
                disabled={busy}
              />
            </Field>
          </div>
        </Card>
      );

    case "MedicalLicense":
      return (
        <Card className="p-0">
          <SectionHeader title="Datos de la licencia médica" />
          <div className="space-y-4 px-6 py-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Tipo de licencia">
                <select
                  value={form.licenseType}
                  onChange={(e) => set("licenseType", e.target.value)}
                  className={inputClass}
                  disabled={busy}
                >
                  <option value="">Seleccionar…</option>
                  <option value="issuance">Emisión inicial</option>
                  <option value="renewal">Renovación</option>
                </select>
              </Field>
              <Field label="Especialidad">
                <input
                  value={form.specialty}
                  onChange={(e) => set("specialty", e.target.value)}
                  placeholder="Medicina General"
                  className={inputClass}
                  disabled={busy}
                />
              </Field>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="N° de licencia">
                <input
                  value={form.licenseNumber}
                  onChange={(e) => set("licenseNumber", e.target.value)}
                  placeholder="MED-2024-00123"
                  className={inputClass}
                  disabled={busy}
                />
              </Field>
              <Field label="Organismo emisor">
                <input
                  value={form.issuingBody}
                  onChange={(e) => set("issuingBody", e.target.value)}
                  placeholder="Colegio Médico de Chile"
                  className={inputClass}
                  disabled={busy}
                />
              </Field>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Válida desde">
                <input
                  type="date"
                  value={form.validFrom}
                  onChange={(e) => set("validFrom", e.target.value)}
                  className={inputClass}
                  disabled={busy}
                />
              </Field>
              <Field label="Válida hasta">
                <input
                  type="date"
                  value={form.expiresAt}
                  onChange={(e) => set("expiresAt", e.target.value)}
                  className={inputClass}
                  disabled={busy}
                />
              </Field>
            </div>
          </div>
        </Card>
      );

    case "DegreeTitle":
      return (
        <Card className="p-0">
          <SectionHeader title="Datos del título profesional" />
          <div className="space-y-4 px-6 py-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Profesión">
                <input
                  value={form.profession}
                  onChange={(e) => set("profession", e.target.value)}
                  placeholder="Médico Cirujano"
                  className={inputClass}
                  disabled={busy}
                />
              </Field>
              <Field label="Universidad">
                <input
                  value={form.university}
                  onChange={(e) => set("university", e.target.value)}
                  placeholder="Universidad de Chile"
                  className={inputClass}
                  disabled={busy}
                />
              </Field>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Fecha de graduación">
                <input
                  type="date"
                  value={form.graduationDate}
                  onChange={(e) => set("graduationDate", e.target.value)}
                  className={inputClass}
                  disabled={busy}
                />
              </Field>
              <Field label="N° registro ministerial (opt.)">
                <input
                  value={form.registrationNumber}
                  onChange={(e) => set("registrationNumber", e.target.value)}
                  placeholder="REG-2020-4567"
                  className={inputClass}
                  disabled={busy}
                />
              </Field>
            </div>
          </div>
        </Card>
      );

    case "ProfCredential":
      return (
        <Card className="p-0">
          <SectionHeader title="Datos de habilitación profesional" />
          <div className="space-y-4 px-6 py-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Tipo de credencial">
                <input
                  value={form.credentialType}
                  onChange={(e) => set("credentialType", e.target.value)}
                  placeholder="Habilitación especialidad"
                  className={inputClass}
                  disabled={busy}
                />
              </Field>
              <Field label="Profesión">
                <input
                  value={form.profCredProfession}
                  onChange={(e) => set("profCredProfession", e.target.value)}
                  placeholder="Psicólogo Clínico"
                  className={inputClass}
                  disabled={busy}
                />
              </Field>
            </div>
            <Field label="Organismo emisor">
              <input
                value={form.profCredIssuingBody}
                onChange={(e) => set("profCredIssuingBody", e.target.value)}
                placeholder="Colegio de Psicólogos de Chile"
                className={inputClass}
                disabled={busy}
              />
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Válida desde">
                <input
                  type="date"
                  value={form.profCredValidFrom}
                  onChange={(e) => set("profCredValidFrom", e.target.value)}
                  className={inputClass}
                  disabled={busy}
                />
              </Field>
              <Field label="Válida hasta (opt.)">
                <input
                  type="date"
                  value={form.profCredValidUntil}
                  onChange={(e) => set("profCredValidUntil", e.target.value)}
                  className={inputClass}
                  disabled={busy}
                />
              </Field>
            </div>
          </div>
        </Card>
      );

    case "PsychCare":
      return (
        <Card className="p-0">
          <SectionHeader title="Atención psicológica" />
          <div className="mb-3 rounded-xl bg-mint-50/80 px-4 py-3 text-xs text-mint">
            Nota de privacidad: este certificado no incluye diagnóstico, código CIE, ni
            detalles clínicos. Solo acredita que la persona está o estuvo en tratamiento.
          </div>
          <div className="space-y-4 px-6 py-5">
            <Field label="Estado de atención">
              <select
                value={form.attendanceStatus}
                onChange={(e) => set("attendanceStatus", e.target.value)}
                className={inputClass}
                disabled={busy}
              >
                <option value="">Seleccionar…</option>
                <option value="in_treatment">En tratamiento</option>
                <option value="completed_treatment">Tratamiento completado</option>
              </select>
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Período aproximado (opt.)">
                <input
                  value={form.approximatePeriod}
                  onChange={(e) => set("approximatePeriod", e.target.value)}
                  placeholder="enero–junio 2025"
                  className={inputClass}
                  disabled={busy}
                />
              </Field>
              <Field label="Propósito del certificado (opt.)">
                <input
                  value={form.purposeOfCertificate}
                  onChange={(e) => set("purposeOfCertificate", e.target.value)}
                  placeholder="trámite laboral"
                  className={inputClass}
                  disabled={busy}
                />
              </Field>
            </div>
          </div>
        </Card>
      );

    case "PsychEval":
      return (
        <Card className="p-0">
          <SectionHeader title="Evaluación psicológica" />
          <div className="space-y-4 px-6 py-5">
            <Field label="Propósito de la evaluación">
              <input
                value={form.evaluationPurpose}
                onChange={(e) => set("evaluationPurpose", e.target.value)}
                placeholder="Evaluación de aptitud laboral"
                className={inputClass}
                disabled={busy}
              />
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Fecha de evaluación">
                <input
                  type="date"
                  value={form.evaluationDate}
                  onChange={(e) => set("evaluationDate", e.target.value)}
                  className={inputClass}
                  disabled={busy}
                />
              </Field>
              <Field label="Especialidad del evaluador (opt.)">
                <input
                  value={form.evaluatorSpecialty}
                  onChange={(e) => set("evaluatorSpecialty", e.target.value)}
                  placeholder="Psicología Clínica"
                  className={inputClass}
                  disabled={busy}
                />
              </Field>
            </div>
            <Field label="Resumen del resultado">
              <textarea
                value={form.resultSummary}
                onChange={(e) => set("resultSummary", e.target.value)}
                placeholder="Se evalúa al paciente en áreas cognitiva, emocional y conductual…"
                rows={3}
                className={`${inputClass} resize-none`}
                disabled={busy}
              />
            </Field>
          </div>
        </Card>
      );

    case "TreatmentDischarge":
      return (
        <Card className="p-0">
          <SectionHeader title="Alta de tratamiento psicológico" />
          <div className="space-y-4 px-6 py-5">
            <Field label="Fecha de alta">
              <input
                type="date"
                value={form.dischargeDate}
                onChange={(e) => set("dischargeDate", e.target.value)}
                className={inputClass}
                disabled={busy}
              />
            </Field>
            <Field label="Resumen del alta (opt.)">
              <textarea
                value={form.dischargeSummary}
                onChange={(e) => set("dischargeSummary", e.target.value)}
                placeholder="El paciente concluye el proceso terapéutico habiendo alcanzado los objetivos…"
                rows={3}
                className={`${inputClass} resize-none`}
                disabled={busy}
              />
            </Field>
          </div>
        </Card>
      );

    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Payload builder (client-side; server API does hashing)
// ---------------------------------------------------------------------------

function buildPayload(form: FormState) {
  const issuedOn = new Date().toISOString().slice(0, 10);
  const base = {
    issuerName: form.issuerName.trim(),
    issuerLicenseId: form.issuerLicenseId.trim() || undefined,
    recipientFullName: form.recipientFullName.trim(),
    recipientIdNumber: form.recipientIdNumber.trim() || undefined,
    issuedOn,
    notes: form.notes.trim() || undefined,
  };

  if (!base.issuerName || !base.recipientFullName) return null;

  switch (form.docType) {
    case "LaborRest":
      if (!form.startDate || !form.endDate || !form.restDays) return null;
      return {
        resourceType: "LaborRestCertificate" as const,
        ...base,
        restDays: Number(form.restDays),
        startDate: form.startDate,
        endDate: form.endDate,
        diagnosisCode: form.diagnosisCode.trim() || undefined,
        diagnosisText: form.diagnosisText.trim() || undefined,
      };

    case "LaborFitness":
      if (!form.fitnessResult) return null;
      return {
        resourceType: "LaborFitnessCertificate" as const,
        ...base,
        fitnessResult: form.fitnessResult as LaborFitnessContent["fitnessResult"],
        restrictions:
          form.restrictions.trim()
            ? form.restrictions.split(",").map((s) => s.trim()).filter(Boolean)
            : undefined,
        validUntil: form.validUntil || undefined,
      };

    case "Disability":
      if (!form.disabilityType || !form.startDate) return null;
      return {
        resourceType: "DisabilityCertificate" as const,
        ...base,
        disabilityType: form.disabilityType as DisabilityContent["disabilityType"],
        percentage: form.percentage ? Number(form.percentage) : undefined,
        startDate: form.startDate,
        endDate: form.disabilityType === "permanent" ? undefined : form.endDate || undefined,
        diagnosisCode: form.diagnosisCode.trim() || undefined,
      };

    case "MedicalLicense":
      if (!form.licenseType || !form.specialty || !form.licenseNumber || !form.validFrom || !form.issuingBody) return null;
      return {
        resourceType: "MedicalLicenseCertificate" as const,
        ...base,
        licenseType: form.licenseType as MedicalLicenseContent["licenseType"],
        specialty: form.specialty,
        licenseNumber: form.licenseNumber,
        validFrom: form.validFrom,
        validUntil: form.expiresAt || form.validFrom,
        issuingBody: form.issuingBody,
      };

    case "DegreeTitle":
      if (!form.profession || !form.university || !form.graduationDate) return null;
      return {
        resourceType: "DegreeTitleCertificate" as const,
        ...base,
        profession: form.profession,
        university: form.university,
        graduationDate: form.graduationDate,
        registrationNumber: form.registrationNumber.trim() || undefined,
      };

    case "ProfCredential":
      if (!form.credentialType || !form.profCredProfession || !form.profCredIssuingBody || !form.profCredValidFrom) return null;
      return {
        resourceType: "ProfCredentialCertificate" as const,
        ...base,
        credentialType: form.credentialType,
        profession: form.profCredProfession,
        issuingBody: form.profCredIssuingBody,
        validFrom: form.profCredValidFrom,
        validUntil: form.profCredValidUntil || undefined,
      };

    case "PsychCare":
      if (!form.attendanceStatus) return null;
      return {
        resourceType: "PsychCareAttendanceCertificate" as const,
        ...base,
        attendanceStatus: form.attendanceStatus as PsychCareContent["attendanceStatus"],
        approximatePeriod: form.approximatePeriod.trim() || undefined,
        purposeOfCertificate: form.purposeOfCertificate.trim() || undefined,
      };

    case "PsychEval":
      if (!form.evaluationPurpose || !form.evaluationDate || !form.resultSummary) return null;
      return {
        resourceType: "PsychologicalEvaluationCertificate" as const,
        ...base,
        evaluationPurpose: form.evaluationPurpose,
        evaluationDate: form.evaluationDate,
        resultSummary: form.resultSummary,
        evaluatorSpecialty: form.evaluatorSpecialty.trim() || undefined,
      };

    case "TreatmentDischarge":
      if (!form.dischargeDate) return null;
      return {
        resourceType: "TreatmentDischargeCertificate" as const,
        ...base,
        dischargeDate: form.dischargeDate,
        dischargeSummary: form.dischargeSummary.trim() || undefined,
      };

    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Success screen
// ---------------------------------------------------------------------------

function IssueSuccess({
  result,
  onNew,
}: {
  result: MintResult;
  onNew: () => void;
}) {
  const onchain = result.mode === "onchain";
  return (
    <Card className="text-center">
      <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-mint-50 ring-1 ring-mint/20 text-mint">
        <CheckIcon />
      </div>
      <h3 className="text-lg font-semibold text-ink">
        Documento {onchain ? "emitido on-chain" : "emitido (simulado)"} ✓
      </h3>
      <p className="mt-1 text-sm text-muted">{result.docLabel}</p>

      <div className="mt-2 flex justify-center">
        <Badge tone={onchain ? "mint" : "muted"}>
          {onchain ? `Anclado · doc #${result.docId}` : "modo simulado"}
        </Badge>
      </div>

      {!onchain && result.reason && (
        <p className="mx-auto mt-3 max-w-md text-xs text-muted">
          No se ancló en la red: {result.reason}. El hash SHA-256 del
          payload FHIR igualmente se calculó.
        </p>
      )}

      <div className="mt-5 space-y-2 rounded-2xl bg-slate-50 p-4 text-left">
        <Kv label="content_hash (SHA-256)" value={result.contentHash} />
        <Kv
          label={onchain ? "Tx hash" : "Hash (demo)"}
          value={result.hash}
        />
        {result.docId && (
          <Kv label="Documento #" value={result.docId} />
        )}
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

      {result.docId && (
        <Link
          href={`/verify/license/${result.docId}`}
          className="mt-2 inline-block text-sm font-medium text-clinical hover:text-clinical-600"
          target="_blank"
        >
          Ver página de verificación →
        </Link>
      )}

      <div className="mt-6 flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={onNew}>
          Emitir otro
        </Button>
        <Link href="/licenses" className="flex-1">
          <Button className="w-full">Mis licencias</Button>
        </Link>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Page shell (header + content wrapper)
// ---------------------------------------------------------------------------

function PageShell({
  session,
  onLogout,
  children,
}: {
  session: PasskeySession;
  onLogout: () => void;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-canvas">
      <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-white/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-4">
          <div className="min-w-0">
            <Link
              href="/licenses"
              className="text-xs font-medium text-muted hover:text-clinical"
            >
              ← Mis licencias
            </Link>
            <h1 className="truncate text-lg font-semibold text-ink">
              Emitir nuevo documento
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
      <div className="mx-auto max-w-3xl px-4 py-6">{children}</div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Shared UI helpers
// ---------------------------------------------------------------------------

const inputClass =
  "h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-ink placeholder:text-muted/60 focus:border-clinical focus:outline-none focus:ring-2 focus:ring-clinical/20";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted">
        {label}
      </span>
      {children}
    </label>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="border-b border-slate-200/70 px-6 py-4">
      <h2 className="font-semibold text-ink">{title}</h2>
    </div>
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

function CheckIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
