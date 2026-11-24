'use client';

import { usePortalLanguage } from '@/hooks/useLanguage';
import { chileDateTime, usePortalData } from './client';

type LinkedPrescription = {
  linkRef: string;
  source: string;
  href: string;
  clinicalStatus: 'active' | 'revoked';
  occurredAt: string;
  proofState: 'pending' | 'confirmed' | 'unavailable';
  credentialId?: string | null;
};

const labels = {
  es: {
    title: 'Recetas de otros portales', loading: 'Consultando recetas vinculadas…',
    empty: 'Aún no hay recetas vinculadas a tu cuenta.', error: 'No pudimos consultar tus recetas vinculadas.', refresh: 'Volver a consultar',
    prescription: 'Receta', revoked: 'Revocada', issued: 'Emitida', issuer: 'según el emisor', view: 'Ver receta',
    credential: 'Credencial no transferible', pending: 'Confirmación de integridad pendiente',
    confirmed: 'Compromiso registrado en Stellar Testnet', unavailable: 'Prueba de integridad no disponible',
  },
  en: {
    title: 'Prescriptions from connected portals', loading: 'Checking linked prescriptions…',
    empty: 'Your account has no linked prescriptions yet.', error: 'We could not load your linked prescriptions.', refresh: 'Check again',
    prescription: 'Prescription', revoked: 'Revoked', issued: 'Issued', issuer: 'as reported by the issuer', view: 'View prescription',
    credential: 'Non-transferable credential', pending: 'Integrity confirmation pending',
    confirmed: 'Commitment recorded on Stellar Testnet', unavailable: 'Integrity proof unavailable',
  },
} as const;

export function ClinicalLinksPanel() {
  const language = usePortalLanguage();
  const text = labels[language];
  const { data, error, loading, checkingFreshness, refresh } = usePortalData<{ links: LinkedPrescription[] }>(
    '/api/v1/me/clinical-links', 6000, { pauseWhenHidden: true },
  );
  const links = data?.links ?? [];
  const checking = loading || checkingFreshness;
  return <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5" aria-labelledby="clinical-links-title">
    <h2 id="clinical-links-title" className="font-semibold text-slate-900">{text.title}</h2>
    {checking && <p role="status" className="text-sm text-slate-600">{text.loading}</p>}
    {error && <p role="alert" className="text-sm text-rose-800">{text.error}{' '}
      <button type="button" className="min-h-11 font-semibold underline" onClick={refresh}>{text.refresh}</button>
    </p>}
    {!checking && !error && (links.length ? <ul className="divide-y divide-slate-200">
      {links.map(link => <li key={link.linkRef} className="flex flex-wrap items-center justify-between gap-3 py-3">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-slate-900">{text.prescription} · {link.source}</h3>
          <p className="text-sm text-slate-700">{link.clinicalStatus === 'revoked' ? text.revoked : text.issued} {text.issuer} · {chileDateTime(Date.parse(link.occurredAt) / 1000, language)}</p>
          {link.credentialId && <p className="text-sm text-slate-600">{text.credential} #{link.credentialId}</p>}
          <p className="text-sm text-slate-600">{text[link.proofState]}</p>
        </div>
        <a className="inline-flex min-h-11 items-center rounded-xl border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-800 focus-visible:outline-2 focus-visible:outline-sky-600"
          href={link.href} referrerPolicy="no-referrer">{text.view}</a>
      </li>)}
    </ul> : <p className="text-sm text-slate-600">{text.empty}</p>)}
  </section>;
}
