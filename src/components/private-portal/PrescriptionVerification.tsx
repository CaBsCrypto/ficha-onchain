'use client';
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import type { PrescriptionVerification as Verification } from './types';

export function receiptUrl(hash: string | null) {
  return hash && /^[a-f0-9]{64}$/i.test(hash) ? `https://stellar.expert/explorer/testnet/tx/${hash}` : null;
}
function Receipt({ hash, label }: { hash: string | null; label: string }) {
  const url = receiptUrl(hash);
  return <div><dt>{label}</dt><dd>{url ? <><a href={url} target="_blank" rel="noreferrer">Ver {label.toLowerCase()} en Stellar Expert</a><code className="rx-hash">{hash}</code></> : 'Recibo no disponible'}</dd></div>;
}
export function PrescriptionVerification({ verification: v, onQrReady }: { verification: Verification; onQrReady?: (ready: boolean) => void }) {
  const url = v.rxId ? receiptUrl(v.issuanceHash) : null;
  const [qr, setQr] = useState<{ url: string; data: string } | null>(null);
  const [qrError, setQrError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    setQr(null);
    setQrError(false);
    onQrReady?.(!url);
    if (url) void QRCode.toDataURL(url, { width: 360, margin: 4, errorCorrectionLevel: 'M' })
      .then(data => { if (alive) setQr({ url, data }); }).catch(() => { if (alive) setQrError(true); });
    return () => { alive = false; };
  }, [url, onQrReady, attempt]);
  const statuses = { Pending: 'Pendiente de emisión', Registered: 'Registrada', Active: 'Activa', Revoked: 'Revocada', Blocked: 'Bloqueada' };
  return <section className="rx-verification" aria-label="Verificación en Stellar Testnet">
    <h5>Verificación en Stellar Testnet</h5>
    <div className="rx-verification-grid"><dl>
      <div><dt>Receta N.º</dt><dd>{v.rxId ?? 'Pendiente de emisión'}</dd></div>
      <div><dt>Contrato</dt><dd>{/^C[A-Z2-7]{55}$/.test(v.contract) ? <a href={`https://stellar.expert/explorer/testnet/contract/${v.contract}`} target="_blank" rel="noreferrer">PrescriptionPrivate v2</a> : 'Contrato no disponible'}</dd></div>
      <div><dt>Estado consultado</dt><dd>{statuses[v.status]}</dd></div>
      <div><dt>Fecha de consulta</dt><dd>{new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium', timeStyle: 'long', timeZone: 'America/Santiago' }).format(new Date(v.checkedAt))} · America/Santiago</dd></div>
      {v.rxId && <Receipt hash={v.issuanceHash} label="Emisión" />}
      {v.status === 'Revoked' && <Receipt hash={v.revocationHash} label="Revocación" />}
    </dl>{url && qr?.url === url && <figure><img src={qr.data} width="144" height="144" onLoad={() => onQrReady?.(true)} alt="QR del recibo público de emisión en Stellar Expert" /><figcaption>Recibo de emisión</figcaption></figure>}</div>
    <p className="rx-verification-note">El estado corresponde a la fecha de consulta. El recibo permite verificar el registro en Stellar Testnet; no publica el contenido privado de esta receta.</p>
    {qrError && <p role="alert" className="prescription-toolbar">No se pudo preparar el QR. <button onClick={() => setAttempt(value => value + 1)}>Reintentar QR</button></p>}
  </section>;
}
