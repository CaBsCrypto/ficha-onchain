// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WaitlistPage from '@/app/admin/waitlist/page';
const request = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth/authed-fetch', () => ({ authedFetch: request }));
let root: Root;
let container: HTMLDivElement;
const rows = [{ email: 'one@example.test', role: 'doctor', created_at: '2026-09-21T12:00:00Z' }, { email: 'two@example.test', role: null, created_at: '2026-09-20T12:00:00Z' }];
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  request.mockReset();
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
async function render() { await act(async () => root.render(createElement(WaitlistPage))); }
async function click(label: string) { await act(async () => Array.from(container.querySelectorAll('button')).find(button => button.textContent === label)!.click()); }
describe('private administrative waitlist', () => {
  it('loads once without cache and searches locally without another request', async () => {
    request.mockResolvedValue(Response.json({ signups: rows })); await render();
    expect(container.textContent).toContain('Médico'); expect(container.textContent).toContain('Rol no indicado');
    const input = container.querySelector('input')!;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'ONE@'); input.dispatchEvent(new Event('input', { bubbles: true })); });
    expect(container.textContent).toContain('one@example.test'); expect(container.textContent).not.toContain('two@example.test');
    expect(request).toHaveBeenCalledOnce(); expect(request.mock.calls[0][1].cache).toBe('no-store');
  });
  it.each([401, 403])('clears previous private rows after authorization failure %s', async status => {
    request.mockResolvedValueOnce(Response.json({ signups: rows })); await render();
    request.mockResolvedValueOnce(Response.json({ error: 'denied' }, { status })); await click('Actualizar');
    expect(container.textContent).not.toContain('one@example.test'); expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(container.textContent).not.toContain('No hay inscripciones');
  });
  it('does not expose provider errors and allows retry to a genuinely empty list', async () => {
    request.mockRejectedValueOnce(new Error('provider-internal-sensitive-detail')); await render();
    expect(container.textContent).not.toContain('provider-internal');
    request.mockResolvedValueOnce(Response.json({ signups: [] })); await click('Reintentar');
    expect(container.textContent).toContain('No hay inscripciones todavía'); expect(container.querySelector('[role="alert"]')).toBeNull();
  });
  it('aborts on unmount and ignores a late result when a new session mounts', async () => {
    let resolve!: (value: Response) => void;
    request.mockReturnValueOnce(new Promise<Response>(done => { resolve = done; })); await render();
    const signal = request.mock.calls[0][1].signal as AbortSignal;
    expect(container.querySelector('button')!.disabled).toBe(true);
    await click('Actualizar'); expect(request).toHaveBeenCalledOnce();
    await act(async () => root.render(null)); expect(signal.aborted).toBe(true);
    request.mockResolvedValueOnce(Response.json({ signups: [] })); await render();
    await act(async () => resolve(Response.json({ signups: rows })));
    expect(container.textContent).not.toContain('one@example.test'); expect(container.textContent).toContain('No hay inscripciones');
  });
  it('rejects malformed responses instead of displaying unverified rows', async () => {
    request.mockResolvedValue(Response.json({ signups: [{ ...rows[0], created_at: 'invalid' }] })); await render();
    expect(container.querySelector('[role="alert"]')).not.toBeNull(); expect(container.textContent).not.toContain('one@example.test');
  });
});
