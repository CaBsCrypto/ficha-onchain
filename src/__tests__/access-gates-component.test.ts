// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AdminLayout from '@/app/admin/layout';
import RoleLogin from '@/components/auth/RoleLogin';
const LoginPage = () => createElement(RoleLogin, { activeRole: mock.role as 'admin' | 'patient' | 'doctor' });
import { WalletBoundary } from '@/components/private-portal/WalletBoundary';

const mock = vi.hoisted(() => ({
  ready: true, authenticated: true, user: null as any,
  login: vi.fn(), logout: vi.fn(), refreshUser: vi.fn(), fetch: vi.fn(), replace: vi.fn(), role: 'admin',
}));
vi.mock('@privy-io/react-auth', () => ({ usePrivy: () => mock, useUser: () => ({ refreshUser: mock.refreshUser }) }));
vi.mock('@/lib/auth/authed-fetch', () => ({ authedFetch: mock.fetch }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: mock.replace }), usePathname: () => '/admin/doctors', useSearchParams: () => new URLSearchParams({ role: mock.role }) }));
vi.mock('next/link', () => ({ default: (props: any) => createElement('a', props) }));
vi.mock('@/hooks/useLanguage', () => ({ useLanguage: () => ({ lang: 'es', setLang: vi.fn() }) }));

