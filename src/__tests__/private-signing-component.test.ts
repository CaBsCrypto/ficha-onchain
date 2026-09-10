// @vitest-environment jsdom
/**
 * Controlled client integration, not a live Privy/RPC/PostgreSQL or deployed E2E test.
 * Mounts the actual PrescriptionCard, confirmation dialog, signing hook, HTTP client
 * and receipt recovery with React DOM. Only the Privy/verified-wallet boundaries
 * and HTTP transport are controlled. Race outcomes are supplied by that transport;
 * these tests do not claim to prove database locks or on-chain ordering.
 */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrescriptionCard } from '@/components/private-portal/Prescriptions';
import type { PrivateOperation, PrivatePrescription } from '@/components/private-portal/types';

const provider = vi.hoisted(() => ({ signRawHash: vi.fn(), getAccessToken: vi.fn() }));
vi.mock('@privy-io/react-auth/extended-chains', () => ({ useSignRawHash: () => ({ signRawHash: provider.signRawHash }) }));
vi.mock('@privy-io/react-auth', () => ({ getAccessToken: provider.getAccessToken }));
vi.mock('@/components/private-portal/WalletBoundary', () => ({
  usePortalWallet: () => ({ userId: 'did:privy:synthetic-doctor', walletId: 'synthetic-stellar-wallet', address: `G${'A'.repeat(55)}` }),
}));

