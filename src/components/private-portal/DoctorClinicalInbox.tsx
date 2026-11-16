'use client';

import Link from 'next/link';
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { usePortalLanguage } from '@/hooks/useLanguage';
import type { DoctorClinicalInbox, DoctorClinicalNotification } from '@/types/clinical';
import { chileDateTime, portalApi } from './client';
import styles from './patient-mobile.module.css';

const inboxPath = '/api/doctor/clinical-inbox';
const pollInterval = 5000;
const opaqueId = /^(?!0{64}$)[a-f0-9]{64}$/;
const notificationKinds = new Set(['access_granted', 'access_changed', 'access_withdrawn']);
const safeLabel = (value: unknown) => value === null ||
  typeof value === 'string' && /^[\p{L}\p{M} .'’\-]{1,80}$/u.test(value);
const safeDate = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString() === value;

function verifiedInbox(value: DoctorClinicalInbox): DoctorClinicalInbox {
  if (!value || !Array.isArray(value.records) || !Array.isArray(value.notifications)) throw Error('clinical_inbox_unavailable');
  const records = value.records.map(record => {
    if (!record || typeof record.historyId !== 'string' || !opaqueId.test(record.historyId) || !safeLabel(record.patientLabel) ||
        typeof record.canRead !== 'boolean' || typeof record.canAppend !== 'boolean' || !record.canRead && !record.canAppend ||
        !Array.isArray(record.activeAppointmentIds) || record.activeAppointmentIds.some(id => !Number.isSafeInteger(id) || id < 1 || id > 2_147_483_647) ||
        new Set(record.activeAppointmentIds).size !== record.activeAppointmentIds.length) {
      throw Error('clinical_inbox_unavailable');
    }
    const { historyId, patientLabel, canRead, canAppend, activeAppointmentIds } = record;
    return { historyId, patientLabel, canRead, canAppend, activeAppointmentIds: [...activeAppointmentIds] };
  });
  const activeIds = new Set(records.map(record => record.historyId));
  const notifications = value.notifications.map(notice => {
    if (!notice || typeof notice.id !== 'string' || !opaqueId.test(notice.id) || !notificationKinds.has(notice.kind) ||
        !safeDate(notice.at) || !safeLabel(notice.patientLabel) ||
        typeof notice.canRead !== 'boolean' || typeof notice.canAppend !== 'boolean' ||
        (notice.historyId === null
          ? notice.patientLabel !== null || notice.canRead || notice.canAppend
          : typeof notice.historyId !== 'string' || !activeIds.has(notice.historyId) || notice.kind === 'access_withdrawn')) {
      throw Error('clinical_inbox_unavailable');
    }
    const { id, kind, at, historyId, patientLabel, canRead, canAppend } = notice;
    return { id, kind, at, historyId, patientLabel, canRead, canAppend };
  });
  if (activeIds.size !== records.length || new Set(notifications.map(notice => notice.id)).size !== notifications.length) {
    throw Error('clinical_inbox_unavailable');
  }
  return { records, notifications };
}

interface InboxState {
  data: DoctorClinicalInbox | null;
  loading: boolean;
  error: string;
}
interface InboxContextValue extends InboxState {
  enabled: boolean;
  refresh: () => void;
  unreadCount: number;
  readIds: ReadonlySet<string>;
  markNotificationsRead: () => void;
  recordNavigationBlocked: boolean;
  setRecordNavigationBlocked: (blocked: boolean) => void;
  canNavigateToRecord: (historyId?: string, appointmentId?: number) => boolean;
}

const InboxContext = createContext<InboxContextValue>({
  enabled: false, data: null, loading: false, error: '', unreadCount: 0, readIds: new Set(),
  refresh: () => {}, markNotificationsRead: () => {}, recordNavigationBlocked: false,
  setRecordNavigationBlocked: () => {}, canNavigateToRecord: () => false,
});

export function useDoctorClinicalInbox() {
  return useContext(InboxContext);
}

const maxReadIds = 128;
function readNotificationIds(storageKey: string) {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(storageKey) ?? '[]');
    if (Array.isArray(value)) return new Set<string>(value.filter(id => typeof id === 'string' && opaqueId.test(id)).slice(-maxReadIds));
  } catch { /* The read preference also works without browser storage. */ }
  return new Set<string>();
}

