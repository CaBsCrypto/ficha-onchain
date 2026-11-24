'use client';

import { useState, type FormEvent } from 'react';
import { usePortalLanguage } from '@/hooks/useLanguage';
import { chileDateTime, jsonBody, portalApi, PortalApiError, usePortalData } from './client';

type Binding = {
  bindingId: string;
  status: 'pending' | 'claimed' | 'active' | 'revoked' | 'expired';
  expiresAt: string;
};

type LinkedPrescription = {
  linkRef: string;
  source: string;
  href: string;
  clinicalStatus: 'active' | 'revoked';
  occurredAt: string;
  proofState: 'pending' | 'confirmed' | 'unavailable';
};

const bindingPath = '/api/v1/me/binding';
const action = 'inline-flex min-h-11 items-center justify-center rounded-xl border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-800 focus-visible:outline-2 focus-visible:outline-sky-600 disabled:opacity-50';
const copy = {
  es: {
    title: 'Recetas de TrustLeaf Cannabis', description: 'Vincula tus cuentas para ver en esta ficha las recetas de prueba que emita TrustLeaf Cannabis. El documento se abre en su portal.',
    loading: 'Consultando la vinculación…', active: 'Vinculación activa hasta', revoke: 'Retirar permiso', code: 'Código de confirmación de Cannabis',
    confirm: 'Confirmar vinculación', cancel: 'Cancelar', copy: 'Copia este código y pégalo en TrustLeaf Cannabis. Vence el', bindingCode: 'Código para vincular cuentas',
    open: 'Abrir TrustLeaf Cannabis', refresh: 'Ya ingresé el código', restart: 'Generar otro código', start: 'Vincular mi cuenta',
    prescription: 'Receta cannábica', revoked: 'Revocada', issued: 'Emitida', issuer: 'según el emisor', view: 'Ver receta',
    pending: 'Registro de integridad pendiente', confirmed: 'Compromiso registrado en Stellar Testnet', unavailable: 'Prueba de integridad no disponible',
    error: 'No pudimos comprobar la vinculación. Actualiza e inténtalo otra vez.', invalidCode: 'Revisa el código de ocho dígitos en Cannabis y comprueba que siga vigente.',
  },
  en: {
    title: 'TrustLeaf Cannabis prescriptions', description: 'Link your accounts to show test prescriptions from TrustLeaf Cannabis in this record. The document opens in the issuing portal.',
    loading: 'Checking the account link…', active: 'Link active until', revoke: 'Withdraw access', code: 'Cannabis confirmation code',
    confirm: 'Confirm link', cancel: 'Cancel', copy: 'Copy this code and enter it in TrustLeaf Cannabis. It expires on', bindingCode: 'Account linking code',
    open: 'Open TrustLeaf Cannabis', refresh: 'I entered the code', restart: 'Generate another code', start: 'Link my account',
    prescription: 'Cannabis prescription', revoked: 'Revoked', issued: 'Issued', issuer: 'as reported by the issuer', view: 'View prescription',
    pending: 'Integrity registration pending', confirmed: 'Commitment recorded on Stellar Testnet', unavailable: 'Integrity proof unavailable',
    error: 'We could not verify the account link. Refresh and try again.', invalidCode: 'Check the eight-digit code in Cannabis and make sure it is still valid.',
  },
} as const;

