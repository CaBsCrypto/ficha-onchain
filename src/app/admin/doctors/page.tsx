"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { authedFetch } from "@/lib/auth/authed-fetch";

interface Onboarding { id: string; state: string; source: string; submissionId: string | null; wallet: string | null; reviewNote?: string | null; profile?: { name: string; specialty: string; licenseNum: string; rut: string }; }
interface Doctor { id: number; name: string; email: string; specialty: string | null; status: string; onboarding?: Onboarding | null; }
type Action = "authorize" | "renew" | "revoke";
type AuthorizationStatus = "unregistered" | "authorized" | "expired" | "revoked" | "paused";
interface AuthorizationRequest {
  id: string; state: "pending" | "submitted" | "confirmed" | "failed"; action: Action;
  method: string; transactionHash: string | null; errorCode: string | null;
}
interface Review {
  onboarding?: Onboarding | null;
  doctor: Doctor; wallet: string;
  authorization: { status: AuthorizationStatus; version: number; validUntil: number | null; commitment: string | null };
  request: AuthorizationRequest | null;
  dossier: null | {
    fullName: string; license: string; specialty: string; verificationSource: string;
    reviewedBy: string; reviewedAt: string; version: number; validUntil: number;
  };
  syntheticOnly: boolean;
}
const STATUS: Record<AuthorizationStatus, string> = {
  unregistered: "Sin autorización", authorized: "Autorizado", expired: "Autorización vencida",
  revoked: "Autorización revocada", paused: "Registro pausado",
};
const ACTION: Record<Action, string> = { authorize: "autorizar", renew: "renovar", revoke: "revocar" };
const ONBOARDING_STATUS: Record<string, string> = { invited: 'Invitado', draft: 'Perfil en preparación', submitted: 'En revisión', changes_requested: 'Cambios solicitados', rejected: 'Rechazado', authorization_pending: 'Autorización pendiente', authorized: 'Autorizado', expired: 'Invitación vencida', revoked: 'Revocado' };
const inputClass = "w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-500/30";
const secondaryButton = "rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:border-sky-300 hover:text-sky-700 disabled:cursor-not-allowed disabled:opacity-50";
function expiry(timestamp: number | null) { return timestamp ? new Date(timestamp * 1000).toLocaleString("es-CL") : "—"; }
function requestError(status: number) {
  if (status === 401) return "Tu sesión venció. Vuelve a iniciar sesión.";
  if (status === 403) return "Esta cuenta no tiene permiso para realizar esta acción.";
  if (status === 409) return "La solicitud o la wallet cambió. Actualiza el estado antes de continuar.";
  return "No se pudo verificar la operación. Actualiza el estado antes de volver a intentarlo.";
}

function AddDoctorModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const lock = useRef(false);
  const [form, setForm] = useState({ name: "", email: "", specialty: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { dialog.current?.showModal(); }, []);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (lock.current || !form.name.trim() || !form.email.trim()) return;
    lock.current = true; setSaving(true); setError("");
    try {
      const response = await authedFetch("/api/admin/doctors", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
      });
      const body = await response.json() as { doctor?: Doctor };
      if (!response.ok || !body.doctor) throw new Error(requestError(response.status));
      onCreated(); onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear el perfil. Inténtalo nuevamente.");
    } finally { lock.current = false; setSaving(false); }
  }
  return (
    <dialog ref={dialog} onCancel={onClose} aria-labelledby="add-doctor-title" className="m-auto w-[calc(100%_-_2rem)] max-w-md rounded-2xl bg-white p-6 shadow-xl backdrop:bg-slate-950/50">
      <h2 id="add-doctor-title" className="text-lg font-semibold text-slate-800">Invitar médico de prueba</h2>
      <p className="mt-1 text-sm text-slate-500">La invitación se reconoce al ingresar con este correo. Vence en siete días y no concede autorización. No se enviará un correo externo.</p>
      <form onSubmit={submit} className="mt-5 space-y-4">
        {([
          ["name", "Nombre", "text"], ["email", "Correo", "email"], ["specialty", "Especialidad", "text"],
        ] as const).map(([key, label, type]) => (
          <label key={key} className="block text-xs font-medium text-slate-600">
            <span className="mb-1.5 block">{label}</span>
            <input type={type} required value={form[key]} className={inputClass}
              onChange={(e) => setForm((previous) => ({ ...previous, [key]: e.target.value }))} />
          </label>
        ))}
        {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} disabled={saving} className={secondaryButton}>Cancelar</button>
          <button type="submit" disabled={saving} className="rounded-xl bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-600 disabled:opacity-50">{saving ? "Guardando…" : "Crear invitación"}</button>
        </div>
      </form>
    </dialog>
  );
}

