// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ConsultationDetail } from '@/components/private-portal/ConsultationDetail';
const state = vi.hoisted(() => ({
  data: null as any, operation: null as any, loading: false,
  records: [] as { historyId: string; activeAppointmentIds: number[] }[], blocked: false,
  inboxLoading: false, inboxError: '', inboxEnabled: true, inboxRefresh: vi.fn(),
}));
vi.mock('@/components/private-portal/DoctorClinicalInbox', () => ({
  useDoctorClinicalInbox: () => ({
    enabled: state.inboxEnabled, data: state.inboxLoading ? null : { records: state.records, notifications: [] },
    loading: state.inboxLoading, error: state.inboxError, recordNavigationBlocked: state.blocked,
    canNavigateToRecord: () => !state.blocked, refresh: state.inboxRefresh,
  }),
}));
vi.mock('@/components/private-portal/client', async importOriginal => ({
  ...await importOriginal<typeof import('@/components/private-portal/client')>(),
  usePortalData: () => ({ data: state.data, loading: state.loading, refresh: vi.fn() }),
  localDate: () => 'synthetic date', jsonBody: vi.fn(), portalApi: vi.fn(),
}));
vi.mock('@/components/private-portal/Operation', () => ({
  usePrivateOperation: () => ({ operation: state.operation, run: vi.fn() }),
  OperationNotice: ({operation}: any) => operation ? createElement('p', {'data-operation': operation.id}, operation.id) : null,
  ReceiptLink: () => null, ConfirmationButton: () => null,
}));
vi.mock('@/components/private-portal/Prescriptions', () => ({
  PrescriptionCard: ({prescription}: any) => prescription.operation
    ? createElement('p', {'data-operation': prescription.operation.id}, prescription.operation.id) : null,
}));
let root: Root, box: HTMLDivElement;
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  box = document.createElement('div'); document.body.append(box); root = createRoot(box);
  state.operation = { id: 'mint', action: 'mint', state: 'confirmed' };
  state.loading = false;
  state.records = [];
  state.blocked = false;
  state.inboxLoading = false;
  state.inboxError = '';
  state.inboxEnabled = true;
  state.inboxRefresh.mockClear();
  state.data = { appointment: { date:'2026-09-17', status:'in_progress' }, consent:{status:'consumed'},
    operations:[state.operation], prescription:{ rxId:'12', operation:state.operation } };
});
afterEach(async () => { await act(async () => root.unmount()); box.remove(); });
async function render(role: 'doctor' | 'patient' = 'doctor') { await act(async () => root.render(createElement(ConsultationDetail, { id:7, role, onBack:vi.fn() }))); }
it('shows a prescription operation once in its card', async () => {
  await render(); expect(box.querySelectorAll('[data-operation="mint"]')).toHaveLength(1);
});
it('keeps an operation visible before the prescription arrives', async () => {
  state.data.prescription = null; await render();
  expect(box.querySelectorAll('[data-operation="mint"]')).toHaveLength(1);
});
it('preserves distinct consent notices and deduplicates the fallback list', async () => {
  state.operation = null;
  state.data.operations.push({ id:'consent', action:'consent', state:'confirmed' });
  await render();
  expect(box.querySelectorAll('[data-operation="mint"]')).toHaveLength(1);
  expect(box.querySelectorAll('[data-operation="consent"]')).toHaveLength(1);
});
it('shows a structured skeleton while the consultation loads', async () => {
  state.loading = true; state.data = null;
  await render();
  const status = box.querySelector('[role="status"]');
  expect(status).not.toBeNull();
  expect(status?.querySelectorAll('.animate-pulse').length).toBeGreaterThanOrEqual(2);
});
it('links only the authorized doctor’s exact verified appointment to a shared chart', async () => {
  const historyId = 'a'.repeat(64);
  state.data.appointment = { ...state.data.appointment, started_at: '2026-09-17T13:00:00Z', attended_at: '2026-09-17T12:40:00Z' };
  state.records = [{ historyId, activeAppointmentIds: [9] }];
  await render();
  expect(box.querySelector('a[href*="record="]')).toBeNull();
  state.records = [{ historyId, activeAppointmentIds: [7] }];
  await render();
  expect(box.querySelector('a[href*="record="]')?.getAttribute('href')).toBe('/doctor?tab=historial&record=' + historyId + '&lang=es');
  state.blocked = true;
  await render();
  expect(box.querySelector('a[href*="record="]')).toBeNull();
  state.blocked = false;
  await render('patient');
  expect(box.querySelector('a[href*="record="]')).toBeNull();
});
it('distinguishes a still-unverified inbox, a failed lookup, and an empty result', async () => {
  const historyId = 'a'.repeat(64);
  state.data.appointment = { ...state.data.appointment, started_at: '2026-09-17T13:00:00Z', attended_at: '2026-09-17T12:40:00Z' };
  state.inboxLoading = true;
  await render();
  expect(box.textContent).toContain('Comprobando acceso a la ficha…');
  expect(box.querySelector('a[href*="record="]')).toBeNull();

  state.inboxLoading = false;
  state.inboxError = 'clinical_inbox_unavailable';
  state.records = [{ historyId, activeAppointmentIds: [7] }];
  await render();
  expect(box.querySelector('[role="alert"]')?.textContent).toContain('No pudimos comprobar el acceso a la ficha.');
  expect(box.querySelector('a[href*="record="]')).toBeNull();
  await act(async () => [...box.querySelectorAll('button')].find(button => button.textContent === 'Volver a comprobar')!.click());
  expect(state.inboxRefresh).toHaveBeenCalledOnce();

  state.inboxError = '';
  state.records = [{ historyId, activeAppointmentIds: [8] }];
  await render();
  expect(box.textContent).toContain('Pídele al paciente que comparta su ficha para esta consulta.');
  expect(box.querySelector('a[href*="record="]')).toBeNull();
});
it('keeps a pending operation above and protects the shared record link', async () => {
  state.data.appointment = { ...state.data.appointment, patient_name: 'Paciente de prueba', started_at: '2026-09-17T13:05:00Z',
    attended_at: '2026-09-17T12:40:00Z' };
  state.records = [{ historyId: 'a'.repeat(64), activeAppointmentIds: [7] }];
  state.operation = { id: 'mint', action: 'mint', state: 'submitted' };
  await render();
  expect(box.querySelector('h1')?.textContent).toBe('Paciente de prueba');
  expect(box.textContent).toContain('Consulta en curso');
  expect(box.textContent).toContain('10:05');
  expect(box.textContent).toContain('Consulta la operación pendiente antes de abrir la ficha.');
  expect(box.querySelector('a[href*="record="]')).toBeNull();

  state.operation = null;
  await render();
  const link = box.querySelector('a[href*="record="]');
  const details = box.querySelector('details');
  expect(link?.textContent).toBe('Abrir ficha compartida');
  expect(details?.open).toBe(false);
  expect(link!.compareDocumentPosition(details!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});
it('shows the server-supplied opening in Chile time before attendance is allowed', async () => {
  state.operation = null;
  state.data = { appointment: { date: '2026-11-15', status: 'scheduled' }, appointmentMode: 'regular',
    appointmentActions: { attend: false, start: false, cancel: true, complete: false },
    checkIn: { opensAt: '2026-11-15T03:00:00.000Z', state: 'upcoming' }, booking: null, consent: { status: 'absent' }, operations: [] };
  await render('patient');
  expect(box.textContent).toMatch(/Confirma tu asistencia desde el .*00:00.*\(hora de Chile\)/);
  expect([...box.querySelectorAll('button')].find(button => button.textContent === 'Confirmar mi asistencia')?.disabled).toBe(true);
});
