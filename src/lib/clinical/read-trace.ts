/** Fixed diagnostic vocabulary only; no identity, request, response or error data. */
export type ClinicalReadPhase = 'read' | 'token' | 'fetch' | 'headers' | 'body' | 'ingress' | 'auth' | 'bind' | 'work' |
  'final_auth' | 'final_bind' | 'respond' | 'target' | 'ops' | 'index' | 'head' | 'document' | 'receipt' | 'prescription' | 'finalcontext';
export type ClinicalReadOutcome = 'start' | 'ok' | 'error' | 'timeout' | 'aborted';
export type ClinicalReadTrace = (phase: ClinicalReadPhase, outcome: ClinicalReadOutcome) => void;
export const CLINICAL_READ_DIAGNOSTICS_HEADER = 'x-trustleaf-clinical-read-diagnostics';
const phases = new Set<ClinicalReadPhase>(['read','token','fetch','headers','body','ingress','auth','bind','work',
  'final_auth','final_bind','respond','target','ops','index','head','document','receipt','prescription','finalcontext']);
const outcomes = new Set<ClinicalReadOutcome>(['start','ok','error','timeout','aborted']);
export const isClinicalReadPath = (path: string) => ['/api/private-clinical-history','/api/private-clinical-history/prescriptions','/api/private-clinical-history/document'].includes(path);
export const isLoopbackHost = (host: string) => ['localhost','127.0.0.1','[::1]','::1'].includes(host);
export function createClinicalReadTrace(side: 'client' | 'server') {
  const started = performance.now(); let active = true;
  const trace: ClinicalReadTrace = (phase, outcome) => {
    if (!active || !['client','server'].includes(side) || !phases.has(phase) || !outcomes.has(outcome)) return;
    const elapsed = performance.now() - started;
    const elapsedMs = Number.isFinite(elapsed) ? Math.max(0, Math.min(86_400_000, Math.round(elapsed))) : 0;
    try { console.info('[clinical-read-diagnostics]', { side, phase, elapsedMs, outcome }); }
    catch { /* Observability never changes access, delivery or a deadline. */ }
  };
  return { trace, close: () => { active = false; } };
}
export function emitClinicalReadTrace(trace: ClinicalReadTrace | undefined, phase: ClinicalReadPhase, outcome: ClinicalReadOutcome) {
  if (!trace || !phases.has(phase) || !outcomes.has(outcome)) return;
  try { trace(phase, outcome); } catch { /* A diagnostic callback cannot affect the request. */ }
}
export async function clinicalReadStage<T>(trace: ClinicalReadTrace | undefined, phase: ClinicalReadPhase, work: () => Promise<T>): Promise<T> {
  emitClinicalReadTrace(trace, phase, 'start');
  try { const result = await work(); emitClinicalReadTrace(trace, phase, 'ok'); return result; }
  catch (error) { emitClinicalReadTrace(trace, phase, 'error'); throw error; }
}
