'use client';
import { Suspense } from 'react';
import { usePortalLanguage } from '@/hooks/useLanguage';
import { useRouter, useSearchParams } from 'next/navigation';
import { DisponibilidadTab } from '@/components/doctor/DisponibilidadTab';
import { PerfilTab } from '@/components/doctor/PerfilTab';
import { PortalHome } from '@/components/private-portal/Home';
import { PrivateConsultations } from '@/components/private-portal/Consultations';
import { DoctorClinicalHistory } from '@/components/private-portal/DoctorClinicalHistory';
import { PrivatePrescriptions } from '@/components/private-portal/Prescriptions';
import { consultationHref, readConsultationId } from '@/components/private-portal/appointment-navigation';
function DoctorPageContent() {
  const language = usePortalLanguage();
  const english = language === 'en';
  const router = useRouter();
  const params = useSearchParams();
  const tab = params.get('tab') ?? 'inicio';
  if (tab === 'historial') {
    const records = params.getAll('record');
    return <DoctorClinicalHistory requestedRecord={records.length > 1 ? null : records[0]} />;
  }
  if (tab === 'consultas') return <PrivateConsultations role="doctor" appointmentId={readConsultationId(params)}
    onNavigate={id => router.push(consultationHref('doctor', language, id))} />;
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
