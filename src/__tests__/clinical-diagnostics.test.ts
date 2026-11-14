import { afterEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { traceClinicalRehearsalPhase } from '@/lib/clinical/diagnostics';
import { PrivateFlowError } from '@/lib/private-config';
import type { ClinicalCreateOncePolicy } from '@/lib/clinical/create-once';
const policy = { mode: 'rehearsal' } as ClinicalCreateOncePolicy;
afterEach(() => vi.restoreAllMocks());
it('logs only a fixed phase, elapsed time and safe outcome while preserving the returned value', async () => {
  const log = vi.spyOn(console, 'info').mockImplementation(() => {}), value = { private: 'private-payload' }, work = vi.fn(async () => value);
  expect(await traceClinicalRehearsalPhase(policy, 'sign_eligibility', work)).toBe(value); expect(work).toHaveBeenCalledOnce();
  expect(log).toHaveBeenCalledTimes(1);
  const record = log.mock.calls[0][1]; expect(record).toMatchObject({ phase: 'sign_eligibility', outcome: 'ok', code: null });
  expect(Object.keys(record).sort()).toEqual(['code', 'durationMs', 'outcome', 'phase']); expect(Number.isSafeInteger(record.durationMs)).toBe(true);
  expect(record.durationMs).toBeGreaterThanOrEqual(0); expect(JSON.stringify(log.mock.calls)).not.toContain('private-payload');
});
it('rethrows the exact failure, logs only an allowed code and never logs provider messages or payloads', async () => {
  const log = vi.spyOn(console, 'info').mockImplementation(() => {});
  for (const error of [new PrivateFlowError('signature_request_expired'), new PrivateFlowError('private-token@example.test'), Error('private provider payload')]) {
    await expect(traceClinicalRehearsalPhase(policy, 'sign_validation', async () => { throw error; })).rejects.toBe(error);
  }
  expect(log.mock.calls.map(call => call[1].code)).toEqual(['signature_request_expired', 'clinical_service_unavailable', 'clinical_service_unavailable']);
  expect(JSON.stringify(log.mock.calls)).not.toContain('private-token'); expect(JSON.stringify(log.mock.calls)).not.toContain('provider payload');
});
it('does not log ordinary write modes or unknown phases and diagnostic failures cannot change the result', async () => {
  const log = vi.spyOn(console, 'info').mockImplementation(() => {});
  await traceClinicalRehearsalPhase(null, 'prepare_chain', async () => 1);
  await traceClinicalRehearsalPhase({ mode: 'patient_demo' } as ClinicalCreateOncePolicy, 'prepare_chain', async () => 1);
  await traceClinicalRehearsalPhase(policy, 'private-untrusted-phase' as any, async () => 1);
  expect(log).not.toHaveBeenCalled(); log.mockImplementation(() => { throw Error('console unavailable'); });
  expect(await traceClinicalRehearsalPhase(policy, 'sign_save', async () => 2)).toBe(2);
});
