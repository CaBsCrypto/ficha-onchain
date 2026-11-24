// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PatientAccountEntry } from '@/components/private-portal/PatientAccountEntry';
import { PortalApiError } from '@/components/private-portal/client';

const mock = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('@privy-io/react-auth', () => ({ usePrivy: () => ({ user: null }) }));
vi.mock('next/link', () => ({ default: (props: { href: string }) => createElement('a', props) }));
vi.mock('@/components/private-portal/ClinicalLinksPanel', () => ({
  ClinicalLinksPanel: () => createElement('p', null, 'Receta de Cannabis'),
}));
vi.mock('@/components/private-portal/client', async importOriginal => ({
  ...await importOriginal<typeof import('@/components/private-portal/client')>(), portalApi: mock.request,
}));

let host: HTMLElement;
let root: Root;
beforeEach(() => {
  vi.resetAllMocks();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });

const active = { accountStatus: 'active', recordStatus: 'not_created', sources: [] };
const native = createElement('p', null, 'Vista Stellar que necesita wallet');

it('opens an enrolled account and offers native record activation without a wallet', async () => {
  mock.request.mockResolvedValue(active);
  await act(async () => root.render(createElement(PatientAccountEntry, { tab: 'perfil', native })));
  expect(host.textContent).toContain('Mi cuenta');
  expect(host.querySelector('a[href="/patient?tab=historial"]')?.textContent).toBe('Abrir mi ficha');
  expect(host.textContent).not.toContain('necesita wallet');
});

it('shows the connected prescription before native record creation', async () => {
  mock.request.mockResolvedValue(active);
  await act(async () => root.render(createElement(PatientAccountEntry, { tab: 'recetas', native })));
  expect(host.textContent).toContain('Receta de Cannabis');
  expect(host.textContent).not.toContain('necesita wallet');
});

it('uses native account routes if the integration is disabled', async () => {
  mock.request.mockRejectedValue(new PortalApiError('module_outside_current_delivery', 410));
  await act(async () => root.render(createElement(PatientAccountEntry, { tab: 'perfil', native })));
  expect(host.textContent).toContain('Vista Stellar que necesita wallet');
});
