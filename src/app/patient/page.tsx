'use client';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { PortalHome, PortalIdentity } from '@/components/private-portal/Home';
import { PrivateConsultations } from '@/components/private-portal/Consultations';
import { PrivatePrescriptions } from '@/components/private-portal/Prescriptions';
function PatientPageContent() {
  const tab = useSearchParams().get('tab') ?? 'inicio';
  if (tab === 'consultas') return <PrivateConsultations role="patient" />;
  if (tab === 'recetas') return <PrivatePrescriptions role="patient" />;
  if (tab === 'perfil') return <PortalIdentity role="patient" />;
  if (tab === 'inicio') return <PortalHome role="patient" />;
  return <p className="rounded-xl bg-white p-5 text-sm text-slate-600">Esta sección no está habilitada en el entorno de prueba.</p>;
}
export default function PatientPage() { return <Suspense fallback={<p className="p-6 text-sm text-slate-500">Cargando portal…</p>}><PatientPageContent /></Suspense>; }
