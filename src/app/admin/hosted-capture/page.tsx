'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { authedFetch } from '@/lib/auth/authed-fetch';

export default function HostedCaptureAdminPage() {
  const { user } = usePrivy();
  const identity = useRef(user?.id);
  identity.current = user?.id;
  const request = useRef<AbortController | null>(null);
  const [digest, setDigest] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    setDigest('');
    setBusy(false);
    setMessage('');
    return () => request.current?.abort();
  }, [user?.id]);
  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const sha256 = digest.trim();
    const userId = identity.current;
    if (!userId || !/^(?!0{64}$)[a-f0-9]{64}$/.test(sha256) || busy) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setMessage('');
    try {
      const response = await authedFetch('/api/admin/hosted-capture-proof', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sha256 }), signal: controller.signal,
      });
      const result = await response.json();
      if (controller.signal.aborted || identity.current !== userId) return;
      if (!response.ok || result.status !== 'verified' || result.sha256 !== sha256) {
        const code = typeof result.error === 'string' && /^[a-z_]+$/.test(result.error) ? result.error : null;
        setMessage(code ? `Verification failed (${code}).` : 'Verification failed.');
        return;
      }
      setMessage(`Verified ${result.phase}. Continue with the same SHA-256 in the operator console.`);
    } catch {
      if (!controller.signal.aborted && identity.current === userId) setMessage('Verification unavailable. Check the session and try again.');
    } finally {
      if (!controller.signal.aborted && identity.current === userId) setBusy(false);
    }
  }
  return <section className="mx-auto max-w-xl space-y-5 rounded-xl border border-slate-200 bg-white p-6">
    <h1 className="text-xl font-semibold">Verify a Testnet recording phase</h1>
    <form className="space-y-3" onSubmit={verify}>
      <label className="block text-sm font-medium" htmlFor="capture-digest">Staged SHA-256</label>
      <input id="capture-digest" className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono"
        value={digest} onChange={event => setDigest(event.target.value)} maxLength={64} required autoComplete="off" />
      <button type="submit" className="rounded-lg bg-sky-800 px-4 py-2 text-white disabled:opacity-50"
        disabled={busy || !/^(?!0{64}$)[a-f0-9]{64}$/.test(digest)}>{busy ? 'Verifying…' : 'Verify phase'}</button>
    </form>
    <p role="status" className="text-sm text-slate-700">{message}</p>
  </section>;
}
