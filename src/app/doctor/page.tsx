'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { InicioTab } from '@/components/doctor/InicioTab';
import { PacientesTab } from '@/components/doctor/PacientesTab';
import { ConsultasTab } from '@/components/doctor/ConsultasTab';
import { RecetasTab } from '@/components/doctor/RecetasTab';
import { LicenciasTab } from '@/components/doctor/LicenciasTab';
import { DisponibilidadTab } from '@/components/doctor/DisponibilidadTab';
import { PerfilTab } from '@/components/doctor/PerfilTab';

// ── Inner content (uses useSearchParams → must be inside Suspense) ────────────
function DoctorPageContent() {
  const searchParams = useSearchParams();
  const tab = searchParams.get('tab') ?? 'inicio';

  return (
    <>
      {tab === 'inicio'    && <InicioTab />}
      {tab === 'pacientes' && <PacientesTab />}
      {tab === 'consultas' && <ConsultasTab />}
      {tab === 'recetas'   && <RecetasTab />}
      {tab === 'licencias' && <LicenciasTab />}
      {tab === 'disponibilidad' && <DisponibilidadTab />}
      {tab === 'perfil'    && <PerfilTab />}
      {/* Fallback for unknown tabs */}
      {!['inicio', 'pacientes', 'consultas', 'recetas', 'licencias', 'disponibilidad', 'perfil'].includes(tab) && <InicioTab />}
    </>
  );
}

// ── Page (default export) ─────────────────────────────────────────────────────
export default function DoctorPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-sky-500 border-t-transparent" />
        </div>
      }
    >
      <DoctorPageContent />
    </Suspense>
  );
}