function AuthorizationReview({ doctor, onClose }: { doctor: Doctor; onClose: () => void }) {
  const heading = useRef<HTMLHeadingElement>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [note, setNote] = useState("");
  const [refresh, setRefresh] = useState(0);
  const posting = useRef(false);
  const requestEpoch = useRef(0);
  const reviewedRevision = useRef<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    heading.current?.focus();
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    async function poll() {
      try {
        if (posting.current) return;
        const epoch = requestEpoch.current;
        const response = await authedFetch(`/api/admin/doctor-authorizations?doctorId=${doctor.id}`, { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error(requestError(response.status));
        const body = await response.json() as Review;
        if (!body.authorization || body.doctor?.id !== doctor.id || body.syntheticOnly !== true) throw new Error("No se pudo verificar el expediente de prueba.");
        if (alive && !posting.current && epoch === requestEpoch.current) {
          const revision = `${body.onboarding?.submissionId ?? 'legacy'}:${body.onboarding?.state ?? ''}:${body.authorization.version}`;
          if (reviewedRevision.current !== revision) { setReviewed(false); reviewedRevision.current = revision; }
          setReview(body); setError("");
        }
      } catch (err) {
        if (alive) { setError(err instanceof Error ? err.message : "No se pudo consultar el estado."); setReviewed(false); }
      } finally {
        if (alive) { setLoading(false); timer = setTimeout(() => void poll(), 3000); }
      }
    }
    void poll();
    return () => { alive = false; controller.abort(); clearTimeout(timer); };
  }, [doctor.id, refresh]);
  async function submit(action: Action) {
    if (posting.current || !reviewed || error || !review) return;
    posting.current = true; requestEpoch.current += 1; setSaving(true); setReviewed(false);
    try {
      const response = await authedFetch("/api/admin/doctor-authorizations", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doctorId: doctor.id, action, confirmed: true, synthetic: true, submissionId: review.onboarding?.submissionId ?? undefined }),
      });
      const body = await response.json() as { request?: AuthorizationRequest };
      if (!response.ok || !body.request?.id) throw new Error(requestError(response.status));
      if (mounted.current) setReview((previous) => previous ? { ...previous, request: body.request! } : previous);
    } catch (err) {
      if (mounted.current) setError(err instanceof Error ? err.message : "No se pudo verificar la solicitud. Actualiza su estado.");
    } finally {
      posting.current = false;
      if (mounted.current) { setSaving(false); setRefresh((value) => value + 1); }
    }
  }
  async function reviewApplication(action: 'request_changes' | 'reject' | 'reopen') {
    const current = review?.onboarding;
    if (posting.current || !current?.submissionId || error) return;
    posting.current = true; requestEpoch.current += 1; setSaving(true); setReviewed(false);
    try {
      const response = await authedFetch('/api/admin/doctor-onboarding', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: current.id, submissionId: current.submissionId, action, note }),
      });
      if (!response.ok) throw new Error(requestError(response.status));
      if (mounted.current) setNote('');
    } catch (err) {
      if (mounted.current) setError(err instanceof Error ? err.message : 'No se pudo guardar la revisión.');
    } finally {
      posting.current = false;
      if (mounted.current) { setSaving(false); setRefresh(value => value + 1); }
    }
  }
  const request = review?.request;
  const onboarding = review?.onboarding;
  const canAuthorize = !onboarding || ['submitted', 'authorized', 'revoked'].includes(onboarding.state);
  const pending = request?.state === "pending" || request?.state === "submitted";
  const blocked = saving || pending || !reviewed || !!error || !review?.wallet || !review?.dossier || !canAuthorize || review.authorization.status === "paused";
  const status = review?.authorization.status;
  const primaryAction: Action = (review?.authorization.version ?? 0) > 0 ? "renew" : "authorize";
  const hash = request?.transactionHash;
  return (
    <section aria-labelledby="doctor-review-title" className="rounded-2xl border border-sky-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 ref={heading} tabIndex={-1} id="doctor-review-title" className="text-lg font-semibold text-slate-800">Revisar autorización</h2><p className="mt-1 break-all text-sm text-slate-500">{doctor.name} · {doctor.email}</p></div>
        <button onClick={onClose} disabled={saving} className={secondaryButton}>Cerrar revisión</button>
      </div>
      {loading && <p role="status" className="mt-5 text-sm text-slate-500">Verificando registro y expediente…</p>}
      {error && <div role="alert" className="mt-4 rounded-xl bg-rose-50 p-4 text-sm text-rose-700"><p>{error}</p><button className="mt-2 font-semibold underline" onClick={() => setRefresh((value) => value + 1)}>Actualizar estado</button></div>}
      {review && <div className="mt-5 space-y-5">
        {onboarding && <div className="rounded-xl border border-slate-200 p-4">
          <p className="font-semibold text-slate-800">Alta médica · {ONBOARDING_STATUS[onboarding.state] ?? onboarding.state}</p>
          {onboarding.profile && <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
            {Object.entries({ Nombre: onboarding.profile.name, Especialidad: onboarding.profile.specialty, 'Registro de prueba': onboarding.profile.licenseNum, 'RUT sintético': onboarding.profile.rut }).map(([label, value]) => <div key={label}><dt className="text-slate-500">{label}</dt><dd>{value}</dd></div>)}
          </dl>}
          {onboarding.reviewNote && <p className="mt-3 text-sm">Observaciones: {onboarding.reviewNote}</p>}
          {['submitted', 'changes_requested', 'rejected'].includes(onboarding.state) && <div className="mt-4 space-y-3">
            <label className="block text-sm">Observaciones para el médico<textarea value={note} onChange={event => setNote(event.target.value)} maxLength={500} className={inputClass} disabled={saving} /></label>
            <div className="flex flex-wrap gap-2">
              {onboarding.state === 'submitted' && <button className={secondaryButton} disabled={saving || !!error || !note.trim()} onClick={() => void reviewApplication('request_changes')}>Solicitar cambios</button>}
              {['submitted', 'changes_requested'].includes(onboarding.state) && <button className={secondaryButton} disabled={saving || !!error || !note.trim()} onClick={() => void reviewApplication('reject')}>Rechazar solicitud</button>}
              {onboarding.state === 'rejected' && <button className={secondaryButton} disabled={saving || !!error} onClick={() => void reviewApplication('reopen')}>Reabrir solicitud</button>}
            </div>
          </div>}
        </div>}
        <div className="rounded-xl bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{error ? "Último estado comprobado · Actualización pendiente" : "Estado comprobado en Stellar Testnet"}</p>
          <p className={`mt-1 font-semibold ${status === "authorized" ? "text-emerald-700" : "text-amber-700"}`}>{STATUS[review.authorization.status]}</p>
          <p className="mt-1 text-sm text-slate-600">Vigencia: {expiry(review.authorization.validUntil)}</p>
          <p className="mt-2 break-all font-mono text-xs text-slate-500">Wallet Stellar: {review.wallet || "Asociación pendiente"}</p>
        </div>
        {review.dossier && !onboarding && <div>
          <h3 className="font-semibold text-slate-800">Expediente sintético</h3>
          <p className="mt-1 text-sm text-slate-500">Datos exclusivamente de prueba. Autorizar o renovar establece una vigencia de 30 días.</p>
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
            {[["Nombre de prueba", review.dossier.fullName], ["Registro de prueba", review.dossier.license], ["Especialidad", review.dossier.specialty], ["Fuente de verificación", review.dossier.verificationSource]].map(([label, value]) => (
              <div key={label}><dt className="text-slate-500">{label}</dt><dd className="mt-0.5 break-words font-medium text-slate-700">{value}</dd></div>
            ))}
          </dl>
        </div>}
        {request && <div role="status" className={`rounded-xl p-4 text-sm ${request.state === "confirmed" ? "bg-emerald-50 text-emerald-800" : request.state === "failed" ? "bg-rose-50 text-rose-800" : "bg-amber-50 text-amber-800"}`}>
          <p className="font-semibold">{request.state === "confirmed" ? "Solicitud confirmada" : request.state === "failed" ? "Solicitud fallida" : "Solicitud pendiente"} · {ACTION[request.action]}</p>
          <p className="mt-1">{request.state === "pending" ? "Esperando al procesador administrativo. Si está apagado, la solicitud permanece pendiente." : request.state === "submitted" ? "Transacción enviada. Esperando su confirmación en Stellar Testnet." : request.state === "confirmed" ? "El recibo confirmó esta solicitud. El estado vigente aparece arriba." : "No se confirmó el cambio solicitado. Puedes actualizar el estado y volver a revisar."}</p>
          {hash && /^[a-f0-9]{64}$/i.test(hash) && <a href={`https://stellar.expert/explorer/testnet/tx/${hash}`} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block font-semibold underline">Ver recibo en Stellar Testnet</a>}
        </div>}
        {!pending && <label className="flex cursor-pointer items-start gap-3 text-sm text-slate-700"><input type="checkbox" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)} disabled={saving || !!error || !review.dossier} className="mt-0.5 h-4 w-4 accent-sky-600" /><span>Revisé el expediente sintético y la cuenta del médico. Confirmo la acción que elija a continuación.</span></label>}
        <div className="flex flex-wrap gap-3">
          <button disabled={blocked} onClick={() => void submit(primaryAction)} className="rounded-xl bg-sky-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-40">{saving ? "Enviando solicitud…" : status === "revoked" ? "Confirmar nueva autorización" : primaryAction === "renew" ? "Confirmar renovación" : "Confirmar autorización"}</button>
          {review.authorization.version > 0 && status !== "revoked" && (!onboarding || onboarding.state === 'authorized') && <button disabled={blocked} onClick={() => void submit("revoke")} className="rounded-xl border border-rose-200 px-4 py-2.5 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40">Confirmar revocación</button>}
        </div>
        <p className="text-xs text-slate-500">El permiso cambia cuando Stellar confirma el recibo. TrustLeaf paga la comisión.</p>
      </div>}
    </section>
  );
}

