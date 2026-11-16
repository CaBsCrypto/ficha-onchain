// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DoctorClinicalBell, DoctorClinicalInboxProvider, useDoctorClinicalInbox } from '@/components/private-portal/DoctorClinicalInbox';
import { LanguageProvider } from '@/hooks/useLanguage';
import type { DoctorClinicalInbox } from '@/types/clinical';

const transport = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('@/lib/auth/authed-fetch', () => ({ authedFetch: transport.fetch }));

const historyId = 'a'.repeat(64);
const inboxPath = '/api/doctor/clinical-inbox';
const grant = { historyId, patientLabel: 'Paciente de Prueba', canRead: true, canAppend: false };
const sample: DoctorClinicalInbox = {
  records: [{ ...grant, activeAppointmentIds: [13, 24] }],
  notifications: [
    { ...grant, id: '1'.repeat(64), kind: 'access_granted', at: '2026-11-15T18:10:00.000Z' },
    { ...grant, id: '2'.repeat(64), kind: 'access_changed', at: '2026-11-15T18:00:00.000Z' },
    { id: '3'.repeat(64), kind: 'access_withdrawn', at: '2026-11-15T17:30:00.000Z', historyId: null, patientLabel: null, canRead: false, canAppend: false },
  ],
};

function deferredResponse() {
  let resolve!: (value: Response) => void;
  const promise = new Promise<Response>(done => { resolve = done; });
  return { promise, resolve };
}

let views: { root: Root; host: HTMLDivElement }[] = [];
let current: ReturnType<typeof useDoctorClinicalInbox>;
let visibility: DocumentVisibilityState;

function InboxProbe() {
  current = useDoctorClinicalInbox();
  return createElement('p', { 'data-records': true }, current.data?.records.map(record => record.patientLabel).join(', ') ?? '');
}

function view(identity: string | null, english = false) {
  const content = createElement(DoctorClinicalInboxProvider, {
    identity,
    children: createElement('div', null, createElement(DoctorClinicalBell), createElement(InboxProbe)),
  });
  return english ? createElement(LanguageProvider, { children: content }) : content;
}

async function mount(identity: string | null = 'verified-doctor-a', english = false) {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  views.push({ root, host });
  await act(async () => root.render(view(identity, english)));
  return { root, host };
}

