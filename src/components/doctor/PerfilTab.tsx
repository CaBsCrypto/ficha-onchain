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
  const [signatureUrl, setSignatureUrl] = useState('');
  const [bio, setBio] = useState('');
  const [telemedicine, setTelemedicine] = useState(false);

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
        setSignatureUrl(p.signature_url ?? '');
        setBio(p.bio ?? '');
        setTelemedicine(Boolean(p.telemedicine));
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
          signature_url: signatureUrl,
          bio,
          telemedicine,
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
        <p className="text-xs text-slate-400">{doctorEmail}</p>
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
            {/* ── Identidad legal ── */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">
                Identidad legal
              </p>
              <p className="mb-4 text-xs text-slate-400">
                Aparece en tus recetas y licencias. El nombre y el N° de registro se verifican
                contra el registro on-chain.
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField label="Nombre completo" required>
                  <input value={name} onChange={(e) => { setName(e.target.value); dirty(); }}
                    placeholder="Dr. Nombre Apellido" className={inputCls} />
                </FormField>
                <FormField label="Especialidad">
                  <input value={specialty} onChange={(e) => { setSpecialty(e.target.value); dirty(); }}
                    placeholder="Ej: Medicina General" className={inputCls} />
                </FormField>
                <FormField label="N° registro (Superintendencia de Salud)">
                  <input value={licenseNum} onChange={(e) => { setLicenseNum(e.target.value); dirty(); }}
                    placeholder="Ej: 123456" className={inputCls} />
                </FormField>
                <FormField label="RUT">
                  <input value={rut} onChange={(e) => { setRut(e.target.value); dirty(); }}
                    placeholder="12.345.678-9" className={inputCls} />
                </FormField>
              </div>
            </div>

            {/* ── Contacto y centro ── */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">
                Contacto y centro de atención
              </p>
              <p className="mb-4 text-xs text-slate-400">
                Membrete de la receta: dónde atiendes y cómo te contactan el paciente o la farmacia.
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField label="Teléfono">
                  <input value={phone} onChange={(e) => { setPhone(e.target.value); dirty(); }}
                    placeholder="+56 9 1234 5678" className={inputCls} />
                </FormField>
                <FormField label="Centro / clínica">
                  <input value={centerName} onChange={(e) => { setCenterName(e.target.value); dirty(); }}
                    placeholder="Ej: Clínica Vitacura" className={inputCls} />
                </FormField>
                <div className="sm:col-span-2">
                  <FormField label="Dirección del centro">
                    <input value={centerAddress} onChange={(e) => { setCenterAddress(e.target.value); dirty(); }}
                      placeholder="Av. Siempre Viva 742, Santiago" className={inputCls} />
                  </FormField>
                </div>
              </div>
            </div>

            {/* ── Firma / sello ── */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">
                Firma / sello
              </p>
              <p className="mb-4 text-xs text-slate-400">
                URL de tu firma o sello digital, estampado en cada receta emitida.
              </p>
              <FormField label="URL de firma (imagen)">
                <input value={signatureUrl} onChange={(e) => { setSignatureUrl(e.target.value); dirty(); }}
                  placeholder="https://…/firma.png" className={inputCls} />
              </FormField>
              {signatureUrl.trim() !== '' && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={signatureUrl} alt="Vista previa de la firma"
                  className="mt-3 h-16 rounded-lg border border-slate-200 bg-slate-50 object-contain px-2" />
              )}
            </div>

            {/* ── Presentación ── */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-400">
                Presentación
              </p>
              <FormField label="Biografía / presentación">
                <textarea value={bio} onChange={(e) => { setBio(e.target.value); dirty(); }}
                  placeholder="Breve descripción para tus pacientes." rows={4} maxLength={2000}
                  className={textareaCls} />
                <span className="mt-1 block text-right text-[10px] text-slate-400">{bio.length}/2000</span>
              </FormField>

              <label className="mt-2 flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3">
                <span>
                  <span className="block text-sm font-medium text-slate-700">Telemedicina</span>
                  <span className="block text-xs text-slate-400">Habilita consultas por videollamada</span>
                </span>
                <button type="button" role="switch" aria-checked={telemedicine}
                  onClick={() => { setTelemedicine((v) => !v); dirty(); }}
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${telemedicine ? 'bg-sky-500' : 'bg-slate-200'}`}>
                  <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${telemedicine ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </button>
              </label>
            </div>

            {error && <div className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600">{error}</div>}
            {saved && (
              <div className="rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-700 ring-1 ring-inset ring-emerald-200">
                Perfil guardado.
              </div>
            )}

            <div className="flex justify-end">
              <button type="submit" disabled={saving}
                className="rounded-xl bg-sky-500 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-50">
                {saving ? <span className="flex items-center justify-center gap-2"><Spinner /> Guardando…</span> : 'Guardar perfil'}
              </button>
            </div>
          </form>
        </>
      )}
    </div>
  );
}
