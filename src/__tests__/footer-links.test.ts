// @vitest-environment jsdom
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { translations } from '@/lib/i18n';
import { Footer } from '@/components/landing/Footer';
import type { Language } from '@/types';

let language: Language = 'en';
vi.mock('@/hooks/useLanguage', () => ({
  useLanguage: () => ({ lang: language, t: translations[language] }),
}));

describe('published footer navigation', () => {
  it.each(['en', 'es', 'pt'] as const)('%s exposes only working destinations and one localized doctor entry', lang => {
    language = lang;
    const element = document.createElement('div');
    element.innerHTML = renderToStaticMarkup(createElement(Footer));
    const links = [...element.querySelectorAll('a')];
    expect(links.map(link => link.getAttribute('href'))).toEqual([
      '#problem', '#solution', '#how', '#waitlist', '#waitlist', `/login/doctor?lang=${lang}`,
    ]);
    expect(links.every(link => Boolean(link.textContent?.trim()))).toBe(true);
    expect(element.querySelectorAll('h4')).toHaveLength(2);
    expect(element.querySelector('a[href="#"], a[href*="admin"], a[href="/verify"]')).toBeNull();
  });
});
