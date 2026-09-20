// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ConsultationDetail } from '@/components/private-portal/ConsultationDetail';
const state = vi.hoisted(() => ({ data: null as any, operation: null as any, loading: false }));
vi.mock('@/components/private-portal/client', () => ({
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
  state.data = { appointment: { date:'2026-09-17', status:'in_progress' }, consent:{status:'consumed'},
    operations:[state.operation], prescription:{ rxId:'12', operation:state.operation } };
});
afterEach(async () => { await act(async () => root.unmount()); box.remove(); });
async function render() { await act(async () => root.render(createElement(ConsultationDetail, { id:7, role:'doctor', onBack:vi.fn() }))); }
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
