// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PrivatePrescriptions } from '@/components/private-portal/Prescriptions';
import type { PrivatePrescription } from '@/components/private-portal/types';
const request = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth/authed-fetch', () => ({ authedFetch: request }));
vi.mock('@/components/private-portal/DocumentView', () => ({ DocumentView: () => null }));
vi.mock('@/components/private-portal/Operation', () => ({
  ConfirmationButton: ({ label, disabled }: { label: string; disabled: boolean }) => createElement('button', { disabled }, label), OperationNotice: () => null, ReceiptLink: () => null,
  usePrivateOperation: () => ({ run: vi.fn(), busy: false, operation: null, error: '' }),
}));
let root: Root, box: HTMLDivElement;
const rx = (id: string, status: PrivatePrescription['status'], expired = false): PrivatePrescription => ({
  id, rxId: id, appointmentId: Number(id), status, expired, doctorName: 'Médico sintético', patientName: 'Paciente sintético', expiresAt: 1900000000, transactionHash: null,
});
const rows = [rx('1', 'Revoked', true), rx('2', 'Active', true), rx('3', 'Registered'), rx('4', 'Active'), rx('5', 'Active'), rx('6', 'Blocked', true)];
beforeEach(() => { (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true; request.mockReset(); box = document.createElement('div'); document.body.append(box); root = createRoot(box); });
afterEach(async () => { await act(async () => root.unmount()); box.remove(); vi.useRealTimers(); });
const titles = () => [...box.querySelectorAll('article h3')].map(node => node.textContent);
async function render(role: 'doctor' | 'patient' = 'patient') { await act(async () => root.render(createElement(PrivatePrescriptions, { role }))); }
async function filter(value: string) { await act(async () => { const select = box.querySelector('select')!; select.value = value; select.dispatchEvent(new Event('change', { bubbles: true })); }); }
it('places only current active prescriptions first without reordering the source or the doctor list', async () => {
  request.mockImplementation(async () => Response.json({ prescriptions: rows })); await render();
  expect(titles()).toEqual(['Receta #4', 'Receta #5', 'Receta #1', 'Receta #2', 'Receta #3', 'Receta #6']);
  await render('doctor'); expect(titles()).toEqual(rows.map(row => `Receta #${row.id}`));
});
it('keeps revoked records in their filter even after expiry and excludes them from expired', async () => {
  request.mockImplementation(async () => Response.json({ prescriptions: rows })); await render();
  await filter('Active'); expect(titles()).toEqual(['Receta #4', 'Receta #5']);
  await filter('Revoked'); expect(titles()).toEqual(['Receta #1']);
  await filter('expired'); expect(titles()).toEqual(['Receta #2']);
  await filter('Registered'); expect(titles()).toEqual(['Receta #3']);
});
it('shows failure and retry instead of an empty successful result', async () => {
  request.mockResolvedValueOnce(Response.json({ error: 'unauthorized' }, { status: 401 })); await render();
  expect(box.querySelector('[role="alert"]')).not.toBeNull(); expect(box.textContent).not.toContain('No hay recetas');
  request.mockResolvedValueOnce(Response.json({ prescriptions: [] }));
  await act(async () => box.querySelector('button')!.click());
  expect(box.querySelector('[role="alert"]')).toBeNull(); expect(box.textContent).toContain('No hay recetas en este estado');
});
it('discards late results from the previous role while the next request fails', async () => {
  let finish!: (value: Response) => void;
  request.mockReturnValueOnce(new Promise<Response>(resolve => { finish = resolve; })); await render('doctor');
  const signal = request.mock.calls[0][1].signal as AbortSignal;
  request.mockResolvedValueOnce(Response.json({ error: 'forbidden' }, { status: 403 })); await render('patient');
  expect(signal.aborted).toBe(true);
  await act(async () => finish(Response.json({ prescriptions: rows })));
  expect(titles()).toEqual([]); expect(box.querySelector('[role="alert"]')).not.toBeNull();
});

it('labels retained data after a failed refresh and restores verification only after a successful retry', async () => {
  vi.useFakeTimers();
  request.mockResolvedValueOnce(Response.json({ prescriptions: [rx('4', 'Active')] }))
    .mockResolvedValueOnce(Response.json({ error: 'private_service_unavailable' }, { status: 503 }));
  await render('doctor');
  expect(box.textContent).toContain('Estados verificados en Stellar Testnet');
  await act(async () => vi.advanceTimersByTimeAsync(3000));
  expect(titles()).toEqual(['Receta #4']);
  expect(box.textContent).toContain('Datos de la última consulta correcta');
  expect(box.textContent).not.toContain('Estados verificados en Stellar Testnet');
  expect([...box.querySelectorAll('button')].find(button => button.textContent === 'Revocar receta')?.disabled).toBe(true);
  let finish!: (response: Response) => void;
  request.mockReturnValueOnce(new Promise<Response>(resolve => { finish = resolve; }));
  await act(async () => box.querySelector<HTMLButtonElement>('[role="alert"] button')!.click());
  expect(box.textContent).toContain('Datos de la última consulta correcta');
  await act(async () => finish(Response.json({ prescriptions: [rx('4', 'Revoked')] })));
  expect(box.querySelector('[role="alert"]')).toBeNull();
  expect(box.textContent).toContain('Estados verificados en Stellar Testnet');
  expect(box.textContent).not.toContain('Datos de la última consulta correcta');
  expect(box.querySelector('[data-prescription-status="Revoked"]')).not.toBeNull();
});
