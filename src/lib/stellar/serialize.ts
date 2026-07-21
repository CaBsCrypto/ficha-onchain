/**
 * Per-signer serialization for Soroban submits.
 *
 * The demo flows sign every on-chain action (consent, ficha append, exam,
 * prescription, license) with a SMALL set of shared secrets — mostly the one
 * DEMO_DOCTOR_SECRET. When a doctor saves a consultation, several of those
 * invokes fire almost simultaneously. Each one fetches the signer's account,
 * reads the SAME sequence number, and builds a tx with seq+1 — so only the
 * first to land succeeds and the rest revert `txBadSeq` and degrade to
 * "simulated". Re-fetch-and-retry alone can't fix it: under real concurrency
 * the racers keep re-colliding.
 *
 * The fix is to never let two submits from the same signer overlap. Every
 * signed submit runs inside `withSignerLock(publicKey, fn)`, which chains calls
 * for a given key into a strict FIFO queue: submit N only starts once submit
 * N-1 has fully settled, so each one fetches a fresh, already-incremented
 * sequence. Different signers still run in parallel (their sequences are
 * independent).
 *
 * This is a single-process, in-memory lock — correct for one Next.js server
 * instance, which is what the demo runs on. It is intentionally NOT a
 * distributed lock; a multi-instance deployment signing from one shared secret
 * would still need the sequence coordinated out of process.
 */

// One tail-promise per signer public key. Resolves when that signer's most
// recently queued task settles; the next task awaits it before starting.
const chains = new Map<string, Promise<unknown>>();

/**
 * Run `fn` such that, for a given `key`, it never overlaps another `fn` queued
 * under the same key. Returns whatever `fn` returns; a rejection propagates to
 * the caller but does NOT break the chain for the next waiter.
 */
export function withSignerLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = chains.get(key) ?? Promise.resolve();
  // Swallow the predecessor's result/error so one failed submit doesn't reject
  // the whole chain — each waiter only cares that the previous one finished.
  const run = prev.then(fn, fn);
  // The stored tail must never reject (it's only used for sequencing), so park a
  // no-op catch on it. `run` itself still surfaces fn's real result/error.
  chains.set(key, run.then(
    () => undefined,
    () => undefined,
  ));
  return run;
}
