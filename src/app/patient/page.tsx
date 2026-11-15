'use client';
import { Suspense } from 'react';
import { usePortalLanguage } from '@/hooks/useLanguage';
import { useSearchParams } from 'next/navigation';
import { PortalHome, PortalIdentity } from '@/components/private-portal/Home';
import { PrivateConsultations } from '@/components/private-portal/Consultations';
import { PrivatePrescriptions } from '@/components/private-portal/Prescriptions';
import { ClinicalHistory } from '@/components/private-portal/ClinicalHistory';
import { ClinicalPermissions } from '@/components/private-portal/ClinicalPermissions';
function PatientPageContent() {
  const english = usePortalLanguage() === 'en';
  const search = useSearchParams();
  const tab = search.get('tab') ?? 'inicio';
  if (tab === 'consultas') return <PrivateConsultations role="patient" />;
  if (tab === 'recetas') return <PrivatePrescriptions role="patient" />;
  if (tab === 'historial') {
    const appointmentIds = search.getAll('appointmentId');
    const raw = appointmentIds[0];
    const appointmentId = appointmentIds.length === 1 && /^[1-9]\d{0,9}$/.test(raw) && Number(raw) <= 2_147_483_647
      ? Number(raw) : undefined;
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
