'use client';
import { useEffect, useRef, useState } from 'react';
import { usePortalLanguage } from '@/hooks/useLanguage';
import { useSignRawHash } from '@privy-io/react-auth/extended-chains';
import { clinicalPrivySigningError } from './clinical-client';

export const CLINICAL_SIGNING_CHECK_DOMAIN = 'TrustLeaf Stellar Testnet signing check v1';
export interface ClinicalSigningCheckScope {
  identity: string; address: string; historyId: string; runId: string; until: number;
}
export type ClinicalSigningCheckStatus = 'idle' | 'busy' | 'verified';
export function clinicalSigningCheckScopeKey(scope: ClinicalSigningCheckScope) {
  return JSON.stringify([scope.identity, scope.address, scope.historyId, scope.runId, scope.until]);
}
interface Props {
  scope: ClinicalSigningCheckScope; verified: boolean; disabled: boolean;
  onStatusChange: (scopeKey: string, status: ClinicalSigningCheckStatus) => void;
}
const signingCheckCopy = {
  es: {
    invalid: 'La firma de prueba no coincide con esta cuenta. No se preparó ninguna transacción.',
    label: 'Comprobación local de firma',
    description: 'Prueba técnica sin transacción: firma un reto aleatorio de este navegador para comprobar esta cuenta. No crea solicitudes clínicas, no envía datos a Stellar ni cobra comisiones. No concede permisos ni renueva la autorización médica.',
    checking: 'Comprobando firma…',
    check: 'Comprobar firma con Privy',
    verified: 'Firma de prueba verificada en este navegador. Puedes continuar con la preparación si tus permisos siguen vigentes.',
    expired: 'La ventana de esta prueba venció. No se preparará ningún aporte nuevo.',
  },
  en: {
    invalid: 'The test signature doesn’t match this account. No transaction was prepared.',
    label: 'Local signature check',
    description: 'Sign a random challenge from this browser to verify the account. This check creates no clinical requests, sends nothing to Stellar, incurs no fees and leaves permissions and medical authorization as they are.',
    checking: 'Checking signature…',
    check: 'Check signature with Privy',
    verified: 'Test signature verified in this browser. You can continue if your permissions are still valid.',
    expired: 'This test window has expired. Preparing a new entry is unavailable.',
  },
};

const signingCheckErrors: Readonly<Record<string, string>> = {
  signature_cancelled: 'The Privy signature was cancelled.',
  clinical_signing_wallet_unavailable: 'Privy couldn’t find your Stellar wallet in this session.',
  clinical_signing_session_unavailable: 'Privy couldn’t verify your session for signing.',
  clinical_signing_proxy_unavailable: 'Privy couldn’t start its signing component in this browser.',
  clinical_signing_recovery_required: 'Privy requires you to recover signing access in this browser.',
  clinical_signing_verification_required: 'Privy couldn’t complete the additional account verification.',
  clinical_signing_transport_unavailable: 'We couldn’t reach Privy’s signing service.',
  clinical_signing_browser_unavailable: 'The browser couldn’t set up the features Privy needs for signing.',
  clinical_signing_rate_limited: 'Privy temporarily limited signature requests.',
  clinical_signing_request_rejected: 'Privy couldn’t validate the signature request.',
  clinical_signing_not_supported: 'Privy reported that this setup doesn’t support the signature request.',
  clinical_signing_provider_failed: 'Privy reported a failure in its signing service.',
  clinical_signing_response_invalid: 'Privy returned a signature response we couldn’t verify.',
};

const button = 'min-h-11 rounded-xl border border-sky-200 bg-white px-4 py-2.5 text-sm font-semibold text-sky-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:cursor-not-allowed disabled:opacity-50';

/** A fresh browser-generated, domain-separated challenge. Its hash and signature
 * never become a clinical intent, API request, stored value or transaction. */
