'use client';
import { Suspense } from 'react';
import { usePortalLanguage } from '@/hooks/useLanguage';
import { useRouter, useSearchParams } from 'next/navigation';
import { PortalHome, PortalIdentity } from '@/components/private-portal/Home';
import { PrivateConsultations } from '@/components/private-portal/Consultations';
import { PrivatePrescriptions } from '@/components/private-portal/Prescriptions';
import { ClinicalHistory } from '@/components/private-portal/ClinicalHistory';
import { ClinicalPermissions } from '@/components/private-portal/ClinicalPermissions';
import { consultationHref, readConsultationId } from '@/components/private-portal/appointment-navigation';
function PatientPageContent() {
  const language = usePortalLanguage();
  const english = language === 'en';
  const router = useRouter();
  const search = useSearchParams();
  const tab = search.get('tab') ?? 'inicio';
  if (tab === 'consultas') return <PrivateConsultations role="patient" appointmentId={readConsultationId(search)}
    onNavigate={id => router.push(consultationHref('patient', language, id))} />;
  if (tab === 'recetas') return <PrivatePrescriptions role="patient" />;
  if (tab === 'historial') {
    const appointmentId = readConsultationId(search);
    return <ClinicalHistory permissionAppointmentId={appointmentId} renderPermissions={props => <ClinicalPermissions {...props} />} />;
  }
  if (tab === 'perfil') return <PortalIdentity role="patient" />;
  if (tab === 'inicio') return <PortalHome role="patient" />;
  return <p className="rounded-xl bg-white p-5 text-sm text-slate-600">{english ? 'This section is unavailable in the test environment.' : 'Esta sección no está habilitada en el entorno de prueba.'}</p>;
}
export default function PatientPage() {
  const english = usePortalLanguage() === 'en';
  return <Suspense fallback={<p className="p-6 text-sm text-slate-500">{english ? 'Loading portal…' : 'Cargando portal…'}</p>}><PatientPageContent /></Suspense>;
}
