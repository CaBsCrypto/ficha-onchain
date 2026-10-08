import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useLogin, usePrivy } from '@privy-io/react-auth';
import { AppPrivyProvider } from '../../src/providers/PrivyProvider';
import './style.css';

type Context = {
  nonce: string; mode: 'inspect' | 'run' | 'execute'; runId: string;
  target: string; expectedPatient: string | null; expiresAt: number;
};
const localRequest = (path: string, body: object, signal?: AbortSignal) => fetch(path, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body), credentials: 'omit', cache: 'no-store',
  redirect: 'error', referrerPolicy: 'no-referrer', signal,
});

function Authorization({ context }: { context: Context }) {
  const { ready, authenticated, user, getAccessToken, logout } = usePrivy();
  const [confirmedSynthetic, setConfirmedSynthetic] = useState(false);
  const [busy, setBusy] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [expired, setExpired] = useState(Date.now() >= context.expiresAt);
  const [error, setError] = useState('');
  const writing = context.mode !== 'inspect';
  const { login } = useLogin({
    onComplete: () => { setBusy(false); setError(''); },
    onError: () => { setBusy(false); setError('El ingreso no se completó. Puedes volver a intentarlo.'); },
  });
  useEffect(() => {
    const timer = setTimeout(() => setExpired(true), Math.max(0, context.expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [context.expiresAt]);
  const signIn = () => {
    if (!ready || busy || expired || accepted) return;
    setError(''); setBusy(true);
    try { login({ loginMethods: ['email'] }); }
    catch { setBusy(false); setError('No se pudo abrir el ingreso. Vuelve a intentarlo.'); }
  };
  const authorize = async () => {
    if (!ready || !authenticated || busy || expired || accepted || (writing && !confirmedSynthetic)) return;
    setBusy(true); setError('');
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) throw new Error();
      const response = await localRequest('/__auth', {
        nonce: context.nonce, accessToken, confirmed: true, confirmedSynthetic: writing && confirmedSynthetic,
      });
      const result = await response.json();
      if (!response.ok || result?.accepted !== true) throw new Error();
      setAccepted(true);
    } catch { setError('No se pudo entregar la sesión. Revisa que la prueba local siga abierta.'); }
    finally { setBusy(false); }
  };
  const changeAccount = async () => {
    if (busy || accepted) return;
    setBusy(true); setError(''); setConfirmedSynthetic(false);
    try { await logout(); }
    catch { setError('No se pudo cerrar la sesión. Vuelve a intentarlo.'); }
    finally { setBusy(false); }
  };
  const email = user?.email?.address ?? user?.google?.email;
  return <main className="panel">
    <p className="eyebrow">TRUSTLEAF · STELLAR TESTNET</p>
    <h1>{writing ? 'Autorizar prueba con datos sintéticos' : 'Revisar el acceso de prueba'}</h1>
    <p className="intro">{writing
      ? 'Esta ejecución crea contenido sintético y realiza 8 transacciones en Stellar Testnet. Al terminar, retira los permisos del médico usados durante la prueba.'
      : 'Esta revisión comprueba el acceso al historial existente. No crea operaciones ni firma transacciones.'}</p>
    <dl className="details">
      <div><dt>Ejecución</dt><dd>{context.runId}</dd></div>
      <div><dt>Servidor local</dt><dd>{context.target}</dd></div>
      {context.expectedPatient && <div><dt>Cuenta Stellar esperada</dt><dd>{context.expectedPatient}</dd></div>}
    </dl>
    <section aria-labelledby="session-title" className="session">
      <h2 id="session-title">Tu sesión de Privy</h2>
      {authenticated
        ? <p>Sesión iniciada{email ? <> como <strong>{email}</strong></> : ''}. Revisa que corresponda a la cuenta de esta prueba.</p>
        : <p>Inicia sesión con tu correo. Ingresa el código únicamente en la ventana de Privy.</p>}
      {!authenticated && <button type="button" onClick={signIn} disabled={!ready || busy || expired || accepted}>
        {busy ? 'Abriendo ingreso…' : 'Iniciar sesión con Privy'}
      </button>}
      {authenticated && !accepted && <button type="button" className="secondary" onClick={() => void changeAccount()} disabled={busy || expired}>
        Usar otra cuenta
      </button>}
    </section>
    {writing && !accepted && <label className="confirmation">
      <input type="checkbox" checked={confirmedSynthetic} onChange={event => setConfirmedSynthetic(event.target.checked)}
        disabled={busy || expired} />
      <span>Confirmo el uso de datos sintéticos, las 8 transacciones en Testnet y el retiro final de los permisos del médico.</span>
    </label>}
    {!accepted && <button type="button" className="authorize" onClick={() => void authorize()}
      disabled={!ready || !authenticated || busy || expired || (writing && !confirmedSynthetic)}>
      {busy && authenticated ? 'Entregando sesión…' : writing ? 'Autorizar esta prueba' : 'Autorizar esta revisión'}
    </button>}
    <div className="status" aria-live="polite">
      {accepted && <p className="success">Sesión entregada. La prueba continúa en el proceso local; puedes cerrar esta pestaña.</p>}
      {expired && !accepted && <p>Esta autorización venció. Vuelve a iniciar la prueba desde el proceso local.</p>}
      {error && <p role="alert">{error}</p>}
    </div>
    <p className="footnote">Esta autorización entrega la sesión al proceso local de la ejecución indicada. Los códigos de ingreso se manejan en Privy.</p>
  </main>;
}

function Bootstrap() {
  const [context, setContext] = useState<Context | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const abort = new AbortController();
    void localRequest('/__context', {}, abort.signal).then(async response => {
      const value: Context = await response.json();
      if (!response.ok || !/^[a-f0-9]{64}$/.test(value.nonce) ||
          !['inspect', 'run', 'execute'].includes(value.mode) || !Number.isFinite(value.expiresAt)) throw new Error();
      if (!abort.signal.aborted) setContext(value);
    }).catch(() => { if (!abort.signal.aborted) setFailed(true); });
    return () => abort.abort();
  }, []);
  if (!context) return <main className="panel"><h1>Autorizar prueba local</h1>
    <p role="status">{failed ? 'No se pudo abrir la autorización. Revisa que el proceso local siga activo.' : 'Preparando autorización…'}</p></main>;
  return <AppPrivyProvider><Authorization context={context} /></AppPrivyProvider>;
}

createRoot(document.getElementById('root')!).render(<Bootstrap />);
