"use client";

import { useId, useRef, useState, type FormEvent } from 'react';
import { useLanguage } from '@/hooks/useLanguage';
import { normalizeWaitlistEmail, WAITLIST_EMAIL_MAX_LENGTH } from '@/lib/waitlist';
import { waitlistCopy } from '@/lib/waitlist-copy';

type Status = 'idle' | 'invalid' | 'submitting' | 'done' | 'unavailable' | 'limited';

/** Shared by the section and modal; one in-flight submission per form. */
export function WaitlistForm({ compact = false, tone = 'dark' }: { compact?: boolean; tone?: 'light' | 'dark' }) {
  const { t, lang } = useLanguage();
  const copy = waitlistCopy[lang];
  const light = tone === 'light';
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const inFlight = useRef(false);
  const id = useId();
  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (inFlight.current) return;
    const normalized = normalizeWaitlistEmail(email);
    if (!normalized) { setStatus('invalid'); return; }
    inFlight.current = true; setStatus('submitting');
    try {
      const response = await fetch('/api/waitlist', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalized }), cache: 'no-store',
      });
      if (response.status === 429) { setStatus('limited'); return; }
      if (response.status === 400) { setStatus('invalid'); return; }
      if (!response.ok || (await response.json()).success !== true) throw new Error('unavailable');
      setStatus('done'); setEmail('');
    } catch { setStatus('unavailable'); }
    finally { inFlight.current = false; }
  }
  const error = status === 'invalid' ? t.waitlist.invalid : status === 'limited' ? copy.limited : status === 'unavailable' ? copy.unavailable : null;
  return <div className="mt-6">
    {status === 'done' ? <p role="status" className={`rounded-xl p-4 text-sm ${light ? 'bg-emerald-50 text-emerald-800' : 'bg-emerald-500/15 text-emerald-200'}`}>{copy.success}</p> :
      <form onSubmit={onSubmit} noValidate aria-busy={status === 'submitting'} className={compact ? 'space-y-3' : 'mx-auto flex max-w-xl flex-col gap-3 sm:flex-row'}>
        <label className="sr-only" htmlFor={id}>{copy.email}</label>
        <input id={id} type="email" autoComplete="email" maxLength={WAITLIST_EMAIL_MAX_LENGTH} value={email}
          disabled={status === 'submitting'}
          onChange={event => { setEmail(event.target.value); if (status !== 'submitting') setStatus('idle'); }}
          placeholder={t.waitlist.placeholder} aria-invalid={status === 'invalid'} aria-describedby={`${id}-notice${error ? ` ${id}-error` : ''}`}
          className={`min-h-11 min-w-0 w-full flex-1 rounded-xl border px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 ${light ? 'border-slate-300 bg-white text-slate-900 placeholder-slate-500' : 'border-white/25 bg-white/10 text-white placeholder-white/60'}`} />
        <button type="submit" disabled={status === 'submitting'} className={`${compact ? 'w-full min-h-11' : ''} shrink-0 rounded-xl px-5 py-3 text-sm font-semibold disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 ${light ? 'bg-clinical text-white hover:bg-sky-600' : 'bg-white text-sky-900 hover:bg-sky-50'}`}>
          {status === 'submitting' ? copy.sending : status === 'unavailable' || status === 'limited' ? copy.retry : t.waitlist.cta}
        </button>
      </form>}
    {error && <p id={`${id}-error`} role="alert" className={`mt-3 text-sm ${light ? 'text-rose-700' : 'text-rose-200'}`}>{error}</p>}
    <p id={`${id}-notice`} className={`mt-4 text-xs leading-relaxed ${light ? 'text-slate-600' : 'text-white/75'}`}>{copy.interest}</p>
    <details className={`mt-3 text-left text-xs leading-relaxed ${light ? 'text-slate-600' : 'text-white/75'}`}>
      <summary className="cursor-pointer underline underline-offset-4">{copy.privacyTitle}</summary>
      <p className="mt-2">{copy.privacy}</p>
    </details>
  </div>;
}