let root: Root;
let container: HTMLDivElement;
const user = (id: string) => ({ id, email: { address: `${id}@example.test` }, linkedAccounts: [] });
function reply(status: number, body: unknown) { return Response.json(body, { status }); }
async function render(component: typeof AdminLayout | typeof WalletBoundary | typeof LoginPage) {
  await act(async () => { root.render(createElement(component, { children: createElement('p', null, 'Protected portal') })); });
}
async function click(label: string) {
  const button = [...container.querySelectorAll('button')].find(item => item.textContent?.trim().startsWith(label));
  expect(button, label).toBeDefined();
  await act(async () => { button!.click(); });
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
beforeEach(() => {
  vi.clearAllMocks(); mock.ready = true; mock.authenticated = true; mock.user = user('admin'); mock.role = 'admin';
  mock.logout.mockResolvedValue(undefined);
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(async () => { await act(async () => { root.unmount(); }); container.remove(); });

describe('Administrator access recovery', () => {
  it('distinguishes a service outage from denied permission, preserving identity and a safe reference', async () => {
    mock.fetch.mockResolvedValueOnce(reply(503, { error: 'database_unavailable', reference: 'abc-123' }))
      .mockResolvedValueOnce(reply(200, { admin: true, email: 'admin@example.test' }));
    await render(AdminLayout);
    expect(container.textContent).toContain('admin@example.test');
    expect(container.textContent).toContain('Referencia: abc-123');
    expect(container.textContent).not.toContain('Acceso denegado');
    await click('Volver a consultar');
    expect(container.textContent).toContain('Protected portal');
    expect(mock.logout).not.toHaveBeenCalled();
    expect(container.querySelector('a[href="/admin/users"]')).toBeNull();
  });
  it('offers reauthentication on 401 while preserving the admin destination', async () => {
    mock.fetch.mockResolvedValue(reply(401, { error: 'unauthorized' }));
    await render(AdminLayout); await click('Volver a ingresar con Privy');
    expect(mock.logout).toHaveBeenCalledOnce(); expect(mock.replace).toHaveBeenCalledWith('/login/admin');
    expect(container.textContent).not.toContain('Protected portal');
  });
  it('reserves access denied for 403', async () => {
    mock.fetch.mockResolvedValue(reply(403, { error: 'forbidden' }));
    await render(AdminLayout);
    expect(container.textContent).toContain('Acceso denegado');
    expect(container.textContent).not.toContain('Volver a consultar');
    expect(container.textContent).not.toContain('Protected portal');
  });
  it('offers retry for a network failure without logging out', async () => {
    mock.fetch.mockRejectedValue(new Error('network'));
    await render(AdminLayout);
    expect(container.textContent).toContain('ACCESS-NETWORK');
    expect(container.textContent).toContain('Volver a consultar');
    expect(mock.logout).not.toHaveBeenCalled();
  });
  it('ignores an old successful authorization after changing user', async () => {
    const old = deferred<Response>();
    mock.fetch.mockReturnValueOnce(old.promise).mockResolvedValueOnce(reply(403, { error: 'forbidden' }));
    await render(AdminLayout);
    mock.user = user('patient'); await render(AdminLayout);
    await act(async () => { old.resolve(reply(200, { admin: true, email: 'admin@example.test' })); });
    expect(container.textContent).toContain('patient@example.test');
    expect(container.textContent).toContain('Acceso denegado');
    expect(container.textContent).not.toContain('Protected portal');
  });
  it('does not expose the old panel after logout with an authorization response in flight', async () => {
    const old = deferred<Response>(); mock.fetch.mockReturnValue(old.promise);
    await render(AdminLayout); mock.authenticated = false; mock.user = null; await render(AdminLayout);
    await act(async () => { old.resolve(reply(200, { admin: true, email: 'admin@example.test' })); });
    expect(container.textContent).not.toContain('Protected portal');
    expect(container.querySelector('a[href="/login/admin"]')).not.toBeNull();
  });
});

describe('Automatic authenticated entry', () => {
  it.each(['patient', 'doctor', 'admin'])('opens the %s portal once after Privy resolves', async role => {
    mock.role = role; mock.ready = false;
    await render(LoginPage); expect(mock.replace).not.toHaveBeenCalled();
    mock.ready = true; mock.authenticated = false; mock.user = null;
    await render(LoginPage); expect(mock.replace).not.toHaveBeenCalled();
    mock.authenticated = true; await render(LoginPage);
    expect(mock.replace).not.toHaveBeenCalled();
    mock.user = user(role); await render(LoginPage); await render(LoginPage);
    expect(mock.replace).toHaveBeenCalledOnce();
    expect(mock.replace).toHaveBeenCalledWith(role === 'admin' ? '/admin/doctors' : `/${role}`);
  });
  it('signs out explicitly and retains the selected role for the next login', async () => {
    mock.role = 'doctor'; await render(LoginPage); await click('Cambiar de cuenta');
    expect(mock.logout).toHaveBeenCalledOnce(); expect(mock.replace).toHaveBeenCalledOnce();
    mock.authenticated = false; mock.user = null; await render(LoginPage); await click('Continuar con Privy');
    expect(mock.login).toHaveBeenCalledOnce();
    mock.authenticated = true; mock.user = user('doctor'); await render(LoginPage);
    expect(mock.replace).toHaveBeenLastCalledWith('/doctor');
    expect(mock.replace).toHaveBeenCalledTimes(2);
  });
  it('does not redirect again after a failed change of account', async () => {
    await render(LoginPage); mock.replace.mockClear();
    mock.logout.mockRejectedValueOnce(new Error('offline'));
    await click('Cambiar de cuenta'); await render(LoginPage);
    expect(mock.replace).not.toHaveBeenCalled();
    expect(container.textContent).toContain('No pudimos cerrar la sesión');
  });
});

describe('Wallet access recovery', () => {
  it('keeps a 503 recoverable with its reference and current identity', async () => {
    mock.fetch.mockResolvedValue(reply(503, { error: 'wallet_service_unavailable', reference: 'wallet-503' }));
    await render(WalletBoundary);
    expect(container.textContent).toContain('wallet-503');
    expect(container.textContent).toContain('admin@example.test');
    expect(container.textContent).toContain('Volver a consultar');
    expect(mock.refreshUser).not.toHaveBeenCalled();
  });
  it('does not show an old wallet response after a different session logs in', async () => {
    const old = deferred<Response>(); mock.fetch.mockReturnValueOnce(old.promise).mockResolvedValueOnce(reply(403, { error: 'forbidden' }));
    const address = `G${'A'.repeat(55)}`;
    mock.user.linkedAccounts = [{ type: 'wallet', chainType: 'stellar', address }];
    await render(WalletBoundary); mock.user = user('another'); await render(WalletBoundary);
    await act(async () => { old.resolve(reply(200, { address, walletId: 'old', chain: 'stellar' })); });
    expect(container.textContent).not.toContain('Protected portal');
    expect(container.textContent).toContain('another@example.test');
  });
});
