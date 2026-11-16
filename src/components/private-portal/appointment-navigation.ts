import type { PortalRole } from './types';

export function readConsultationId(params: Pick<URLSearchParams, 'getAll'>) {
  const ids = params.getAll('appointmentId');
  const raw = ids[0];
  if (ids.length !== 1 || !/^[1-9]\d{0,9}$/.test(raw) || Number(raw) > 2_147_483_647) return undefined;
  return Number(raw);
}

export function consultationHref(role: PortalRole, language: 'es' | 'en', appointmentId?: number) {
  const path = role === 'patient' ? '/patient' : '/doctor';
  const query = new URLSearchParams({ tab: 'consultas' });
  if (appointmentId !== undefined) query.set('appointmentId', String(appointmentId));
  query.set('lang', language);
  return path + '?' + query.toString();
}
