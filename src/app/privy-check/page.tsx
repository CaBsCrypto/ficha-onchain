'use client';
import { usePrivy, useUser } from '@privy-io/react-auth';
import { useSignRawHash } from '@privy-io/react-auth/extended-chains';
import { useState } from 'react';

type Result = { status?: string; error?: string; stage?: string; explorer?: string; operationId?: string; hash?: `0x${string}`; address?: string };
export default function PrivyCheck() {
  const { ready, authenticated, login, logout, getAccessToken, user } = usePrivy();
  const { refreshUser } = useUser();
  const { signRawHash } = useSignRawHash();
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState('');
  const [result, setResult] = useState<Result>({});
  async function request(body: object): Promise<Result> {
    const token = await getAccessToken();
    if (!token) throw new Error('Vuelve a iniciar sesión.');
    const response = await fetch('/api/privy/signing-check', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return response.json();
  }
  async function confirm() {
    setBusy(true);
    let stage = 'wallet';
    try {
      if (result.explorer) { setStep('Consultando confirmación…'); setResult(await request({ action: 'status' })); return; }
      setStep('Comprobando tu cuenta Stellar…');
      const walletToken = await getAccessToken();
      if (!walletToken) throw new Error('authentication');
      const walletResponse = await fetch('/api/privy/stellar-wallet', { method: 'POST', headers: { Authorization: `Bearer ${walletToken}` } });
      if (!walletResponse.ok) {
        const binding = await walletResponse.json();
        setResult({ error: binding.error === 'wallet_binding_ambiguous' ? 'Hay varias wallets Stellar históricas. Falta registrar cuál usará tu cuenta en TrustLeaf; no se creará ninguna adicional.' : 'No se pudo confirmar una wallet única. No crearemos otra mientras se revisa la asociación.', stage: binding.error });
        return;
      }
      const resolvedWallet = await walletResponse.json();
      await refreshUser();
      // Signing hooks must render with the refreshed identity before first use.
      if (!user?.linkedAccounts.some(a => a.type === 'wallet' && a.chainType === 'stellar' && a.address === resolvedWallet.address)) {
        setResult({ error: 'Tu wallet Stellar ya está asociada. Pulsa de nuevo para confirmar la operación de prueba.' });
        return;
      }
      stage = 'prepare';
      setStep('Preparando la operación de prueba…');
      const prepared = await request({ action: 'prepare' });
      if (!prepared.hash || !prepared.address || prepared.error || prepared.explorer) { setResult(prepared); return; }
      stage = 'sign';
      setStep('Confirmando con tu cuenta Stellar…');
      const { signature } = await signRawHash({ chainType: 'stellar', address: prepared.address, hash: prepared.hash });
      stage = 'relay';
      setStep('Enviando a Stellar Testnet…');
      setResult(await request({ action: 'confirm', operationId: prepared.operationId, signature }));
    } catch (error) {
      // Expose only bounded diagnostic codes, never provider payloads or tokens.
      const failure = error as { code?: unknown; status?: unknown; statusCode?: unknown; message?: unknown } | null;
      const code = typeof failure?.code === 'string' && /^[a-zA-Z_]{1,64}$/.test(failure.code) ? failure.code : 'unknown';
      const status = failure?.status ?? failure?.statusCode;
      const hints = typeof failure?.message === 'string'
        ? Array.from(new Set(failure.message.toLowerCase().match(/\b(?:wallet|creation|create|enabled|disabled|unsupported|chain|stellar|unauthorized|authenticated|authentication|forbidden|network|fetch|failed|configuration|unified|multiple|already|exists|policy|policies|invalid|request|origin|allowed|not|app|application|stack|limit|exceeded)\b/g) ?? [])).join(' ')
        : '';
      setResult({ error: 'No se completó la operación. Conservamos el estado sin confirmar para revisar el problema.', stage: `${stage}:${code}${typeof status === 'number' ? `:${status}` : ''}${hints ? ` · ${hints}` : ''}` });
    }
    finally { setBusy(false); setStep(''); }
  }
  const success = result.status === 'SUCCESS';
  const failed = !!result.error || ['FAILED', 'REJECTED'].includes(result.status ?? '');
  return <main className="min-h-screen bg-slate-50 px-5 py-10 sm:py-16">
    <div className="mx-auto max-w-3xl">
      <header className="mb-10 flex items-center justify-between gap-4"><span className="text-xl font-bold tracking-tight text-slate-900">Trust<span className="text-sky-600">Leaf</span></span><span className="rounded-full border border-sky-100 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-800">STELLAR · TESTNET</span></header>
      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-6 py-8 sm:px-10"><p className="mb-3 text-xs font-semibold uppercase tracking-widest text-sky-700">Validación de acceso y firma</p><h1 className="text-3xl font-semibold tracking-tight text-slate-900">Tu cuenta. Tu confirmación.</h1><p className="mt-4 max-w-xl leading-7 text-slate-600">Accede con Privy y confirma una operación de prueba en Stellar. TrustLeaf cubre la comisión; no necesitas comprar XLM ni conectar una wallet externa.</p></div>
        <div className="space-y-6 px-6 py-8 sm:px-10">
          <ol className="grid gap-3 text-sm text-slate-600 sm:grid-cols-3">{['Acceder con Privy', 'Confirmar con Stellar', 'Verificar el recibo'].map((label, i) => <li key={label} className="flex items-center gap-2"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sky-50 font-semibold text-sky-700">{i + 1}</span>{label}</li>)}</ol>
          <div className="rounded-2xl bg-slate-50 p-5"><p className="text-sm font-medium text-slate-900">{authenticated ? user?.email?.address ?? 'Sesión iniciada con Privy' : 'Comienza con tu cuenta de prueba'}</p><p className="mt-2 text-sm leading-6 text-slate-600">La operación consulta la versión del registro privado. No crea recetas ni concede permisos médicos.</p></div>
          {!authenticated ? <button disabled={!ready} onClick={login} className="w-full rounded-xl bg-sky-600 px-5 py-3.5 font-semibold text-white hover:bg-sky-700 disabled:opacity-50">{ready ? 'Continuar con Privy' : 'Preparando acceso seguro…'}</button> : <><button disabled={busy} onClick={confirm} className="w-full rounded-xl bg-sky-600 px-5 py-3.5 font-semibold text-white hover:bg-sky-700 disabled:opacity-50">{busy ? step : result.explorer ? 'Consultar confirmación' : 'Confirmar operación de prueba'}</button><button disabled={busy} onClick={async () => { await logout(); setResult({}); }} className="block w-full text-sm text-slate-600 underline underline-offset-4">Salir y probar otra cuenta</button></>}
          {(result.status || result.error) && <div role="status" className={`rounded-xl p-4 text-sm leading-6 ${success ? 'bg-emerald-50 text-emerald-800' : failed ? 'bg-amber-50 text-amber-900' : 'bg-sky-50 text-sky-900'}`}><p>{success ? 'Firma verificada y operación confirmada en Stellar Testnet.' : failed ? 'La operación no se completó.' : 'Enviada. Pendiente de confirmación.'}</p>{result.error && <p>{result.error}{result.stage ? ` (${result.stage})` : ''}</p>}{result.explorer && <a href={result.explorer} target="_blank" rel="noreferrer" className="mt-2 block font-semibold underline">Ver recibo en Stellar Expert ↗</a>}</div>}
        </div>
      </section><p className="mt-6 text-center text-xs leading-5 text-slate-500">Entorno local de validación · Solo cuentas y datos de prueba<br />Login con Privy · Firma Stellar · Comisiones cubiertas por TrustLeaf</p>
    </div>
  </main>;
}
