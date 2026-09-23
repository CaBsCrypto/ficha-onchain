// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { PageTitle } from '@/components/PageTitle';

let root: Root, box: HTMLDivElement, original: string;
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  box = document.createElement('div'); document.body.append(box); root = createRoot(box);
  original = document.title;
});
afterEach(async () => {
  await act(async () => root.unmount()); box.remove(); document.title = original;
});

it('sets the browser tab title when mounted', async () => {
  await act(async () => root.render(createElement(PageTitle, { title: 'TrustLeaf — Portal del médico' })));
  expect(document.title).toBe('TrustLeaf — Portal del médico');
});

it('updates the title when the value changes', async () => {
  await act(async () => root.render(createElement(PageTitle, { title: 'a' })));
  await act(async () => root.render(createElement(PageTitle, { title: 'b' })));
  expect(document.title).toBe('b');
});
