'use client';
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import type { PrescriptionVerification as Verification } from './types';

export function receiptUrl(hash: string | null) {
  return hash && /^[a-f0-9]{64}$/i.test(hash) ? `https://stellar.expert/explorer/testnet/tx/${hash}` : null;
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
  return <section className="rx-verification" aria-label="Recibo de emisión en Stellar Testnet">
    {url && qr?.url === url && <figure><a href={url} target="_blank" rel="noreferrer" aria-label="Ver recibo de emisión en Stellar Expert"><img src={qr.data} width="96" height="96" onLoad={() => onQrReady?.(true)} alt="QR del recibo público de emisión en Stellar Expert" /></a><figcaption>Recibo de emisión</figcaption></figure>}
    {!url && <p>{v.rxId ? 'Recibo no disponible' : 'Pendiente de emisión'}</p>}
    {qrError && <p role="alert" className="prescription-toolbar">No se pudo preparar el QR. <button onClick={() => setAttempt(value => value + 1)}>Reintentar QR</button></p>}
  </section>;
}
