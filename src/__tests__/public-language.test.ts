// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LanguageProvider, useLanguage } from '@/hooks/useLanguage';

let root: Root;
let container: HTMLDivElement;
function Probe() {
  const { lang, setLang, t } = useLanguage();
  return createElement('button', { onClick: () => setLang('pt'), 'data-lang': lang }, t.hero.secondary);
}
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  window.localStorage.clear(); window.history.replaceState(null, '', '/');
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
async function render() { await act(async () => root.render(createElement(LanguageProvider, null, createElement(Probe)))); }
describe('public language persistence', () => {
  it('restores Brazilian Portuguese from storage', async () => {
    window.localStorage.setItem('ficha-lang', 'pt'); await render();
    expect(container.textContent).toBe('Veja como funciona');
    expect(document.documentElement.lang).toBe('pt-BR');
  });
  it('honors a language link and retains a later explicit choice on reload', async () => {
    window.localStorage.setItem('ficha-lang', 'es');
    window.history.replaceState(null, '', '/login/doctor?lang=en'); await render();
    expect(container.textContent).toBe('See how it works');
    await act(async () => container.querySelector('button')!.click());
    expect(window.localStorage.getItem('ficha-lang')).toBe('pt');
    expect(window.location.search).toBe('?lang=pt');
    expect(window.location.pathname).toBe('/login/doctor');
  });
});