const bell = (host: HTMLElement) => host.querySelector<HTMLButtonElement>('button[aria-expanded]');
const panel = (host: HTMLElement) => host.querySelector<HTMLElement>('section[aria-labelledby]')!;
const open = async (host: HTMLElement) => act(async () => bell(host)!.click());
const tick = async (ms: number) => act(async () => vi.advanceTimersByTimeAsync(ms));
const focus = async () => act(async () => window.dispatchEvent(new Event('focus')));

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  visibility = 'visible';
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
  sessionStorage.clear();
  localStorage.removeItem('ficha-lang');
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  for (const { root, host } of views) {
    await act(async () => root.unmount());
    host.remove();
  }
  views = [];
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('authenticated doctor notification tray', () => {
  it('shares visible polling, skips hidden intervals and coalesces focus and visibility while a read is in flight', async () => {
    const first = deferredResponse();
    transport.fetch.mockReturnValueOnce(first.promise).mockImplementation(async () => Response.json(sample));
    const { host } = await mount();
    expect(transport.fetch).toHaveBeenCalledOnce();
    expect(transport.fetch.mock.calls[0][0]).toBe(inboxPath);
    expect(transport.fetch.mock.calls[0][1].cache).toBe('no-store');
    await focus();
    await act(async () => document.dispatchEvent(new Event('visibilitychange')));
    await tick(5000);
    expect(transport.fetch).toHaveBeenCalledOnce();

    await act(async () => first.resolve(Response.json(sample)));
    expect(host.querySelector('[data-records]')?.textContent).toBe(grant.patientLabel);
    expect(current.data?.records[0].activeAppointmentIds).toEqual([13, 24]);
    expect(bell(host)?.getAttribute('aria-label')).toContain('3 sin leer');
    await tick(5000);
    expect(transport.fetch).toHaveBeenCalledTimes(2);

    visibility = 'hidden';
    await act(async () => document.dispatchEvent(new Event('visibilitychange')));
    await focus();
    await tick(15000);
    expect(transport.fetch).toHaveBeenCalledTimes(2);
    visibility = 'visible';
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('focus'));
    });
    expect(transport.fetch).toHaveBeenCalledTimes(3);
  });

  it('shows only active record links, prevents switching during a pending operation and restores focus on Escape', async () => {
    transport.fetch.mockImplementation(async () => Response.json(sample));
    localStorage.setItem('ficha-lang', 'en');
    const { host } = await mount('verified-doctor-a', true);
    expect(panel(host).hidden).toBe(true);
    await open(host);
    expect(bell(host)?.getAttribute('aria-expanded')).toBe('true');
    expect(panel(host).textContent).toContain('Access granted');
    expect(panel(host).textContent).toContain('Permissions changed');
    expect(panel(host).textContent).toContain('Chile time');
    const firstTime = panel(host).querySelector('time')!;
    expect(firstTime.dateTime).toBe('2026-11-15T18:10:00.000Z');
    expect(firstTime.textContent).toContain('15:10');
    expect(firstTime.textContent).not.toMatch(/[AP]M/i);
    const withdrawn = [...panel(host).querySelectorAll('li')].find(item => item.textContent?.includes('Access withdrawn'))!;
    expect(withdrawn.querySelector('a')).toBeNull();
    expect(withdrawn.textContent).not.toContain(grant.patientLabel);
    const links = [...panel(host).querySelectorAll('a')];
    expect(links.map(link => link.getAttribute('href'))).toEqual(Array(2).fill('/doctor?tab=historial&record=' + historyId + '&lang=en'));
    expect(current.canNavigateToRecord(historyId)).toBe(true);
    expect(current.canNavigateToRecord(historyId, 24)).toBe(true);
    expect(current.canNavigateToRecord(historyId, 25)).toBe(false);
    expect(current.canNavigateToRecord(undefined, 24)).toBe(false);
    expect(current.canNavigateToRecord()).toBe(true);
    expect(current.canNavigateToRecord('b'.repeat(64))).toBe(false);

    await act(async () => links[0].focus());
    await act(async () => current.setRecordNavigationBlocked(true));
    expect(panel(host).querySelector('a')).toBeNull();
    expect(document.activeElement).toBe(bell(host));
    expect(panel(host).textContent).toContain('Check or finish the pending operation before switching records.');
    expect(current.canNavigateToRecord(historyId)).toBe(false);
    expect(current.canNavigateToRecord()).toBe(false);
    await act(async () => current.setRecordNavigationBlocked(false));
    const link = panel(host).querySelector('a')!;
    link.focus();
    await act(async () => link.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(panel(host).hidden).toBe(true);
    expect(document.activeElement).toBe(bell(host));
  });

  it('retains record-only navigation when a newly verified inbox drops the exact appointment', async () => {
    transport.fetch.mockResolvedValueOnce(Response.json(sample)).mockResolvedValueOnce(Response.json({
      ...sample, records: [{ ...sample.records[0], activeAppointmentIds: [13] }],
    }));
    await mount();
    expect(current.canNavigateToRecord(historyId, 24)).toBe(true);
    const canNavigate = current.canNavigateToRecord;
    await focus();
    expect(canNavigate(historyId, 24)).toBe(false);
    expect(canNavigate(historyId, 13)).toBe(true);
    expect(canNavigate(historyId)).toBe(true);
  });

  it('drops previous labels, rights and links when verification fails or returns malformed data', async () => {
    transport.fetch.mockResolvedValueOnce(Response.json(sample))
      .mockResolvedValueOnce(Response.json({ error: 'unavailable' }, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ ...sample, records: [{ ...sample.records[0], activeAppointmentIds: [13, 13] }] }))
      .mockResolvedValueOnce(Response.json(sample));
    const { host } = await mount();
    await open(host);
    expect(panel(host).textContent).toContain(grant.patientLabel);
    await focus();
    expect(panel(host).textContent).toContain('No pudimos comprobar');
    expect(panel(host).textContent).not.toContain(grant.patientLabel);
    expect(panel(host).querySelector('a')).toBeNull();
    expect(current.data).toBeNull();
    expect(current.canNavigateToRecord(historyId)).toBe(false);

    const retry = [...panel(host).querySelectorAll('button')].find(button => button.textContent === 'Volver a consultar')!;
    await act(async () => retry.click());
    expect(current.data).toBeNull();
    await tick(5000);
    expect(panel(host).textContent).toContain(grant.patientLabel);
    expect(panel(host).querySelector('[role="alert"]')).toBeNull();
  });

  it('masks a selected inbox immediately on suspension and keeps pending recovery locked while revalidating', async () => {
    const old = deferredResponse();
    const resumed = deferredResponse();
    transport.fetch.mockResolvedValueOnce(Response.json(sample)).mockReturnValueOnce(old.promise).mockReturnValueOnce(resumed.promise);
    const { host } = await mount();
    await open(host);
    expect(panel(host).querySelector('a')).not.toBeNull();
    await act(async () => current.setRecordNavigationBlocked(true));
    await focus();
    const oldSignal = transport.fetch.mock.calls[1][1].signal as AbortSignal;
    visibility = 'hidden';
    await act(async () => document.dispatchEvent(new Event('visibilitychange')));
    expect(oldSignal.aborted).toBe(true);
    expect(current.data).toBeNull();
    expect(host.textContent).not.toContain(grant.patientLabel);

    visibility = 'visible';
    await act(async () => document.dispatchEvent(new Event('visibilitychange')));
    expect(transport.fetch).toHaveBeenCalledTimes(3);
    expect(current.recordNavigationBlocked).toBe(true);
    expect(current.canNavigateToRecord()).toBe(false);
    expect(panel(host).querySelector('a')).toBeNull();
    await act(async () => old.resolve(Response.json(sample)));
    expect(current.data).toBeNull();

    await act(async () => resumed.resolve(Response.json({ records: [], notifications: [sample.notifications[2]] })));
    expect(panel(host).textContent).toContain('Acceso retirado');
    expect(panel(host).querySelector('a')).toBeNull();
    expect(current.recordNavigationBlocked).toBe(true);
  });

  it('uses compatible per-request abort with a deadline and recovers after a timed-out read', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => { throw Error('unavailable'); });
    const any = vi.spyOn(AbortSignal, 'any').mockImplementation(() => { throw Error('unavailable'); });
    const stalled = deferredResponse();
    transport.fetch.mockReturnValueOnce(stalled.promise).mockImplementation(async () => Response.json(sample));
    const { host } = await mount();
    await open(host);
    const signal = transport.fetch.mock.calls[0][1].signal as AbortSignal;
    await tick(20_000);
    expect(signal.aborted).toBe(true);
    expect(panel(host).textContent).toContain('No pudimos comprobar');
    await tick(1000);
    expect(current.data?.records[0].historyId).toBe(historyId);
    expect(timeout).not.toHaveBeenCalled();
    expect(any).not.toHaveBeenCalled();
  });

  it('keeps read marks per identity and aborts an old session read before showing the next inbox', async () => {
    const old = deferredResponse(), next = deferredResponse();
    transport.fetch.mockResolvedValueOnce(Response.json(sample)).mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise)
      .mockImplementation(async () => Response.json(sample));
    const { root, host } = await mount();
    await open(host);
    const mark = [...panel(host).querySelectorAll('button')].find(button => button.textContent === 'Marcar como leídas')!;
    await act(async () => mark.click());
    expect(bell(host)?.getAttribute('aria-label')).not.toContain('sin leer');
    expect(transport.fetch).toHaveBeenCalledOnce();
    await focus();
    const oldSignal = transport.fetch.mock.calls[1][1].signal as AbortSignal;
    await act(async () => root.render(view('verified-doctor-b')));
    expect(oldSignal.aborted).toBe(true);
    expect(host.textContent).not.toContain(grant.patientLabel);
    await act(async () => old.resolve(Response.json(sample)));
    expect(host.textContent).not.toContain(grant.patientLabel);

    await act(async () => next.resolve(Response.json(sample)));
    expect(bell(host)?.getAttribute('aria-label')).toContain('3 sin leer');
    await act(async () => root.render(view('verified-doctor-a')));
    expect(bell(host)?.getAttribute('aria-label')).not.toContain('sin leer');
    await act(async () => root.render(view(null)));
    expect(bell(host)).toBeNull();
    expect(current.data).toBeNull();
  });
});
