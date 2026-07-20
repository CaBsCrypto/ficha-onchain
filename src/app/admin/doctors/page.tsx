"use client";

import { useState, useEffect, useCallback } from "react";
import { useAdmin } from "@/app/admin/layout";

// ── Types ─────────────────────────────────────────────────────────────────────
interface Doctor {
  id: number;
  name: string;
  email: string;
  specialty: string | null;
  license_num: string | null;
  rut: string | null;
  status: "active" | "blocked" | "pending";
  created_at: string;
}

interface NewDoctorForm {
  name: string;
  email: string;
  specialty: string;
  licenseNum: string;
  rut: string;
}

const EMPTY_FORM: NewDoctorForm = { name: "", email: "", specialty: "", licenseNum: "", rut: "" };

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" });
}

function inputCls(err?: boolean) {
  return `w-full rounded-xl border px-4 py-2.5 text-sm outline-none transition focus:ring-2 focus:ring-sky-500/30 ${
    err ? "border-red-400 bg-red-50" : "border-slate-200 bg-white focus:border-sky-400"
  }`;
}

// ── Add Doctor Modal ──────────────────────────────────────────────────────────
function AddDoctorModal({ token, onClose, onCreated }: {
  token: string;
  onClose: () => void;
  onCreated: (d: Doctor) => void;
}) {
  const [form, setForm] = useState<NewDoctorForm>(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function set<K extends keyof NewDoctorForm>(k: K, v: string) {
    setForm((prev) => ({ ...prev, [k]: v }));
    setError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim()) { setError("Nombre y email son obligatorios"); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/admin/doctors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, ...form }),
      });
      const data = (await res.json()) as { doctor?: Doctor; error?: string };
      if (!res.ok) { setError(data.error ?? "Error al crear"); setLoading(false); return; }
      onCreated(data.doctor!);
      onClose();
    } catch {
      setError("Error de conexión");
    }
    setLoading(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }}>
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-base font-semibold text-slate-800">Agregar médico</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 p-6">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600">Nombre completo *</label>
            <input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Dr. Juan Pérez" className={inputCls()} />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600">Email *</label>
            <input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="doctor@clinica.cl" className={inputCls()} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600">Especialidad</label>
              <input value={form.specialty} onChange={(e) => set("specialty", e.target.value)} placeholder="Medicina general" className={inputCls()} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600">N° Licencia</label>
              <input value={form.licenseNum} onChange={(e) => set("licenseNum", e.target.value)} placeholder="LIC-1234" className={inputCls()} />
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600">RUT</label>
            <input value={form.rut} onChange={(e) => set("rut", e.target.value)} placeholder="12.345.678-9" className={inputCls()} />
          </div>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50">
              Cancelar
            </button>
            <button type="submit" disabled={loading} className="flex-1 rounded-xl bg-sky-500 py-2.5 text-sm font-medium text-white transition hover:bg-sky-600 disabled:opacity-50">
              {loading ? "Guardando…" : "Crear médico"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AdminDoctorsPage() {
  const { token } = useAdmin();
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Doctor | null>(null);
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  const fetchDoctors = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/doctors?token=${encodeURIComponent(token)}`);
      const data = (await res.json()) as { doctors?: Doctor[] };
      setDoctors(data.doctors ?? []);
    } catch { /* ignore */ }
    setLoading(false);
  }, [token]);

  useEffect(() => { void fetchDoctors(); }, [fetchDoctors]);

  async function toggleStatus(doctor: Doctor) {
    const newStatus = doctor.status === "active" ? "blocked" : "active";
    setActionLoading(doctor.id);
    await fetch("/api/admin/doctors", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, id: doctor.id, status: newStatus }),
    });
    setDoctors((prev) => prev.map((d) => d.id === doctor.id ? { ...d, status: newStatus } : d));
    setActionLoading(null);
  }

  async function approveDoctor(doctor: Doctor) {
    setActionLoading(doctor.id);
    await fetch("/api/admin/doctors", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, id: doctor.id, status: "active" }),
    });
    setDoctors((prev) => prev.map((d) => d.id === doctor.id ? { ...d, status: "active" } : d));
    setActionLoading(null);
  }

  async function deleteDoctor(doctor: Doctor) {
    setActionLoading(doctor.id);
    await fetch("/api/admin/doctors", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, id: doctor.id }),
    });
    setDoctors((prev) => prev.filter((d) => d.id !== doctor.id));
    setConfirmDelete(null);
    setActionLoading(null);
  }

  const filtered = doctors.filter((d) => {
    const q = search.toLowerCase();
    return !q || d.name.toLowerCase().includes(q) || d.email.toLowerCase().includes(q) || (d.specialty ?? "").toLowerCase().includes(q);
  });

  const activeCount = doctors.filter((d) => d.status === "active").length;
  const blockedCount = doctors.filter((d) => d.status === "blocked").length;
  const pendingCount = doctors.filter((d) => d.status === "pending").length;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Médicos</h1>
          <p className="mt-0.5 text-sm text-slate-500">{doctors.length} registrados · {pendingCount} pendientes · {activeCount} activos · {blockedCount} bloqueados</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 rounded-xl bg-sky-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-600"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
          Agregar médico
        </button>
      </div>

      {/* Stats pills */}
      <div className="flex gap-3">
        {[
          { label: "Total", value: doctors.length, color: "bg-slate-100 text-slate-700" },
          { label: "Pendientes", value: pendingCount, color: "bg-amber-100 text-amber-700" },
          { label: "Activos", value: activeCount, color: "bg-emerald-100 text-emerald-700" },
          { label: "Bloqueados", value: blockedCount, color: "bg-rose-100 text-rose-700" },
        ].map((s) => (
          <div key={s.label} className={`rounded-xl px-4 py-2 text-sm font-medium ${s.color}`}>
            <span className="font-bold text-base">{s.value}</span> {s.label}
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
          <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
        </svg>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre, email o especialidad…"
          className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-500/20"
        />
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-sky-500 border-t-transparent" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-sm text-slate-400">
            {search ? "Sin resultados para tu búsqueda" : "No hay médicos registrados. ¡Agrega el primero!"}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {/* Table header */}
            <div className="grid grid-cols-[1fr_1fr_auto_auto_auto] gap-4 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
              <span>Nombre</span>
              <span>Email</span>
              <span>Especialidad</span>
              <span>Estado</span>
              <span>Acciones</span>
            </div>
            {filtered.map((d) => (
              <div key={d.id} className="grid grid-cols-[1fr_1fr_auto_auto_auto] items-center gap-4 px-5 py-4">
                {/* Name + date */}
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-800">{d.name}</p>
                  {d.rut && <p className="text-xs text-slate-400">{d.rut}</p>}
                  <p className="text-xs text-slate-400">Desde {fmtDate(d.created_at)}</p>
                </div>
                {/* Email */}
                <p className="truncate text-sm text-slate-600">{d.email}</p>
                {/* Specialty */}
                <p className="text-sm text-slate-500">{d.specialty ?? "—"}</p>
                {/* Status badge */}
                <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  d.status === "active" ? "bg-emerald-100 text-emerald-700"
                    : d.status === "pending" ? "bg-amber-100 text-amber-700"
                    : "bg-rose-100 text-rose-600"
                }`}>
                  {d.status === "active" ? "Activo" : d.status === "pending" ? "Pendiente" : "Bloqueado"}
                </span>
                {/* Actions */}
                <div className="flex items-center gap-1.5">
                  {d.status === "pending" && (
                    <button
                      onClick={() => void approveDoctor(d)}
                      disabled={actionLoading === d.id}
                      title="Aprobar médico"
                      className="rounded-lg bg-emerald-500 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-emerald-600 disabled:opacity-40"
                    >
                      Aprobar
                    </button>
                  )}
                  {d.status !== "pending" && (
                  <button
                    onClick={() => void toggleStatus(d)}
                    disabled={actionLoading === d.id}
                    title={d.status === "active" ? "Bloquear" : "Activar"}
                    className={`rounded-lg p-1.5 text-xs font-medium transition ${
                      d.status === "active"
                        ? "text-amber-500 hover:bg-amber-50"
                        : "text-emerald-600 hover:bg-emerald-50"
                    } disabled:opacity-40`}
                  >
                    {d.status === "active" ? (
                      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                        <path d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                        <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    )}
                  </button>
                  )}
                  <button
                    onClick={() => setConfirmDelete(d)}
                    disabled={actionLoading === d.id}
                    title="Eliminar"
                    className="rounded-lg p-1.5 text-rose-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40"
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add doctor modal */}
      {showAdd && (
        <AddDoctorModal
          token={token}
          onClose={() => setShowAdd(false)}
          onCreated={(d) => setDoctors((prev) => [d, ...prev])}
        />
      )}

      {/* Delete confirm dialog */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-base font-semibold text-slate-800">¿Eliminar médico?</h3>
            <p className="mt-2 text-sm text-slate-500">
              Se eliminará permanentemente a <strong>{confirmDelete.name}</strong> ({confirmDelete.email}).
              Las consultas asociadas no se eliminarán.
            </p>
            <div className="mt-5 flex gap-3">
              <button onClick={() => setConfirmDelete(null)} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50">
                Cancelar
              </button>
              <button
                onClick={() => void deleteDoctor(confirmDelete)}
                disabled={actionLoading === confirmDelete.id}
                className="flex-1 rounded-xl bg-rose-500 py-2.5 text-sm font-medium text-white hover:bg-rose-600 disabled:opacity-50"
              >
                {actionLoading === confirmDelete.id ? "Eliminando…" : "Eliminar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