export function ClinicalSigningCheck({ scope, verified, disabled, onStatusChange }: Props) {
  const language = usePortalLanguage();
  const copy = signingCheckCopy[language];
  const { signRawHash } = useSignRawHash();
  const scopeKey = clinicalSigningCheckScopeKey(scope);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [expired, setExpired] = useState(Date.now() >= scope.until * 1000);
  const alive = useRef(true);
  const attempt = useRef<{ key: string } | null>(null);
  const latest = useRef({ scopeKey, disabled, until: scope.until });
  const report = useRef(onStatusChange);
  latest.current = { scopeKey, disabled, until: scope.until }; report.current = onStatusChange;
  useEffect(() => { alive.current = true; return () => { alive.current = false; attempt.current = null; }; }, []);
  useEffect(() => {
    setBusy(false); setError(''); setExpired(Date.now() >= scope.until * 1000);
    const timer = setTimeout(() => {
      attempt.current = null;
      if (alive.current && latest.current.scopeKey === scopeKey) {
        setBusy(false); setExpired(true); report.current(scopeKey, 'idle');
      }
    }, Math.max(0, scope.until * 1000 - Date.now()));
    return () => { clearTimeout(timer); attempt.current = null; };
  }, [scopeKey, scope.until]);
  async function checkSigning() {
    if (attempt.current || disabled || verified || expired || Date.now() >= scope.until * 1000) return;
    const current = { key: scopeKey }; attempt.current = current;
    const active = () => alive.current && attempt.current === current && latest.current.scopeKey === current.key && !latest.current.disabled && Date.now() < latest.current.until * 1000;
    setBusy(true); setError(''); report.current(scopeKey, 'busy');
    let passed = false;
    try {
      if (!scope.identity || scope.identity.length > 1000 || !/^[a-f0-9]{64}$/.test(scope.historyId) ||
          !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(scope.runId) || !Number.isSafeInteger(scope.until)) throw Error('invalid_local_scope');
      const [{ Keypair }, { Buffer }] = await Promise.all([import('@stellar/stellar-sdk'), import('buffer')]);
      if (!active()) return;
      const publicKey = Keypair.fromPublicKey(scope.address);
      const nonce = crypto.getRandomValues(new Uint8Array(32));
      if (!nonce.some(value => value !== 0)) throw Error('invalid_local_nonce');
      const hex = (bytes: Uint8Array) => Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
      const message = new TextEncoder().encode(CLINICAL_SIGNING_CHECK_DOMAIN + '\n' + JSON.stringify({
        network: 'testnet', identity: scope.identity, address: scope.address, historyId: scope.historyId,
        runId: scope.runId, until: scope.until, nonce: hex(nonce),
      }));
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', message));
      if (!active()) return;
      const result = await signRawHash({ address: scope.address, chainType: 'stellar', hash: ('0x' + hex(digest)) as `0x${string}` });
      if (!active()) return;
      let valid = false;
      try {
        valid = typeof result?.signature === 'string' && /^(?:0x)?[a-f0-9]{128}$/i.test(result.signature) &&
          publicKey.verify(Buffer.from(digest), Buffer.from(result.signature.replace(/^0x/i, ''), 'hex'));
      } catch { /* A malformed signature is only a failed local check. */ }
      if (!valid) { setError(copy.invalid); return; }
      passed = true; report.current(scopeKey, 'verified');
    } catch (failure) {
      // The shared transaction error adds pending-intent guidance, which does not apply to this local check.
      if (active()) {
        const classified = clinicalPrivySigningError(failure);
        setError(language === 'en'
          ? signingCheckErrors[classified.code] ?? 'Privy couldn’t complete the signature check.'
          : classified.message.split(' Consulta el mismo intento')[0]);
      }
    } finally {
      if (attempt.current === current) {
        attempt.current = null;
        if (alive.current && latest.current.scopeKey === current.key) {
          setBusy(false); if (!passed) report.current(scopeKey, 'idle');
        }
      }
    }
  }
  const ended = expired || Date.now() >= scope.until * 1000;
  return <section aria-label={copy.label} className="space-y-3 rounded-xl border border-sky-200 bg-sky-50 p-4">
    <p className="text-sm leading-relaxed text-slate-700">{copy.description}</p>
    <button type="button" disabled={disabled || busy || verified || ended} onClick={() => void checkSigning()} className={button}>{busy ? copy.checking : copy.check}</button>
    {verified && !ended && <p role="status" className="text-sm text-emerald-800">{copy.verified}</p>}
    {ended && <p role="status" className="text-sm text-slate-700">{copy.expired}</p>}
    {error && <p role="alert" className="text-sm text-rose-800">{error}</p>}
  </section>;
}
