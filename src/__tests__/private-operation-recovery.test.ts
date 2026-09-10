import { afterEach, describe, expect, it, vi } from 'vitest';
import { mergeOperation, recoverPrivateOperation, verifiedOperation } from '@/components/private-portal/operation-recovery';
import { operationNoticeDetail, portalErrorMessage } from '@/components/private-portal/errors';
import type { PrivateOperation } from '@/components/private-portal/types';

const submitted: PrivateOperation = { id: 'durable-attempt', action: 'mint', state: 'submitted', transactionHash: 'ab'.repeat(32) };
const confirmed: PrivateOperation = { ...submitted, state: 'confirmed' };
const awaiting: PrivateOperation = { ...submitted, transactionHash: null, state: 'awaiting_signature' };
afterEach(() => vi.useRealTimers());
function observer() {
  return { signal: new AbortController().signal, onUpdate: vi.fn(), onError: vi.fn() };
}
describe('Recovery of a durable private operation', () => {
  it('starts reading a submitted attempt immediately after a page load', async () => {
    const read = vi.fn(async () => confirmed), output = observer();
    await recoverPrivateOperation(submitted, { ...output, read });
    expect(read).toHaveBeenCalledWith(submitted.id, output.signal);
    expect(output.onUpdate).toHaveBeenCalledExactlyOnceWith(confirmed);
    expect(output.onError).not.toHaveBeenCalled();
  });
  it('keeps the same attempt after an RPC failure and stops only after its receipt', async () => {
    vi.useFakeTimers();
    const read = vi.fn().mockRejectedValueOnce(new Error('RPC unavailable')).mockResolvedValueOnce(submitted).mockResolvedValueOnce(confirmed);
    const output = observer(), work = recoverPrivateOperation(submitted, { ...output, read });
    await vi.advanceTimersByTimeAsync(0);
    expect(output.onError).toHaveBeenCalledWith('RPC unavailable');
    expect(output.onUpdate).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(3000);
    expect(output.onUpdate).toHaveBeenLastCalledWith(submitted);
    await vi.advanceTimersByTimeAsync(3000);
    await work;
    expect(read.mock.calls.map(call => call[0])).toEqual([submitted.id, submitted.id, submitted.id]);
    expect(output.onUpdate).toHaveBeenLastCalledWith(confirmed);
    await vi.advanceTimersByTimeAsync(9000);
    expect(read).toHaveBeenCalledTimes(3);
  });
  it('reconciles a lost confirmation response without preparing or signing another attempt', async () => {
    vi.useFakeTimers();
    const read = vi.fn().mockResolvedValueOnce(submitted).mockResolvedValueOnce(confirmed), output = observer();
    const work = recoverPrivateOperation(awaiting, { ...output, read, reconcileUncertain: true });
    await vi.advanceTimersByTimeAsync(3000);
    await work;
    expect(output.onUpdate.mock.calls.map(call => call[0].state)).toEqual(['submitted', 'confirmed']);
    expect(read.mock.calls.map(call => call[0])).toEqual([awaiting.id, awaiting.id]);
  });
  it('leaves an unsigned request for an explicit user action', async () => {
    const read = vi.fn(), output = observer();
    await recoverPrivateOperation(awaiting, { ...output, read });
    expect(read).not.toHaveBeenCalled();
    expect(output.onUpdate).not.toHaveBeenCalled();
  });
  it('shows a failed chain receipt as failed and never as success', async () => {
    const failed: PrivateOperation = { ...submitted, state: 'failed', errorCode: 'transaction_failed' };
    const output = observer();
    await recoverPrivateOperation(submitted, { ...output, read: async () => failed });
    expect(output.onUpdate).toHaveBeenCalledExactlyOnceWith(failed);
    expect(portalErrorMessage(failed.errorCode!)).toContain('no quedó confirmado');
  });
  it('rejects another operation returned by the status endpoint', async () => {
    const controller = new AbortController(), onUpdate = vi.fn();
    const onError = vi.fn(() => controller.abort());
    await recoverPrivateOperation(submitted, { signal: controller.signal, onUpdate, onError, read: async () => ({ ...confirmed, id: 'another-attempt' }) });
    expect(onError).toHaveBeenCalledOnce();
    expect(onUpdate).not.toHaveBeenCalled();
  });
  it('stops polling and ignores responses after leaving the screen', async () => {
    vi.useFakeTimers();
    const controller = new AbortController(), output = observer(), read = vi.fn(async () => submitted);
    const work = recoverPrivateOperation(submitted, { ...output, signal: controller.signal, read });
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    await work;
    await vi.advanceTimersByTimeAsync(9000);
    expect(read).toHaveBeenCalledOnce();
  });
});
describe('Monotonic UI state and reviewer-visible errors', () => {
  it('accepts the same operation advancing from awaiting_signature to submitted', () => expect(mergeOperation(awaiting, submitted)).toEqual(submitted));
  it('does not regress a confirmed receipt due to an older list response', () => expect(mergeOperation(confirmed, submitted)).toEqual(confirmed));
  it('does not regress a submitted attempt to an unsigned request', () => expect(mergeOperation(submitted, awaiting)).toEqual(submitted));
  it('never presents confirmed without a usable receipt hash', () => expect(() => verifiedOperation({ ...confirmed, transactionHash: null })).toThrow());
  it('never accepts an unknown operation state', () => expect(() => verifiedOperation({ ...confirmed, state: 'optimistic_success' })).toThrow());
  it('explains a prepared document conflict without offering to overwrite it', () => expect(portalErrorMessage('private_prescription_already_prepared')).toContain('Revisar y continuar emisión'));
  it('explains the check-in window and paused writes using the actual server error names', () => {
    expect(portalErrorMessage('consultation_outside_checkin_window')).toContain('30 minutos');
    expect(portalErrorMessage('private_writes_paused')).toContain('temporalmente deshabilitadas');
  });
  it('does not expose unrecognized provider payloads in an error message', () => expect(portalErrorMessage('secret provider payload')).not.toContain('secret provider payload'));
});

