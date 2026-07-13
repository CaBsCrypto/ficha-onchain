"use client";
// Página de Emergencia para Alzheimer / Adultos Dependientes
// Accessible desde QR — sin login, sin app — funciona en urgencias
// Bilingüe: Español + English (crítico para turistas, viajes, traslados)

import { useParams } from "next/navigation";

// ─── Patient Data (demo) ──────────────────────────────────────────────────────

const PATIENT = {
  name: "Roberto Pérez Salas",
  age: 78,
  rut: "5.432.198-7",
  photo: null, // null = iniciales
  condition: "Alzheimer — Etapa Moderada",
  conditionEn: "Alzheimer's Disease — Moderate Stage",
  bloodType: "A+",
  allergies: ["Penicilina / Penicillin", "Ibuprofeno / Ibuprofen"],
  activeConditions: [
    "Hipertensión arterial / Hypertension",
    "Reflujo gastroesofágico / GERD",
  ],
  medications: [
    { name: "Donepezilo 10mg", times: "08:00", note: "Alzheimer drug — do not skip" },
    { name: "Memantina 10mg", times: "08:00 / 20:00", note: "Alzheimer drug" },
    { name: "Omeprazol 20mg", times: "08:00", note: "Gastric protector" },
    { name: "Losartán 50mg", times: "20:00", note: "Blood pressure" },
    { name: "Lorazepam 0.5mg", times: "22:00 PRN", note: "ONLY for severe agitation" },
  ],
  emergencyContacts: [
    { name: "Ana Pérez", relation: "Hija / Daughter", phone: "+56 9 8765 4321", isPrimary: true },
    { name: "Carlos Pérez", relation: "Hijo / Son", phone: "+56 9 1234 5678", isPrimary: false },
    { name: "Dra. María González", relation: "Neuróloga / Neurologist", phone: "+56 2 2345 6789", isPrimary: false },
  ],
  lastUpdated: "2026-07-12",
  blockchainVerified: true,
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function CaregiverEmergencyPage() {
  const params = useParams();
  // In production, params.rut would fetch real patient data from blockchain
  // Demo: always shows Roberto Pérez Salas
  const _rut = params?.rut;

  return (
    <div className="min-h-screen bg-red-950 text-white">
      {/* Header — maximum visibility */}
      <div className="bg-red-600 px-4 py-5 text-center">
        <div className="text-4xl mb-2">🆘</div>
        <h1 className="text-white font-black text-2xl uppercase tracking-wide">
          PACIENTE CON ALZHEIMER
        </h1>
        <p className="text-red-200 font-bold text-lg mt-1">
          ALZHEIMER'S PATIENT
        </p>
        <p className="text-red-100 text-sm mt-2 leading-relaxed">
          Si encontró a esta persona desorientada, por favor llame al familiar de contacto.
          <br />
          <span className="text-red-200">If you found this person disoriented, please call their family contact.</span>
        </p>
      </div>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-5">

        {/* Patient identity */}
        <div className="bg-white/10 backdrop-blur border border-white/20 rounded-2xl p-5">
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 rounded-2xl bg-white/20 flex items-center justify-center text-white text-2xl font-black shrink-0">
              {PATIENT.name.split(" ").map(n => n[0]).slice(0, 2).join("")}
            </div>
            <div>
              <h2 className="text-white font-black text-xl">{PATIENT.name}</h2>
              <p className="text-red-200 text-sm">{PATIENT.age} años / years old</p>
              <p className="text-red-300 text-xs mt-1">RUT: {PATIENT.rut}</p>
              <div className="flex items-center gap-2 mt-2">
                <span className="px-3 py-1 bg-red-600 text-white font-black text-lg rounded-xl">
                  {PATIENT.bloodType}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* CRITICAL: Allergies */}
        <div className="bg-yellow-400 rounded-2xl p-5">
          <h3 className="text-yellow-900 font-black text-lg uppercase flex items-center gap-2">
            ⚠️ ALERGIAS / ALLERGIES
          </h3>
          <div className="mt-2 space-y-1">
            {PATIENT.allergies.map((a, i) => (
              <p key={i} className="text-yellow-900 font-bold text-base">• {a}</p>
            ))}
          </div>
        </div>

        {/* Primary emergency contact — BIG */}
        <div className="bg-white rounded-2xl p-5">
          <h3 className="text-gray-800 font-black text-base uppercase mb-1">
            📞 Contacto de emergencia / Emergency Contact
          </h3>
          {PATIENT.emergencyContacts.filter(c => c.isPrimary).map((c, i) => (
            <div key={i}>
              <p className="text-gray-900 font-bold text-xl">{c.name}</p>
              <p className="text-gray-500 text-sm">{c.relation}</p>
              <a
                href={`tel:${c.phone.replace(/\s/g, "")}`}
                className="mt-3 flex items-center justify-center gap-2 w-full py-4 bg-green-500 hover:bg-green-400 text-white font-black text-xl rounded-2xl transition-colors"
              >
                📞 {c.phone}
              </a>
            </div>
          ))}
        </div>

        {/* Other contacts */}
        <div className="bg-white/10 border border-white/20 rounded-2xl overflow-hidden">
          <div className="px-5 py-3 border-b border-white/20">
            <h3 className="text-white font-bold text-sm">Otros contactos / Other contacts</h3>
          </div>
          {PATIENT.emergencyContacts.filter(c => !c.isPrimary).map((c, i) => (
            <div key={i} className="flex items-center justify-between px-5 py-3 border-b border-white/10 last:border-0">
              <div>
                <p className="text-white font-semibold text-sm">{c.name}</p>
                <p className="text-red-300 text-xs">{c.relation}</p>
              </div>
              <a
                href={`tel:${c.phone.replace(/\s/g, "")}`}
                className="px-4 py-2 bg-white/20 hover:bg-white/30 text-white text-sm font-semibold rounded-xl transition-colors"
              >
                {c.phone}
              </a>
            </div>
          ))}
        </div>

        {/* Condition */}
        <div className="bg-white/10 border border-white/20 rounded-2xl p-5">
          <h3 className="text-white font-bold text-sm mb-3">🏥 Diagnósticos / Conditions</h3>
          <div className="space-y-1.5">
            <div className="px-3 py-2 bg-red-600/30 border border-red-500 rounded-xl">
              <p className="text-white font-bold text-sm">{PATIENT.condition}</p>
              <p className="text-red-300 text-xs">{PATIENT.conditionEn}</p>
            </div>
            {PATIENT.activeConditions.map((c, i) => (
              <p key={i} className="text-red-200 text-xs px-3">• {c}</p>
            ))}
          </div>
        </div>

        {/* Medications */}
        <div className="bg-white/10 border border-white/20 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-white/20">
            <h3 className="text-white font-bold text-sm">💊 Medicamentos activos / Active medications</h3>
          </div>
          <div className="divide-y divide-white/10">
            {PATIENT.medications.map((med, i) => (
              <div key={i} className="px-5 py-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-white font-semibold text-sm">{med.name}</p>
                  <p className="text-red-300 text-xs shrink-0">{med.times}</p>
                </div>
                {med.note.includes("PRN") || med.name.includes("Lorazepam") ? (
                  <p className="text-yellow-300 text-xs mt-0.5">⚠️ {med.note}</p>
                ) : (
                  <p className="text-red-300 text-xs mt-0.5">{med.note}</p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Clinical guidance */}
        <div className="bg-blue-900/40 border border-blue-700 rounded-2xl p-5">
          <h3 className="text-blue-300 font-bold text-sm mb-3">
            👨‍⚕️ Guía para el equipo médico / Clinical Guidance
          </h3>
          <div className="space-y-2 text-sm text-blue-100 leading-relaxed">
            <p>• <strong>NO usar Penicilina ni Ibuprofeno</strong> (alérgico / allergic)</p>
            <p>• En caso de agitación: primero medidas no farmacológicas (música, voz suave, contacto físico)</p>
            <p>• <em>For agitation: try non-pharmacological first (music, gentle touch, calm voice)</em></p>
            <p>• Tiene pauta de Lorazepam 0.5mg PRN para agitación severa</p>
            <p>• <em>Has Lorazepam 0.5mg PRN prescription for severe agitation</em></p>
            <p>• No separar del familiar si está presente — aumenta agitación</p>
            <p>• <em>Do not separate from family member — increases agitation</em></p>
          </div>
        </div>

        {/* Blockchain verification */}
        <div className="bg-[#10B981]/10 border border-[#10B981]/40 rounded-2xl p-4 flex items-center gap-3">
          <svg viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth={2} className="w-5 h-5 shrink-0">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <polyline points="9 12 11 14 15 10" />
          </svg>
          <div>
            <p className="text-[#10B981] font-bold text-xs">Verificado en Stellar Blockchain</p>
            <p className="text-[#94A3B8] text-xs">
              Última actualización: {PATIENT.lastUpdated} · Datos no alterables
            </p>
            <p className="text-[#64748B] text-[10px]">
              Verified on Stellar Blockchain — tamper-proof medical record
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center pb-6">
          <p className="text-red-400 text-xs">Powered by TrustLeaf · trustleaf.cl</p>
          <p className="text-red-600 text-[10px] mt-1">
            Este QR es generado y controlado por el cuidador autorizado.
          </p>
        </div>

      </main>
    </div>
  );
}
