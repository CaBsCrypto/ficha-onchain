import type { OperationAction, PrivateOperation } from './types';

const actions: OperationAction[] = ['consent', 'withdraw_consent', 'mint', 'activate', 'revoke'];
const terminal = ['confirmed', 'failed', 'cancelled'];
export function verifiedOperation(value: unknown, expected?: { id?: string; action?: OperationAction }): PrivateOperation {
  const operation = value as PrivateOperation | null;
  if (!operation || typeof operation.id !== 'string' || !operation.id || !actions.includes(operation.action) ||
      !['awaiting_signature', 'submitted', ...terminal].includes(operation.state) ||
      (expected?.id && operation.id !== expected.id) || (expected?.action && operation.action !== expected.action) ||
      (['submitted', 'confirmed'].includes(operation.state) && !/^[a-f0-9]{64}$/i.test(operation.transactionHash ?? ''))) {
    throw new Error('No se pudo verificar el estado de esta operación. Vuelve a consultar antes de continuar.');
  }
  return operation;
}
export function mergeOperation(current: PrivateOperation | null, incoming: PrivateOperation) {
  if (current?.id !== incoming.id) return incoming;
  if (terminal.includes(current.state) || (current.state === 'submitted' && incoming.state === 'awaiting_signature')) return current;
  return incoming;
}
function pause(signal: AbortSignal, milliseconds: number) {
  return new Promise<void>(resolve => {
    if (signal.aborted) { resolve(); return; }
    const finish = () => { clearTimeout(timer); signal.removeEventListener('abort', finish); resolve(); };
    const timer = setTimeout(finish, milliseconds);
    signal.addEventListener('abort', finish, { once: true });
  });
}
/** Read one durable attempt until terminal; this path can never prepare or sign another transaction. */
export async function recoverPrivateOperation(initial: PrivateOperation, dependencies: {
  read: (id: string, signal: AbortSignal) => Promise<unknown>;
  onUpdate: (operation: PrivateOperation) => void; onError: (message: string) => void;
  signal: AbortSignal; reconcileUncertain?: boolean; interval?: number;
}) {
  const { signal } = dependencies;
  if (initial.state !== 'submitted' && !dependencies.reconcileUncertain) return;
  while (!signal.aborted) {
    try {
      const next = verifiedOperation(await dependencies.read(initial.id, signal), initial);
      if (signal.aborted) return;
      dependencies.onUpdate(next);
      if (next.state !== 'submitted') return;
    } catch (failure) {
      if (signal.aborted) return;
      dependencies.onError(failure instanceof Error ? failure.message : 'No se pudo consultar la confirmación.');
    }
    await pause(signal, dependencies.interval ?? 3000);
  }
}
