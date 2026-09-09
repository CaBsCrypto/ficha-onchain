'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePrivyEmail } from '@/hooks/usePrivyEmail';
import { authedFetch } from '@/lib/auth/authed-fetch';
import { FormField, inputCls, textareaCls } from './Modal';

// ── Types ─────────────────────────────────────────────────────────────────────
interface DoctorProfile {
  id: string;
  name: string;
  email: string;
  specialty: string | null;
  bio: string | null;
  telemedicine: boolean;
  license_num: string | null;
  rut: string | null;
  phone: string | null;
  center_name: string | null;
  center_address: string | null;
  signature_url: string | null;
  status: string;
  created_at: string;
}

// ── Spinner ───────────────────────────────────────────────────────────────────
function Spinner({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={`${className} animate-spin`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="10" strokeOpacity={0.2} />
      <path d="M12 2a10 10 0 0110 10" strokeLinecap="round" />
    </svg>
  );
}

// ── PerfilTab ───────────────────────────────────────────────────────────────
export function PerfilTab() {
  const doctorEmail = usePrivyEmail() ?? '';

  const [name, setName] = useState('');
  const [licenseNum, setLicenseNum] = useState('');
  const [rut, setRut] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [phone, setPhone] = useState('');
  const [centerName, setCenterName] = useState('');
  const [centerAddress, setCenterAddress] = useState('');
  const [bio, setBio] = useState('');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [missing, setMissing] = useState(false);

  const load = useCallback(async () => {
    if (!doctorEmail) return;
    setLoading(true);
    setError('');
    try {
      const res = await authedFetch('/api/doctor/profile');
      const data = (await res.json()) as { data?: DoctorProfile | null; error?: string };
      if (!res.ok) {
        setError(data.error ?? 'No se pudo cargar el perfil');
      } else if (!data.data) {
        setMissing(true);
      } else {
        const p = data.data;
        setName(p.name ?? '');
        setLicenseNum(p.license_num ?? '');
        setRut(p.rut ?? '');
        setSpecialty(p.specialty ?? '');
        setPhone(p.phone ?? '');
        setCenterName(p.center_name ?? '');
        setCenterAddress(p.center_address ?? '');
        setBio(p.bio ?? '');
        setMissing(false);
      }
    } catch {
      setError('Error de conexión — revisa tu red');
    }
    setLoading(false);
  }, [doctorEmail]);

  useEffect(() => { void load(); }, [load]);

  const dirty = () => setSaved(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (saving || missing || !name.trim()) return;
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const res = await authedFetch('/api/doctor/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          license_num: licenseNum,
          rut,
          specialty,
          phone,
          center_name: centerName,
          center_address: centerAddress,
          bio,
        }),
      });
      const data = (await res.json()) as { data?: DoctorProfile; error?: string };
      if (!res.ok) {
        setError(data.error ?? 'No se pudo guardar el perfil');
        setSaving(false);
        return;
      }
      setSaved(true);
      setMissing(false);
    } catch {
      setError('Error de conexión — revisa tu red');
    }
    setSaving(false);
  }

  if (!doctorEmail) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-800">Mi perfil</h2>
        <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700 ring-1 ring-inset ring-amber-200">
          Inicia sesión para ver y editar tu perfil médico.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-800">Mi perfil</h2>
        <p className="break-all text-xs text-slate-500">{doctorEmail}</p>
        <p className="mt-2 text-sm text-slate-600">Perfil de prueba creado por el administrador. Utiliza únicamente datos sintéticos; guardar cambios aquí no modifica tu autorización en Stellar.</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-400">
          <Spinner className="h-6 w-6" />
        </div>
      ) : (
        <>
          {missing && (
            <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700 ring-1 ring-inset ring-amber-200">
              Tu cuenta médica aún no está registrada por el administrador. Podrás guardar tu
              perfil una vez que sea habilitada.
            </div>
          )}

          <form onSubmit={handleSave} className="space-y-4">
            {/* ── Perfil de prueba ── */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">
                Identificación del perfil de prueba
              </p>
              <p className="mb-4 text-xs text-slate-400">
                Estos datos pertenecen al perfil de la aplicación. DoctorRegistryPrivate acredita
                la autorización y vigencia de tu wallet mediante el expediente revisado por el administrador.
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField label="Nombre de prueba" required>
                  <input value={name} onChange={(e) => { setName(e.target.value); dirty(); }}
                    placeholder="Médico de prueba TrustLeaf" className={inputCls} />
                </FormField>
                <FormField label="Especialidad">
                  <input value={specialty} onChange={(e) => { setSpecialty(e.target.value); dirty(); }}
                    placeholder="Medicina general (prueba)" className={inputCls} />
                </FormField>
                <FormField label="Registro sintético">
                  <input value={licenseNum} onChange={(e) => { setLicenseNum(e.target.value); dirty(); }}
                    placeholder="TEST-STELLAR-REGISTRY" className={inputCls} />
                </FormField>
                <FormField label="Identificador sintético">
                  <input value={rut} onChange={(e) => { setRut(e.target.value); dirty(); }}
                    placeholder="TEST-DOCTOR" className={inputCls} />
                </FormField>
              </div>
            </div>

            {/* ── Contacto y centro ── */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">
                Contacto y centro de prueba
              </p>
              <p className="mb-4 text-xs text-slate-400">
                Referencias opcionales del perfil. No se incorporan al documento privado de la receta en este hito.
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField label="Teléfono de prueba (opcional)">
                  <input value={phone} onChange={(e) => { setPhone(e.target.value); dirty(); }}
                    placeholder="Sin teléfono de contacto real" className={inputCls} />
                </FormField>
                <FormField label="Centro sintético">
                  <input value={centerName} onChange={(e) => { setCenterName(e.target.value); dirty(); }}
                    placeholder="Centro de prueba TrustLeaf" className={inputCls} />
                </FormField>
                <div className="sm:col-span-2">
                  <FormField label="Dirección sintética (opcional)">
                    <input value={centerAddress} onChange={(e) => { setCenterAddress(e.target.value); dirty(); }}
                      placeholder="Dirección de prueba" className={inputCls} />
                  </FormField>
                </div>
              </div>
            </div>

            {/* ── Presentación ── */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-400">
                Presentación
              </p>
              <FormField label="Presentación sintética">
                <textarea value={bio} onChange={(e) => { setBio(e.target.value); dirty(); }}
                  placeholder="Breve descripción del médico de prueba." rows={4} maxLength={2000}
                  className={textareaCls} />
                <span className="mt-1 block text-right text-[10px] text-slate-400">{bio.length}/2000</span>
              </FormField>
              <p className="mt-3 text-xs text-slate-500">La firma de las recetas se realiza con tu wallet Stellar mediante Privy, al confirmar cada operación.</p>
            </div>

            {error && <div role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600">{error}</div>}
            {saved && (
              <div className="rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-700 ring-1 ring-inset ring-emerald-200">
                Perfil guardado.
              </div>
            )}

            <div className="flex justify-end">
              <button type="submit" disabled={saving || missing || !name.trim()}
                className="w-full rounded-xl bg-sky-500 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">
                {saving ? <span className="flex items-center justify-center gap-2"><Spinner /> Guardando…</span> : 'Guardar perfil'}
              </button>
            </div>
          </form>
        </>
      )}
    </div>
  );
}