export default function AdminDoctorsPage() {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [selected, setSelected] = useState<Doctor | null>(null);
  const fetchDoctors = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await authedFetch("/api/admin/doctor-authorizations", { cache: "no-store" });
      if (!response.ok) throw new Error(requestError(response.status));
      const body = await response.json() as { doctors?: Doctor[] };
      if (!Array.isArray(body.doctors)) throw new Error("No se pudo verificar la lista de médicos.");
      setDoctors(body.doctors);
    } catch (err) { setError(err instanceof Error ? err.message : "No se pudo cargar la lista de médicos."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void fetchDoctors(); }, [fetchDoctors]);
  const query = search.trim().toLowerCase();
  const filtered = doctors.filter((doctor) => [doctor.name, doctor.email, doctor.specialty ?? ""].some((value) => value.toLowerCase().includes(query)));
  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-xl font-bold text-slate-800">Médicos</h1><p className="mt-1 text-sm text-slate-500">Autorizaciones en Stellar Testnet · Datos sintéticos</p></div>
        <button onClick={() => setShowAdd(true)} className="rounded-xl bg-sky-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-600">Invitar médico</button>
      </div>
      {selected && <AuthorizationReview key={selected.id} doctor={selected} onClose={() => setSelected(null)} />}
      {error && <div role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700"><p>{error}</p><button onClick={() => void fetchDoctors()} className="mt-2 font-semibold underline">Volver a cargar</button></div>}
      <label className="block"><span className="mb-2 block text-sm font-medium text-slate-600">Buscar médico</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nombre, correo o especialidad" className={inputClass} /></label>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading ? <p role="status" className="p-8 text-center text-sm text-slate-500">Cargando médicos…</p> : filtered.length === 0 ? <p className="p-8 text-center text-sm text-slate-500">{query ? "Sin resultados para esta búsqueda." : "No hay perfiles de médicos disponibles."}</p> : <ul className="divide-y divide-slate-100">{filtered.map((doctor) => (
          <li key={doctor.id} className="flex flex-wrap items-center justify-between gap-3 p-5">
            <div className="min-w-0"><p className="font-semibold text-slate-800">{doctor.name}</p><p className="break-all text-sm text-slate-500">{doctor.email}</p><p className="mt-1 text-xs text-slate-500">{doctor.specialty ?? "Especialidad sin registrar"}</p></div>
            <div className="flex flex-wrap items-center gap-3"><span className="text-sm text-slate-600">{doctor.onboarding ? ONBOARDING_STATUS[doctor.onboarding.state] ?? doctor.onboarding.state : doctor.status}</span><button disabled={!!doctor.onboarding && !doctor.onboarding.wallet} onClick={() => setSelected(doctor)} aria-expanded={selected?.id === doctor.id} className={secondaryButton}>Revisar autorización</button></div>
          </li>
        ))}</ul>}
      </div>
      {showAdd && <AddDoctorModal onClose={() => setShowAdd(false)} onCreated={() => void fetchDoctors()} />}
    </div>
  );
}