export function ClinicalLinksPanel() {
  const language = usePortalLanguage();
  const text = copy[language];
  const dateLabel = (date: string) => chileDateTime(new Date(date).getTime() / 1000, language);
  const bindingData = usePortalData<{ binding: Binding | null }>(bindingPath, 4000, { pauseWhenHidden: true });
  const binding = bindingData.error || bindingData.checkingFreshness ? null : bindingData.data?.binding;
  const linksData = usePortalData<{ links: LinkedPrescription[] }>(binding?.status === 'active' ? '/api/v1/me/clinical-links' : null, 6000, { pauseWhenHidden: true });
  const [created, setCreated] = useState<{ bindingId: string; code: string; href: string } | null>(null);
  const [confirmationCode, setConfirmationCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const showCode = created && binding?.status === 'pending' && binding.bindingId === created.bindingId;

  async function change(kind: 'start' | 'confirm' | 'revoke') {
    if (busy || (kind !== 'start' && !binding)) return;
    setBusy(true);
    setError('');
    try {
      if (kind === 'start') {
        setCreated(await portalApi(bindingPath, { method: 'POST' }));
      } else if (kind === 'confirm' && binding) {
        await portalApi(`${bindingPath}/confirm`, jsonBody({ bindingId: binding.bindingId, confirmationCode }));
        setCreated(null);
      } else if (binding) {
        await portalApi(bindingPath, { ...jsonBody({ bindingId: binding.bindingId }), method: 'DELETE' });
        setCreated(null);
      }
      setConfirmationCode('');
    } catch (failure) {
      setError(failure instanceof PortalApiError && failure.code === 'binding_not_confirmed' ? text.invalidCode : text.error);
    } finally {
      bindingData.refresh();
      linksData.refresh();
      setBusy(false);
    }
  }

  function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void change('confirm');
  }

  return <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5" aria-labelledby="clinical-links-title">
    <h2 id="clinical-links-title" className="font-semibold text-slate-900">{text.title}</h2>
    <p className="text-sm text-slate-600">{text.description}</p>
    {(error || bindingData.error) && <p role="alert" className="text-sm text-rose-800">{error || text.error}</p>}
    {(bindingData.loading || bindingData.checkingFreshness) && <p role="status" className="text-sm text-slate-600">{text.loading}</p>}
    {!bindingData.loading && !bindingData.checkingFreshness && !bindingData.error && <>
      {binding?.status === 'active' ? <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-700">{text.active} {dateLabel(binding.expiresAt)}.</p>
        <button className={action} type="button" disabled={busy} onClick={() => void change('revoke')}>{text.revoke}</button>
      </div> : binding?.status === 'claimed' ? <form className="flex flex-wrap items-end gap-3" onSubmit={confirm}>
        <label className="grid gap-2 text-sm font-medium text-slate-700">
          {text.code}
          <input className="min-h-11 rounded-xl border border-slate-300 px-3 text-base" inputMode="numeric" autoComplete="off" pattern="[0-9]{8}" maxLength={8} required value={confirmationCode} onChange={event => setConfirmationCode(event.target.value)} />
        </label>
        <button className={action} type="submit" disabled={busy}>{text.confirm}</button>
        <button className={action} type="button" disabled={busy} onClick={() => void change('revoke')}>{text.cancel}</button>
      </form> : showCode ? <div className="space-y-3">
        <p className="text-sm text-slate-700">{text.copy} {dateLabel(binding.expiresAt)}.</p>
        <output className="block select-all break-all rounded-xl bg-slate-100 px-3 py-2 font-mono text-sm text-slate-800" aria-label={text.bindingCode}>{created.code}</output>
        <div className="flex flex-wrap gap-3">
          <a className={action} href={created.href} target="_blank" rel="noopener noreferrer">{text.open}</a>
          <button className={action} type="button" disabled={busy} onClick={bindingData.refresh}>{text.refresh}</button>
        </div>
      </div> : <button className={action} type="button" disabled={busy} onClick={() => void change('start')}>{binding?.status === 'pending' ? text.restart : text.start}</button>}
    </>}
    {linksData.error && <p role="alert" className="text-sm text-rose-800">{text.error}</p>}
    {!linksData.error && !linksData.checkingFreshness && !!linksData.data?.links.length && <ul className="divide-y divide-slate-200">
      {linksData.data.links.map(link => <li key={link.linkRef} className="flex flex-wrap items-center justify-between gap-3 py-3">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-slate-900">{text.prescription} · {link.source}</h3>
          <p className="text-sm text-slate-700">{link.clinicalStatus === 'revoked' ? text.revoked : text.issued} {text.issuer} · {dateLabel(link.occurredAt)}</p>
          <p className="text-sm text-slate-600">{text[link.proofState]}</p>
        </div>
        <a className={action} href={link.href} referrerPolicy="no-referrer">{text.view}</a>
      </li>)}
    </ul>}
  </section>;
}
