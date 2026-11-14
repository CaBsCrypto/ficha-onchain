'use client';
import { Suspense } from 'react';
import { usePortalLanguage } from '@/hooks/useLanguage';
import { useSearchParams } from 'next/navigation';
import { DisponibilidadTab } from '@/components/doctor/DisponibilidadTab';
import { PerfilTab } from '@/components/doctor/PerfilTab';
import { PortalHome } from '@/components/private-portal/Home';
import { PrivateConsultations } from '@/components/private-portal/Consultations';
import { DoctorClinicalHistory } from '@/components/private-portal/DoctorClinicalHistory';
import { PrivatePrescriptions } from '@/components/private-portal/Prescriptions';
function DoctorPageContent() {
  const english = usePortalLanguage() === 'en';
  const tab = useSearchParams().get('tab') ?? 'inicio';
  if (tab === 'historial') return <DoctorClinicalHistory />;
  if (tab === 'consultas') return <PrivateConsultations role="doctor" />;
  if (tab === 'recetas') return <PrivatePrescriptions role="doctor" />;
  if (tab === 'disponibilidad') return <DisponibilidadTab />;
  if (tab === 'perfil') return <PerfilTab />;
  if (tab === 'inicio') return <PortalHome role="doctor" />;
  return <p className="rounded-xl bg-white p-5 text-sm text-slate-600">{english ? 'This section is unavailable in the test environment.' : 'Esta sección no está habilitada en el entorno de prueba.'}</p>;
}
export default function DoctorPage() {
  const english = usePortalLanguage() === 'en';
  return <Suspense fallback={<p className="p-6 text-sm text-slate-500">{english ? 'Loading portal…' : 'Cargando portal…'}</p>}><DoctorPageContent /></Suspense>;
}
