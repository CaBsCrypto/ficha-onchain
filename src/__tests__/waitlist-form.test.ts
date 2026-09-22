// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WaitlistForm } from '@/components/landing/WaitlistForm';
import { LanguageProvider } from '@/hooks/useLanguage';
const fetchMock = vi.fn();
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal('fetch', fetchMock); fetchMock.mockReset();
  window.localStorage.clear(); window.history.replaceState(null, '', '/');
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
async function render(compact = false) { await act(async () => root.render(createElement(LanguageProvider, null, createElement(WaitlistForm, { compact })))); }
async function fill(value: string) {
  const input = container.querySelector('input')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
function submit() { container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); }
describe('waitlist form states', () => {
  it('does not submit invalid input', async () => {
    await render(); await fill('invalid'); await act(async () => submit());
    expect(fetchMock).not.toHaveBeenCalled(); expect(container.querySelector('[role="alert"]')!.textContent).toContain('válido');
  });
  it.each([false, true])('retains an email after failure and allows retry, compact=%s', async compact => {
    await render(compact); await fill('test@example.test');
    fetchMock.mockRejectedValueOnce(new Error('network'));
    await act(async () => submit());
    expect(container.querySelector('input')!.value).toBe('test@example.test');
    expect(container.textContent).toContain('Reintentar');
    expect(container.querySelector('input')!.getAttribute('aria-invalid')).toBe('false');
    fetchMock.mockResolvedValueOnce(Response.json({ success: true }));
    await act(async () => submit());
    expect(container.querySelector('[role="status"]')!.textContent).toContain('No se ha creado una cuenta');
  });
  it('submits once for a double click and waits for successful persistence', async () => {
    let resolve!: (value: Response) => void;
    fetchMock.mockReturnValue(new Promise<Response>(done => { resolve = done; }));
    await render(); await fill('TEST@EXAMPLE.TEST');
    await act(async () => { submit(); submit(); });
    expect(fetchMock).toHaveBeenCalledOnce(); expect(container.querySelector('button')!.disabled).toBe(true);
    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(fetchMock.mock.calls[0][1].body).toBe('{"email":"test@example.test"}');
    await act(async () => resolve(Response.json({ success: true })));
    expect(container.querySelector('[role="status"]')).not.toBeNull();
  });
  it('does not report success for an unexpected successful HTTP response', async () => {
    await render(); await fill('test@example.test'); fetchMock.mockResolvedValue(Response.json({}));
    await act(async () => submit());
    expect(container.querySelector('[role="status"]')).toBeNull(); expect(container.textContent).toContain('Reintentar');
  });
  it.each(['en', 'es', 'pt'])('shows accessible quota errors in %s', async lang => {
    window.localStorage.setItem('ficha-lang', lang); await render(); await fill('test@example.test');
    fetchMock.mockResolvedValue(Response.json({ error: 'rate_limited' }, { status: 429 })); await act(async () => submit());
    expect(container.querySelector('[role="alert"]')!.textContent).toContain(lang === 'pt' ? 'Aguarde' : lang === 'es' ? 'Espera' : 'wait');
    expect(container.querySelector('label')!.htmlFor).toBe(container.querySelector('input')!.id);
  });
});