const address = `G${'A'.repeat(55)}`;
const operationId = 'synthetic-operation';
const recordId = 'synthetic-prescription';
const operationPath = `/api/private-operations/${operationId}`;
const hash = 'ab'.repeat(32);
const signature = `0x${'cd'.repeat(64)}`;
type Call = { url: string; method: string; body: Record<string, unknown> | null; headers: Headers; signal?: AbortSignal | null };
let calls: Call[];
let transport: (call: Call) => Response | Promise<Response>;
let container: HTMLDivElement;
let root: Root;
let changed: ReturnType<typeof vi.fn>;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function operation(state: PrivateOperation['state'] = 'awaiting_signature', action: PrivateOperation['action'] = 'activate'): PrivateOperation {
  return { id: operationId, action, state, address, signingHash: `0x${hash}`,
    expiresAt: Math.floor(Date.now() / 1000) + 300, transactionHash: ['submitted', 'confirmed'].includes(state) ? hash : null };
}
function prescription(extra: Partial<PrivatePrescription> = {}): PrivatePrescription {
  return { id: recordId, rxId: '9', appointmentId: 123, status: 'Registered', expired: false,
    doctorName: 'Synthetic doctor', patientName: 'Synthetic patient', expiresAt: Math.floor(Date.now() / 1000) + 3600,
    transactionHash: null, ...extra };
}
function reply(value: PrivateOperation) { return Response.json({ operation: value }); }
function requests(method: string, url: string) { return calls.filter(call => call.method === method && call.url === url); }
function button(label: string, within: ParentNode = container) {
  const found = [...within.querySelectorAll('button')].find(node => node.textContent === label);
  if (!found) throw new Error(`Missing button: ${label}`);
  return found;
}
function dialog() {
  const found = container.querySelector<HTMLDialogElement>('dialog[open]');
  if (!found) throw new Error('Expected the actual confirmation dialog to remain open');
  return found;
}
function notice() { return container.querySelector('[role="status"]')?.textContent ?? ''; }
async function render(value = prescription()) {
  await act(async () => { root.render(createElement(PrescriptionCard, { prescription: value, role: 'doctor', onChange: changed })); });
}
async function click(label: string, within: ParentNode = container) {
  await act(async () => { button(label, within).click(); });
}
async function confirm() { await click('Confirmar con mi cuenta', dialog()); }
async function tick(milliseconds = 3000) { await act(async () => { await vi.advanceTimersByTimeAsync(milliseconds); }); }
async function openMint() {
  await render(prescription({ rxId: null, status: 'Pending' }));
  await click('Revisar y continuar emisión');
  expect(button('Confirmar con mi cuenta', dialog()).disabled).toBe(true);
  await click('Abrir documento privado', dialog());
  expect(dialog().textContent).toContain('Synthetic medication');
  expect(button('Confirmar con mi cuenta', dialog()).disabled).toBe(false);
}
function documentResponse(call: Call) {
  if (call.url === `/api/private-prescriptions/${recordId}/document` && call.method === 'GET') {
    return Response.json({ document: { medication: 'Synthetic medication', dosage: 'Test only', instructions: 'Synthetic instructions' } });
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-10T12:00:00Z'));
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  provider.signRawHash.mockReset().mockResolvedValue({ signature });
  provider.getAccessToken.mockReset().mockResolvedValue('synthetic-test-token');
  calls = [];
  changed = vi.fn();
  transport = call => { throw new Error(`Unexpected controlled HTTP request: ${call.method} ${call.url}`); };
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const call: Call = { url: String(input), method: init.method ?? 'GET', body: init.body ? JSON.parse(String(init.body)) : null,
      headers: new Headers(init.headers), signal: init.signal };
    calls.push(call);
    return transport(call);
  }));
  // jsdom supplies the dialog DOM but not native modal presentation. Shim only
  // these browser primitives; confirmation state, clicks and locks remain real.
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value(this: HTMLDialogElement) { this.open = true; } });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value(this: HTMLDialogElement) { this.open = false; } });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('active private signing components with controlled Privy and HTTP', () => {
  it('a Privy rejection leaves an unsigned request and open dialog; only an explicit retry can confirm', async () => {
    const unsigned = operation();
    provider.signRawHash.mockRejectedValueOnce(new Error('user_rejected: private-provider-detail'));
    transport = call => {
      if (call.url === '/api/private-operations' && call.method === 'POST') return reply(unsigned);
      if (call.url === `${operationPath}/confirm` && call.method === 'POST') return reply(operation('confirmed'));
      throw new Error('Unexpected request after rejected signature');
    };
    await render(); await click('Activar receta'); await confirm();
    expect(dialog().textContent).toContain('No se completó tu firma');
    expect(container.textContent).not.toContain('private-provider-detail');
    expect(notice()).toContain('Pendiente de tu firma');
    expect(requests('POST', `${operationPath}/confirm`)).toHaveLength(0);
    expect(changed).not.toHaveBeenCalled();
    await tick(12000);
    expect(provider.signRawHash).toHaveBeenCalledTimes(1);
    expect(calls).toHaveLength(1);

    await confirm();
    expect(provider.signRawHash).toHaveBeenCalledTimes(2);
    expect(provider.signRawHash.mock.calls.every(([payload]) => payload.chainType === 'stellar' && payload.address === address && payload.hash === unsigned.signingHash)).toBe(true);
    expect(requests('POST', '/api/private-operations').map(call => call.body)).toEqual([
      { action: 'activate', prescriptionId: recordId, confirmed: true }, { action: 'activate', prescriptionId: recordId, confirmed: true },
    ]);
    expect(requests('POST', `${operationPath}/confirm`).map(call => call.body)).toEqual([{ signature }]);
    expect(calls.every(call => call.headers.get('Authorization') === 'Bearer synthetic-test-token')).toBe(true);
    expect(container.querySelector('dialog[open]')).toBeNull();
    expect(notice()).toContain('Operación confirmada');
    expect(changed).toHaveBeenCalledOnce();
  });

  it('losing the confirmation response and remounting recovers the same hash without another signature', async () => {
    const pending = operation('submitted');
    let receiptReady = false;
    transport = call => {
      if (call.url === '/api/private-operations' && call.method === 'POST') return reply(operation());
      if (call.url === `${operationPath}/confirm` && call.method === 'POST') throw new TypeError('connection lost after submission');
      if (call.url === operationPath && call.method === 'GET') return reply(receiptReady ? operation('confirmed') : pending);
      throw new Error('Unexpected request during receipt recovery');
    };
    await render(); await click('Activar receta'); await confirm();
    expect(notice()).toContain('esperando confirmación');
    expect(notice()).not.toContain('Operación confirmada');
    expect(button('Activar receta').disabled).toBe(true);
    expect(changed).not.toHaveBeenCalled();
    expect(provider.signRawHash).toHaveBeenCalledOnce();
    await tick();
    expect(requests('POST', `${operationPath}/confirm`)).toHaveLength(1);
    await act(async () => { root.unmount(); });
    root = createRoot(container);
    await render(prescription({ operation: pending }));
    receiptReady = true;
    await tick();
    expect(notice()).toContain('Operación confirmada');
    expect(container.querySelector<HTMLAnchorElement>('[role="status"] a')?.href).toBe(`https://stellar.expert/explorer/testnet/tx/${hash}`);
    expect(provider.signRawHash).toHaveBeenCalledOnce();
    expect(requests('POST', '/api/private-operations')).toHaveLength(1);
    expect(requests('POST', `${operationPath}/confirm`)).toHaveLength(1);
    expect(requests('GET', operationPath).length).toBeGreaterThanOrEqual(2);
    expect(calls.filter(call => call.method === 'GET').every(call => call.url === operationPath)).toBe(true);
  });

  it('two confirmation clicks in one render submit only one prepared owner signature', async () => {
    const signing = deferred<{ signature: string }>();
    provider.signRawHash.mockReturnValue(signing.promise);
    transport = call => {
      if (call.url === '/api/private-operations' && call.method === 'POST') return reply(operation());
      if (call.url === `${operationPath}/confirm` && call.method === 'POST') return reply(operation('confirmed'));
      throw new Error('Unexpected duplicate request');
    };
    await render(); await click('Activar receta');
    const confirmButton = button('Confirmar con mi cuenta', dialog());
    await act(async () => { confirmButton.click(); confirmButton.click(); });
    expect(requests('POST', '/api/private-operations')).toHaveLength(1);
    expect(provider.signRawHash).toHaveBeenCalledOnce();
    expect(button('Confirmando…', dialog()).disabled).toBe(true);
    expect(requests('POST', `${operationPath}/confirm`)).toHaveLength(0);
    await act(async () => { signing.resolve({ signature }); });
    expect(requests('POST', `${operationPath}/confirm`)).toHaveLength(1);
    expect(changed).toHaveBeenCalledOnce();
    expect(notice()).toContain('Operación confirmada');
  });

  it.each(['submitted', 'confirmed'] as const)('a server replay already %s never invokes Privy or posts another signature', async state => {
    const saved = operation(state);
    transport = call => {
      if (call.url === '/api/private-operations' && call.method === 'POST') return reply(saved);
      if (call.url === operationPath && call.method === 'GET') return reply(saved);
      throw new Error('Replay must not post a signature');
    };
    await render(); await click('Activar receta'); await confirm(); await tick();
    expect(provider.signRawHash).not.toHaveBeenCalled();
    expect(requests('POST', `${operationPath}/confirm`)).toHaveLength(0);
    expect(requests('POST', '/api/private-operations')).toHaveLength(1);
    expect(notice()).toContain(state === 'confirmed' ? 'Operación confirmada' : 'esperando confirmación');
  });

  it('closing the review dialog before confirmation neither prepares nor signs', async () => {
    await render(); await click('Activar receta'); await click('Volver', dialog());
    expect(container.querySelector('dialog[open]')).toBeNull();
    expect(calls).toHaveLength(0);
    expect(provider.signRawHash).not.toHaveBeenCalled();
    expect(changed).not.toHaveBeenCalled();
  });

  it('a cancellation reported while mint signing is pending cannot become a client-side issuance success', async () => {
    const signing = deferred<{ signature: string }>();
    provider.signRawHash.mockReturnValue(signing.promise);
    const cancelled = { ...operation('cancelled', 'mint'), errorCode: 'operation_context_changed' };
    transport = call => {
      const document = documentResponse(call); if (document) return document;
      if (call.url === '/api/private-operations' && call.method === 'POST') return reply(operation('awaiting_signature', 'mint'));
      if (call.url === `${operationPath}/confirm` && call.method === 'POST') return Response.json({ error: 'operation_context_changed' }, { status: 409 });
      if (call.url === operationPath && call.method === 'GET') return reply(cancelled);
      throw new Error('Unexpected request after cancellation won');
    };
    await openMint(); await confirm();
    expect(provider.signRawHash).toHaveBeenCalledOnce();
    expect(notice()).toContain('Pendiente de tu firma');
    await act(async () => { signing.resolve({ signature }); });
    expect(notice()).toContain('Operación cancelada');
    expect(notice()).not.toContain('Operación confirmada');
    expect(container.querySelector('[role="status"] a')).toBeNull();
    expect(changed).not.toHaveBeenCalled();
    expect(dialog().textContent).toContain('consultando esta misma operación');
    await tick(12000);
    expect(provider.signRawHash).toHaveBeenCalledOnce();
    expect(requests('POST', '/api/private-operations')).toHaveLength(1);
    expect(requests('POST', `${operationPath}/confirm`)).toHaveLength(1);
  });

  it('if the server confirms mint after a competing cancellation, the client displays that receipt and does not rewrite it as cancelled', async () => {
    const submitted = operation('submitted', 'mint');
    let mintConfirmed = false;
    transport = call => {
      const document = documentResponse(call); if (document) return document;
      if (call.url === '/api/private-operations' && call.method === 'POST') return reply(operation('awaiting_signature', 'mint'));
      if (call.url === `${operationPath}/confirm` && call.method === 'POST') return reply({ ...submitted, errorCode: 'booking_not_ready' });
      if (call.url === operationPath && call.method === 'GET') return reply(mintConfirmed ? operation('confirmed', 'mint') : { ...submitted, errorCode: 'booking_not_ready' });
      throw new Error('Unexpected request while mint receipt is pending');
    };
    await openMint(); await confirm();
    expect(notice()).toContain('esperando confirmación');
    expect(notice()).not.toContain('Operación confirmada');
    expect(button('Revisar y continuar emisión').disabled).toBe(true);
    mintConfirmed = true;
    await tick();
    expect(notice()).toContain('Emisión de receta · Operación confirmada');
    expect(notice()).not.toContain('Operación cancelada');
    expect(provider.signRawHash).toHaveBeenCalledOnce();
    expect(requests('POST', `${operationPath}/confirm`)).toHaveLength(1);
    expect(container.querySelector<HTMLAnchorElement>('[role="status"] a')?.href).toContain(hash);
  });

  it('a substituted operation in the confirmation response is never shown as success and recovery queries only the original ID', async () => {
    const receipt = deferred<Response>();
    transport = call => {
      if (call.url === '/api/private-operations' && call.method === 'POST') return reply(operation());
      if (call.url === `${operationPath}/confirm` && call.method === 'POST') return reply({ ...operation('confirmed'), id: 'foreign-operation' });
      if (call.url === operationPath && call.method === 'GET') return receipt.promise;
      throw new Error('A foreign operation must not be queried');
    };
    await render(); await click('Activar receta'); await confirm();
    expect(notice()).not.toContain('Operación confirmada');
    expect(container.textContent).not.toContain('foreign-operation');
    expect(button('Activar receta').disabled).toBe(true);
    expect(changed).not.toHaveBeenCalled();
    await act(async () => { receipt.resolve(reply({ ...operation('failed'), errorCode: 'transaction_failed' })); });
    expect(notice()).toContain('Operación fallida');
    expect(notice()).not.toContain('Operación confirmada');
    expect(provider.signRawHash).toHaveBeenCalledOnce();
    expect(calls.filter(call => call.method === 'GET').every(call => call.url === operationPath)).toBe(true);
  });
});