const changedEligibility = [
  { action: 'consent', errorCode: 'consent_already_active' },
  { action: 'activate', errorCode: 'prescription_not_activatable' },
] satisfies Pick<PrivateOperation, 'action' | 'errorCode'>[];

describe('Changed eligibility while a saved receipt is pending', () => {
  it.each(changedEligibility)('keeps $action pending until the same attempt receives confirmation', async (change) => {
    vi.useFakeTimers();
    const pending = verifiedOperation({ ...submitted, ...change });
    const receipt: PrivateOperation = { ...pending, state: 'confirmed', errorCode: null };
    const read = vi.fn().mockResolvedValueOnce(pending).mockResolvedValueOnce(receipt);
    const seen: { state: PrivateOperation['state']; detail: string | null }[] = [];
    const output = observer();
    const work = recoverPrivateOperation(pending, { ...output, read, onUpdate: next => {
      seen.push({ state: next.state, detail: operationNoticeDetail(next) });
    } });
    await vi.advanceTimersByTimeAsync(0);
    expect(seen).toEqual([{ state: 'submitted', detail: expect.stringContaining('todavía no está confirmado') }]);
    expect(pending.errorCode).toBe(change.errorCode);
    expect(pending.transactionHash).toBe(submitted.transactionHash);
    await vi.advanceTimersByTimeAsync(3000);
    await work;
    expect(seen).toHaveLength(2);
    expect(seen[1]).toEqual({ state: 'confirmed', detail: null });
    expect(read.mock.calls.map(call => call[0])).toEqual([pending.id, pending.id]);
    await vi.advanceTimersByTimeAsync(9000);
    expect(read).toHaveBeenCalledTimes(2);
    expect(output.onError).not.toHaveBeenCalled();
  });

  it.each(changedEligibility)('replaces the pending $action explanation with a real failed receipt', async (change) => {
    vi.useFakeTimers();
    const pending = verifiedOperation({ ...submitted, ...change });
    const failed: PrivateOperation = { ...pending, state: 'failed', errorCode: 'transaction_failed' };
    const read = vi.fn().mockResolvedValueOnce(pending).mockResolvedValueOnce(failed);
    const output = observer();
    const work = recoverPrivateOperation(pending, { ...output, read });
    await vi.advanceTimersByTimeAsync(3000);
    await work;
    const updates = output.onUpdate.mock.calls.map(call => call[0] as PrivateOperation);
    expect(updates.map(next => next.state)).toEqual(['submitted', 'failed']);
    expect(operationNoticeDetail(updates[0])).toContain('todavía no está confirmado');
    expect(operationNoticeDetail(updates[1])).toBe(portalErrorMessage('transaction_failed'));
    expect(operationNoticeDetail(updates[1])).toContain('Stellar rechazó');
    expect(updates[1].transactionHash).toBe(pending.transactionHash);
    await vi.advanceTimersByTimeAsync(9000);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it.each(['awaiting_signature', 'failed', 'cancelled'] as const)('preserves eligibility errors in state %s', state => {
    for (const change of changedEligibility) {
      expect(operationNoticeDetail({ ...submitted, ...change, state })).toBe(portalErrorMessage(change.errorCode));
    }
  });

  it('does not reinterpret the same codes for a different action', () => {
    for (const change of changedEligibility) {
      expect(operationNoticeDetail({ ...submitted, ...change, action: 'revoke' })).toBe(portalErrorMessage(change.errorCode));
    }
    expect(operationNoticeDetail({ ...submitted, action: 'consent', errorCode: 'prescription_not_activatable' }))
      .toBe(portalErrorMessage('prescription_not_activatable'));
    expect(operationNoticeDetail({ ...submitted, action: 'activate', errorCode: 'consent_already_active' }))
      .toBe(portalErrorMessage('consent_already_active'));
  });

  it.each([null, 'z'.repeat(64), 'ab'.repeat(31)])('never treats an invalid receipt hash as normal waiting: %s', transactionHash => {
    for (const change of changedEligibility) {
      const invalid = { ...submitted, ...change, transactionHash };
      expect(() => verifiedOperation(invalid)).toThrow();
      expect(operationNoticeDetail(invalid)).toBe(portalErrorMessage(change.errorCode));
    }
  });

  it('keeps unrelated identity, integrity and relay errors visible on submitted attempts', () => {
    for (const errorCode of ['wallet_binding_changed', 'operation_context_changed', 'receipt_mismatch', 'relay_response_unavailable']) {
      const detail = operationNoticeDetail({ ...submitted, action: 'activate', errorCode });
      expect(detail).toBe(portalErrorMessage(errorCode));
      expect(detail).not.toBeNull();
    }
  });

  it('does not add a warning without a code or retain it after confirmation', () => {
    expect(operationNoticeDetail(submitted)).toBeNull();
    for (const change of changedEligibility) {
      expect(operationNoticeDetail({ ...confirmed, ...change })).toBeNull();
    }
  });
});
