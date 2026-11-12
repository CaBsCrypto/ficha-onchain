// @vitest-environment jsdom
import React, { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ fetch: vi.fn(), identity: 'did:privy:admin' }));
vi.mock('@privy-io/react-auth', () => ({ usePrivy: () => ({ ready: true, authenticated: !!m.identity, user: m.identity ? { id: m.identity } : null }) }));
vi.mock('@/lib/auth/authed-fetch', () => ({ authedFetch: m.fetch }));
import { ClinicalSponsorshipStatus } from '@/components/admin/ClinicalSponsorshipStatus';
const status = () => ({ network: 'testnet', coverage: 'new_reservations_only', requestedEnabled: false, configurationValid: false, spendingEnabled: false,
  quoteMaxAgeSeconds: 90, utcDay: '2026-10-25', resetAt: '2026-10-26T00:00:00Z', verifiedAt: '2026-10-25T12:00:00Z', policy: null,
  sponsorBuckets: { scope: 'all_sponsors_today', count: 0, recordedLimitStroops: '0', reservedStroops: '0', spentStroops: '0' },
  reservations: { scope: 'all_testnet_days', counts: { reserved: 0, signed: 0, submitted: 0, settled: 0, released: 0 }, pendingCount: 0,
    oldestPendingAt: null, oldestPendingAgeSeconds: null } });
let root: Root | null = null, host: HTMLDivElement;
async function mount() { host = document.createElement('div'); document.body.append(host); root = createRoot(host); await act(async () => root!.render(createElement(ClinicalSponsorshipStatus))); return host; }
const click = async () => { await act(async () => host.querySelector('button')!.click()); };
beforeEach(() => { vi.clearAllMocks(); m.identity = 'did:privy:admin'; (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true; });
afterEach(async () => { if (root) await act(async () => root!.unmount()); root = null; host?.remove(); });
it('performs no automatic query, and the explicit button uses only an authenticated no-store GET', async () => {
  m.fetch.mockResolvedValue(Response.json(status())); await mount();
  expect(m.fetch).not.toHaveBeenCalled();
  expect(host.textContent).toContain('los cargos anteriores del ensayo se conservan en su informe');
  await click(); expect(m.fetch).toHaveBeenCalledOnce();
  expect(m.fetch).toHaveBeenCalledWith('/api/admin/sponsorship-status', expect.objectContaining({ method: 'GET', cache: 'no-store', signal: expect.any(AbortSignal) }));
  expect(host.textContent).toContain('Patrocinio deshabilitado');
  expect(host.textContent).toContain('contabilidad de presupuesto, no saldo de wallets');
});
it.each([401,403,503])('shows a fixed message for HTTP%s without provider content', async code => {
  m.fetch.mockResolvedValue(Response.json({ error: 'SECRET_PRIVATE_PROVIDER' }, { status: code }));
  await mount(); await click(); expect(host.querySelector('[role=alert]')).not.toBeNull();
  expect(host.textContent).not.toContain('SECRET'); expect(host.textContent).not.toContain('Consumido hoy');
});
it('does not display database errors or malformed response payloads', async () => {
  m.fetch.mockRejectedValue(Error('postgres://SECRET')); await mount(); await click(); expect(host.textContent).not.toContain('SECRET');
  m.fetch.mockResolvedValue(Response.json({ ...status(), sponsorBuckets: { ...status().sponsorBuckets, spentStroops: '-1' } }));
  await click(); expect(host.textContent).toContain('No pudimos consultar'); expect(host.textContent).not.toContain('Consumido hoy');
});
it('aborts a late result after a changed identity and clears previously displayed totals', async () => {
  let resolve!: (value: Response) => void;
  m.fetch.mockImplementation(() => new Promise<Response>(done => { resolve = done; })); await mount();
  await click(); const signal = m.fetch.mock.calls[0][1].signal as AbortSignal;
  m.identity = 'did:privy:other'; await act(async () => root!.render(createElement(ClinicalSponsorshipStatus)));
  expect(signal.aborted).toBe(true);
  await act(async () => resolve(Response.json({ ...status(), sponsorBuckets: { ...status().sponsorBuckets, spentStroops: '999999999999' } })));
  expect(host.textContent).not.toContain('Consumido hoy');
});
it('disables queries when the admin session is absent', async () => {
  m.identity = ''; await mount(); expect(host.querySelector('button')!.disabled).toBe(true); await click();
  expect(m.fetch).not.toHaveBeenCalled();
});
it('renders configured caps and large decimal amounts without loading wallet or clinical clients', async () => {
  const value = { ...status(), requestedEnabled: true, configurationValid: true, spendingEnabled: true,
    policy: { maxFeeStroops: '2000', entryLimitStroops: '3000', sponsorDailyLimitStroops: '10000', patientDailyLimitStroops: '5000', emergencyReserveStroops: '1000' },
    sponsorBuckets: { ...status().sponsorBuckets, spentStroops: '9007199254740993123' } };
  m.fetch.mockResolvedValue(Response.json(value)); await mount(); await click();
  expect(host.textContent).toContain('900719925474,0993123 XLM'); expect(host.textContent).toContain('Tope por entrada y correcciones');
});