function ScopedDoctorClinicalInbox({ identity, children }: { identity: string; children: ReactNode }) {
  const storageKey = 'trustleaf:doctor-clinical-inbox:v1:' + identity;
  const [state, setState] = useState<InboxState>({ data: null, loading: true, error: '' });
  const [readIds, setReadIds] = useState(() => readNotificationIds(storageKey));
  const [recordNavigationBlocked, setNavigationBlocked] = useState(false);
  const blocked = useRef(false);
  const activeAppointmentsByRecord = useRef(new Map<string, number[]>());
  const requestNow = useRef(() => {});
  const refresh = useCallback(() => requestNow.current(), []);
  const setRecordNavigationBlocked = useCallback((value: boolean) => {
    blocked.current = value;
    setNavigationBlocked(value);
  }, []);
  const canNavigateToRecord = useCallback((historyId?: string, appointmentId?: number) => {
    if (blocked.current) return false;
    if (historyId === undefined) return appointmentId === undefined;
    const appointments = activeAppointmentsByRecord.current.get(historyId);
    return appointments !== undefined && (appointmentId === undefined || appointments.includes(appointmentId));
  }, []);

  useEffect(() => {
    type InboxRead = { controller: AbortController; timeout?: ReturnType<typeof setTimeout> };
    let disposed = false;
    let pollTimer: ReturnType<typeof setTimeout> | undefined;
    let activeRequest: InboxRead | undefined;
    function visible() { return document.visibilityState !== 'hidden'; }
    async function poll() {
      if (disposed || !visible() || activeRequest) return;
      clearTimeout(pollTimer);
      const startedAt = Date.now();
      const request: InboxRead = { controller: new AbortController() };
      activeRequest = request;
      function finish(data: DoctorClinicalInbox | null) {
        if (activeRequest !== request) return;
        activeRequest = undefined;
        clearTimeout(request.timeout);
        activeAppointmentsByRecord.current = new Map(data?.records.map(record => [record.historyId, record.activeAppointmentIds]));
        setState({ data, loading: false, error: data ? '' : 'clinical_inbox_unavailable' });
        if (visible()) {
          const elapsed = Math.max(0, Date.now() - startedAt);
          pollTimer = setTimeout(requestNow.current, Math.max(1000, pollInterval - elapsed));
        }
      }
      request.timeout = setTimeout(() => {
        request.controller.abort();
        finish(null);
      }, 20_000);
      try {
        finish(verifiedInbox(await portalApi<DoctorClinicalInbox>(inboxPath, { signal: request.controller.signal })));
      } catch {
        finish(null);
      }
    }
    function request() { void poll(); }
    function clearUnverified() {
      const previous = activeRequest;
      activeRequest = undefined;
      clearTimeout(previous?.timeout);
      previous?.controller.abort();
      clearTimeout(pollTimer);
      activeAppointmentsByRecord.current.clear();
    }
    function onVisibility() {
      if (!visible()) {
        clearUnverified();
        setState({ data: null, loading: true, error: '' });
      } else request();
    }
    function restorePage(event: PageTransitionEvent) {
      if (!event.persisted) return;
      clearUnverified();
      setState({ data: null, loading: true, error: '' });
      request();
    }
    requestNow.current = request;
    window.addEventListener('focus', request);
    window.addEventListener('pageshow', restorePage);
    document.addEventListener('visibilitychange', onVisibility);
    request();
    return () => {
      disposed = true;
      clearUnverified();
      window.removeEventListener('focus', request);
      window.removeEventListener('pageshow', restorePage);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  const notifications = state.data?.notifications ?? [];
  const unreadCount = notifications.filter(notice => !readIds.has(notice.id)).length;
  function markNotificationsRead() {
    const next = new Set([...readIds, ...notifications.map(notice => notice.id)].slice(-maxReadIds));
    setReadIds(next);
    try { sessionStorage.setItem(storageKey, JSON.stringify([...next])); }
    catch { /* Keep the preference in memory when browser storage is unavailable. */ }
  }
  return <InboxContext.Provider value={{ ...state, enabled: true, refresh, unreadCount, readIds, markNotificationsRead,
    recordNavigationBlocked, setRecordNavigationBlocked, canNavigateToRecord }}>
    {children}
  </InboxContext.Provider>;
}

export function DoctorClinicalInboxProvider({ identity, children }: { identity: string | null; children: ReactNode }) {
  return identity ? <ScopedDoctorClinicalInbox key={identity} identity={identity}>{children}</ScopedDoctorClinicalInbox> : children;
}

const copy = {
  es: {
    title: 'Notificaciones de fichas', markRead: 'Marcar como leídas', refresh: 'Volver a consultar',
    checking: 'Consultando notificaciones…', unavailable: 'No pudimos comprobar las notificaciones.',
    empty: 'Aún no tienes notificaciones de fichas.', unread: 'sin leer', openRecord: 'Abrir ficha', chileTime: 'Hora de Chile',
    blocked: 'Consulta o termina el intento pendiente antes de cambiar de ficha.',
    read: 'Lectura', append: 'Agregar aportes', readAndAppend: 'Lectura y agregado', recordUnavailable: 'Ficha no disponible',
    access_granted: 'Acceso concedido', access_changed: 'Permisos cambiados', access_withdrawn: 'Acceso retirado',
  },
  en: {
    title: 'Clinical record notifications', markRead: 'Mark as read', refresh: 'Check again',
    checking: 'Checking notifications…', unavailable: 'We could not verify your notifications.',
    empty: 'You have no clinical record notifications yet.', unread: 'unread', openRecord: 'Open record', chileTime: 'Chile time',
    blocked: 'Check or finish the pending operation before switching records.',
    read: 'Read', append: 'Add entries', readAndAppend: 'Read and add', recordUnavailable: 'Record unavailable',
    access_granted: 'Access granted', access_changed: 'Permissions changed', access_withdrawn: 'Access withdrawn',
  },
};

export function DoctorClinicalBell() {
  const language = usePortalLanguage();
  const text = copy[language];
  const inbox = useDoctorClinicalInbox();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const lastFocusedControl = useRef<HTMLElement | null>(null);
  const panelId = useId();
  useEffect(() => {
    if (!open) return;
    function closeOutside(event: PointerEvent) {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [open]);
  useEffect(() => {
    if (open && lastFocusedControl.current && !lastFocusedControl.current.isConnected && document.activeElement === document.body) {
      trigger.current?.focus();
    }
  }, [open, inbox.data, inbox.error, inbox.recordNavigationBlocked]);

  if (!inbox.enabled) return null;
  const active = new Map(inbox.data?.records.map(record => [record.historyId, record] as const));
  const notifications = inbox.data?.notifications ?? [];
  function notification(notice: DoctorClinicalNotification) {
    const record = notice.historyId && notice.kind !== 'access_withdrawn' ? active.get(notice.historyId) : undefined;
    const flags = notice.canRead ? notice.canAppend ? text.readAndAppend : text.read : notice.canAppend ? text.append : null;
    return <li key={notice.id} className="px-1 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
        <p className="font-semibold text-slate-900">{text[notice.kind]}</p>
        {!inbox.readIds.has(notice.id) && <span className="text-xs font-semibold text-sky-700">{text.unread}</span>}
      </div>
      <p className="mt-1 text-xs text-slate-600"><time dateTime={notice.at}>{chileDateTime(Date.parse(notice.at) / 1000, language)}</time> · {text.chileTime}</p>
      {record ? <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3">
        <div className="min-w-0 flex-1">
          {record.patientLabel && <p className="break-words text-slate-700">{record.patientLabel}</p>}
          {flags && <p className="text-xs text-slate-600">{flags}</p>}
        </div>
        {!inbox.recordNavigationBlocked && <Link href={'/doctor?tab=historial&record=' + record.historyId + '&lang=' + language} prefetch={false}
          onNavigate={event => { if (inbox.canNavigateToRecord(record.historyId)) setOpen(false); else event.preventDefault(); }}
          className="inline-flex min-h-11 shrink-0 items-center rounded text-sm font-semibold text-sky-700 underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600"
          aria-label={record.patientLabel ? text.openRecord + ' · ' + record.patientLabel : undefined}>{text.openRecord}</Link>}
      </div> : notice.kind !== 'access_withdrawn' && <p className="mt-1 text-xs text-slate-600">{text.recordUnavailable}</p>}
    </li>;
  }
  return <div ref={root} className="relative" onFocusCapture={event => {
    lastFocusedControl.current = event.target;
  }} onKeyDown={event => {
    if (event.key === 'Escape' && open) {
      event.stopPropagation();
      setOpen(false);
      trigger.current?.focus();
    }
  }} onBlur={event => {
    if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }}>
    <button ref={trigger} type="button" onClick={() => setOpen(value => !value)} aria-expanded={open}
      aria-label={text.title + (inbox.unreadCount ? ' · ' + inbox.unreadCount + ' ' + text.unread : '')}
      aria-controls={panelId}
      className="relative grid h-11 w-11 place-items-center rounded-xl text-slate-700 hover:bg-sky-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600">
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
      </svg>
      {inbox.unreadCount > 0 && <span aria-hidden="true" className="absolute right-0 top-0 min-w-4 rounded-full bg-sky-700 px-1 text-center text-[10px] font-bold leading-4 text-white">
        {inbox.unreadCount > 99 ? '99+' : inbox.unreadCount}
      </span>}
    </button>
    <section id={panelId} aria-labelledby={panelId + '-title'} hidden={!open}
      className={`${styles.notificationPanel} fixed inset-x-3 top-16 z-40 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 text-sm shadow-lg sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-96`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={panelId + '-title'} className="font-semibold text-slate-900">{text.title}</h2>
        {inbox.unreadCount > 0 && <button type="button" onClick={() => { inbox.markNotificationsRead(); trigger.current?.focus(); }}
          className="min-h-11 rounded-xl px-3 text-sm font-semibold text-sky-700 hover:bg-sky-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600">
          {text.markRead}
        </button>}
      </div>
      {inbox.loading && <p role="status" className="mt-3 text-slate-600">{text.checking}</p>}
      {inbox.error && <div role="alert" className="mt-3 text-slate-700">
        <p>{text.unavailable}</p>
        <button type="button" onClick={inbox.refresh} className="min-h-11 rounded font-semibold text-sky-700 underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600">
          {text.refresh}
        </button>
      </div>}
      {inbox.recordNavigationBlocked && notifications.some(notice => notice.historyId && active.has(notice.historyId)) &&
        <p className="mt-3 rounded-xl bg-sky-50 p-3 text-sky-900">{text.blocked}</p>}
      {inbox.data && (notifications.length ? <ul className="mt-2 divide-y divide-slate-200 border-t border-slate-200">{notifications.map(notification)}</ul>
        : <p className="mt-3 text-slate-600">{text.empty}</p>)}
    </section>
  </div>;
}
