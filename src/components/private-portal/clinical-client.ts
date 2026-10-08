'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { authedFetch } from '@/lib/auth/authed-fetch';
import { jsonBody } from './client';
import { portalErrorMessage } from './errors';
import type { ClinicalOperation, ClinicalPrepareRequest, ClinicalSnapshot, ClinicalFile } from '@/types/clinical';

export type ClinicalIntent = Omit<ClinicalPrepareRequest, 'requestId'>;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const HASH = /^[a-f0-9]{64}$/i;
const actions = ['create_history', 'append_version', 'set_permissions'];
const states = ['awaiting_signature', 'submitted', 'confirmed', 'failed', 'cancelled'];
const messages: Record<string, string> = {
  clinical_configuration_unavailable: 'El historial privado aún no está habilitado en este entorno de prueba.',
  clinical_account_funding_required: 'Tu cuenta de Testnet necesita preparación antes de crear el historial. Solicita revisar el acceso de prueba.',
  clinical_chain_unavailable: 'No pudimos comprobar el registro en Stellar. Vuelve a consultar sin preparar otra firma.',
  clinical_version_conflict: 'Existe una versión más reciente. Actualiza el historial antes de corregirla.',
  clinical_permission_conflict: 'Los permisos cambiaron. Actualiza antes de confirmar.',
  clinical_file_invalid: 'Revisa el formato y el tamaño del archivo. El máximo es 3 MB.',
  clinical_request_invalid: 'Revisa los campos antes de preparar tu firma.',
  clinical_history_already_exists: 'Tu historial ya existe. Actualiza para abrirlo.',
  clinical_history_unavailable: 'No pudimos verificar el historial. No mostraremos su contenido hasta comprobarlo.',
  clinical_keys_unavailable: 'El almacenamiento privado no está disponible. Puedes volver a consultar.',
  clinical_wallet_changed: 'Tu cuenta Stellar cambió. El historial queda bloqueado hasta revisar su asociación.',
};
export class ClinicalClientError extends Error {
  constructor(public readonly status: number, public readonly code: string) {
    super(messages[code] ?? portalErrorMessage(code, status));
  }
}
/** Privy bearer stays in the existing adapter, never in URLs or browser storage. */
export async function clinicalApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try { response = await authedFetch(path, { ...init, cache: 'no-store' }); }
  catch { throw new ClinicalClientError(0, 'network_unavailable'); }
  const body = await response.json().catch(() => null);
  if (!response.ok || !body) {
    const code = typeof body?.error === 'string' && /^[a-z0-9_]{1,80}$/.test(body.error) ? body.error : 'clinical_service_unavailable';
    throw new ClinicalClientError(response.ok ? 503 : response.status, code);
  }
  return body as T;
}
export function verifiedClinicalOperation(value: unknown, expected?: Pick<ClinicalOperation, 'id' | 'action'>): ClinicalOperation {
  const op = value as ClinicalOperation | null;
  if (!op || typeof op !== 'object' || !UUID.test(op.id) || !actions.includes(op.action) || !states.includes(op.state) ||
      !Number.isFinite(op.expiresAt) || op.expiresAt <= 0 ||
      (op.transactionHash !== null && (typeof op.transactionHash !== 'string' || !HASH.test(op.transactionHash))) ||
      (['submitted', 'confirmed'].includes(op.state) && !op.transactionHash) ||
      (op.errorCode !== null && (typeof op.errorCode !== 'string' || !/^[a-z0-9_]{1,80}$/.test(op.errorCode))) ||
      (expected && (op.id !== expected.id || op.action !== expected.action))) {
    throw new ClinicalClientError(503, 'clinical_operation_unavailable');
  }
  return Object.freeze({ id: op.id, action: op.action, state: op.state, expiresAt: op.expiresAt, transactionHash: op.transactionHash, errorCode: op.errorCode });
}
function mergeOperation(previous: ClinicalOperation | null, incoming: ClinicalOperation) {
  if (!previous) return incoming;
  verifiedClinicalOperation(incoming, previous);
  if ((previous.transactionHash && incoming.transactionHash !== previous.transactionHash) ||
      (previous.state === 'submitted' && ['awaiting_signature', 'cancelled'].includes(incoming.state)) ||
      (['confirmed', 'failed', 'cancelled'].includes(previous.state) && incoming.state !== previous.state)) {
    throw new ClinicalClientError(503, 'clinical_operation_unavailable');
  }
  return incoming;
}
export interface ClinicalClientState {
  operation: ClinicalOperation | null; busy: boolean; uncertain: boolean; error: string; canSign: boolean; accessLost: boolean;
}
const emptyState = (): ClinicalClientState => ({ operation: null, busy: false, uncertain: false, error: '', canSign: false, accessLost: false });
type Requester = <T>(path: string, init?: RequestInit) => Promise<T>;

/** The exact pending intent lives only in memory; persisted attempts remain on the server. */
export class ClinicalOperationController {
  private state = emptyState();
  private pending: ClinicalPrepareRequest | null = null;
  private epoch = 0;
  private active = true;
  private inFlight: AbortController | null = null;
  constructor(private readonly request: Requester, private readonly publish: (state: ClinicalClientState) => void,
    private readonly newId: () => string = () => crypto.randomUUID()) {}
  activate() { this.active = true; this.state = emptyState(); this.pending = null; this.emit(); }
  dispose() { this.active = false; this.epoch++; this.inFlight?.abort(); this.pending = null; this.state = emptyState(); }
  snapshot() { return { ...this.state }; }
  private emit() { if (this.active) this.publish(this.snapshot()); }
  private async perform(work: (signal: AbortSignal) => Promise<ClinicalOperation>, preservePending = false) {
    if (!this.active || this.state.busy) throw new Error('Espera el resultado de la consulta anterior.');
    const epoch = this.epoch;
    this.inFlight = new AbortController(); this.state = { ...this.state, busy: true, error: '' }; this.emit();
    try {
      const result = await work(this.inFlight.signal);
      if (!this.active || epoch !== this.epoch) throw new Error('La sesión cambió. No se mostrará el resultado anterior.');
      this.state = { ...this.state, operation: mergeOperation(this.state.operation, result), uncertain: false };
      if (['confirmed', 'failed', 'cancelled'].includes(result.state)) { this.pending = null; this.state.canSign = false; }
      this.emit(); return result;
    } catch (error) {
      if (this.active && epoch === this.epoch) {
        const definitive = error instanceof ClinicalClientError && [400, 401, 403, 404, 409, 410, 413, 422].includes(error.status);
        this.state = { ...this.state, uncertain: !definitive || preservePending && !!this.pending,
          error: error instanceof Error ? error.message : 'No pudimos comprobar el resultado.' };
        if (definitive && !preservePending && !this.state.operation) { this.pending = null; this.state.canSign = false; }
        if (error instanceof ClinicalClientError && [401, 403].includes(error.status)) { this.pending = null; this.state.operation = null; this.state.canSign = false; this.state.uncertain = false; this.state.accessLost = true; }
        this.emit();
      }
      throw error;
    } finally {
      if (this.active && epoch === this.epoch) { this.state.busy = false; this.inFlight = null; this.emit(); }
    }
  }
  async prepare(input: ClinicalIntent) {
    if (this.state.busy || this.state.uncertain || this.state.operation && ['awaiting_signature', 'submitted'].includes(this.state.operation.state)) {
      throw new Error('Consulta o termina el intento anterior antes de preparar otro.');
    }
    this.pending = JSON.parse(JSON.stringify({ ...input, requestId: this.newId() })) as ClinicalPrepareRequest; this.state = emptyState(); this.state.canSign = true;
    return this.prepareSaved();
  }
  async prepareSaved() {
    if (!this.pending || this.state.operation && this.state.operation.state !== 'awaiting_signature') throw new Error('No hay una preparación pendiente para retomar.');
    const saved = this.pending;
    return this.perform(async signal => verifiedClinicalOperation((await this.request<{ operation: ClinicalOperation }>(
      '/api/private-clinical-operations', { ...jsonBody(saved), signal })).operation, { id: saved.requestId, action: saved.action }));
  }
  reopen(operation: ClinicalOperation) {
    if (this.state.busy || this.state.uncertain) return;
    const verified = verifiedClinicalOperation(operation);
    const same = this.state.operation?.id === verified.id;
    this.state = { operation: same ? mergeOperation(this.state.operation, verified) : verified, busy: false, uncertain: false, error: '',
      canSign: same ? this.state.canSign : verified.action === 'create_history', accessLost: false };
    if (!same) this.pending = null;
    this.emit();
  }
  async check() {
    const expected = this.state.operation ?? (this.pending ? { id: this.pending.requestId, action: this.pending.action } : null);
    if (!expected) throw new Error('No hay un intento para consultar.');
    return this.perform(async signal => verifiedClinicalOperation((await this.request<{ operation: ClinicalOperation }>(
      `/api/private-clinical-operations/${encodeURIComponent(expected.id)}`, { signal })).operation, expected), true);
  }
  async sign() {
    const op = this.state.operation;
    if (!op || op.state !== 'awaiting_signature' || this.state.uncertain || !this.state.canSign) throw new Error('Primero consulta el intento y revisa su contenido antes de firmar.');
    return this.perform(async signal => verifiedClinicalOperation((await this.request<{ operation: ClinicalOperation }>(
      `/api/private-clinical-operations/${encodeURIComponent(op.id)}/sign`, { ...jsonBody({ confirmed: true }), signal })).operation, op));
  }
  async retry() {
    const op = this.state.operation;
    if (!op || op.state !== 'submitted' || this.state.uncertain) throw new Error('Consulta el resultado antes de reintentar el mismo envío.');
    return this.perform(async signal => verifiedClinicalOperation((await this.request<{ operation: ClinicalOperation }>(
      `/api/private-clinical-operations/${encodeURIComponent(op.id)}/retry`, { ...jsonBody({ confirmed: true }), signal })).operation, op));
  }
  async cancel() {
    const op = this.state.operation;
    if (!op || op.state !== 'awaiting_signature' || this.state.uncertain) throw new Error('Consulta el estado antes de cancelar.');
    return this.perform(async signal => verifiedClinicalOperation((await this.request<{ operation: ClinicalOperation }>(
      `/api/private-clinical-operations/${encodeURIComponent(op.id)}/cancel`, { ...jsonBody({ confirmed: true }), signal })).operation, op));
  }
}
export function useClinicalOperation(identity: string) {
  const [view, setView] = useState<{ identity: string; state: ClinicalClientState }>({ identity: '', state: emptyState() });
  const controller = useMemo(() => new ClinicalOperationController(clinicalApi, state => setView({ identity, state })), [identity]);
  useEffect(() => { controller.activate(); return () => controller.dispose(); }, [controller]);
  const state = view.identity === identity && identity ? view.state : emptyState();
  useEffect(() => {
    if (state.operation?.state !== 'submitted' || state.busy) return;
    const timer = setTimeout(() => void controller.check().catch(() => {}), 2500);
    return () => clearTimeout(timer);
  }, [controller, state.operation?.id, state.operation?.state, state.busy]);
  return { ...state, controller };
}
export function useClinicalSnapshot(identity: string) {
  const [view, setView] = useState<{ identity: string; data: ClinicalSnapshot | null; loading: boolean; error: string }>({ identity: '', data: null, loading: true, error: '' });
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => { setView({ identity, data: null, loading: true, error: '' }); setRevision(n => n + 1); }, [identity]);
  useEffect(() => {
    if (!identity) { setView({ identity, data: null, loading: false, error: '' }); return; }
    let alive = true; const abort = new AbortController();
    setView({ identity, data: null, loading: true, error: '' });
    void clinicalApi<ClinicalSnapshot>('/api/private-clinical-history', { signal: abort.signal }).then(data => {
      if (!data || !Array.isArray(data.entries) || !Array.isArray(data.grants) || !Array.isArray(data.operations) || !Number.isFinite(Date.parse(data.verifiedAt))) throw new ClinicalClientError(503, 'clinical_history_unavailable');
      data.operations.forEach(op => verifiedClinicalOperation(op));
      if (alive) setView({ identity, data, loading: false, error: '' });
    }).catch(error => { if (alive) setView({ identity, data: null, loading: false, error: error instanceof Error ? error.message : 'No pudimos verificar el historial.' }); });
    return () => { alive = false; abort.abort(); };
  }, [identity, revision]);
  return { ...(view.identity === identity ? view : { identity, data: null, loading: !!identity, error: '' }), refresh };
}
export const CLINICAL_MAX_FILE_BYTES = 3_000_000;
export function validateClinicalFile(file: Pick<File, 'name' | 'size' | 'type'>) {
  if (!['application/pdf', 'image/png', 'image/jpeg'].includes(file.type)) throw new Error('Selecciona un PDF, PNG o JPEG.');
  if (file.size < 1 || file.size > CLINICAL_MAX_FILE_BYTES) throw new Error('El archivo debe pesar como máximo 3 MB (3.000.000 bytes).');
  if (!file.name.trim() || new TextEncoder().encode(file.name).length > 255 || /[\x00-\x1f\x7f/\\]/.test(file.name) || ['.', '..'].includes(file.name)) throw new Error('El nombre del archivo no es válido.');
}
export async function readClinicalFile(file: File, signal?: AbortSignal): Promise<ClinicalFile> {
  validateClinicalFile(file);
  if (signal?.aborted) throw new DOMException('Carga cancelada', 'AbortError');
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (signal?.aborted) throw new DOMException('Carga cancelada', 'AbortError');
  if (bytes.byteLength !== file.size) throw new Error('No se pudo leer el archivo completo. Selecciónalo otra vez.');
  const ascii = (data: Uint8Array) => new TextDecoder('ascii').decode(data);
  const valid = file.type === 'application/pdf' ? /^%PDF-(1\.[0-7]|2\.0)(?:\r\n|\r|\n)/.test(ascii(bytes.slice(0, 12))) && /%%EOF\s*$/.test(ascii(bytes.slice(-1024))) :
    file.type === 'image/png' ? bytes.length >= 57 && new DataView(bytes.buffer).getUint32(8) === 13 && new DataView(bytes.buffer).getUint32(16) > 0 && new DataView(bytes.buffer).getUint32(20) > 0 && [...bytes.slice(0, 8)].join(',') === '137,80,78,71,13,10,26,10' && ascii(bytes.slice(12, 16)) === 'IHDR' && [...bytes.slice(-12)].join(',') === '0,0,0,0,73,69,78,68,174,66,96,130' :
    bytes.length >= 10 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 && bytes.at(-2) === 255 && bytes.at(-1) === 217;
  if (!valid) throw new Error('El contenido no coincide con el formato declarado o está incompleto.');
  let binary = '';
  for (let start = 0; start < bytes.length; start += 32768) binary += String.fromCharCode(...bytes.subarray(start, start + 32768));
  return { fileName: file.name.trim(), mediaType: file.type as ClinicalFile['mediaType'], base64: btoa(binary) };
}
export async function readClinicalDownload(entryId: string, version: number, signal: AbortSignal): Promise<Blob> {
  if (!HASH.test(entryId) || !Number.isSafeInteger(version) || version < 1) throw new Error('No se pudo identificar el archivo.');
  let response: Response;
  try { response = await authedFetch(`/api/private-clinical-history/document?entryId=${entryId}&version=${version}`, { cache: 'no-store', signal }); }
  catch { throw new ClinicalClientError(0, 'network_unavailable'); }
  if (!response.ok) throw new ClinicalClientError(response.status, 'clinical_history_unavailable');
  const mediaType = response.headers.get('content-type')?.split(';')[0];
  if (!mediaType || !['application/pdf', 'image/png', 'image/jpeg'].includes(mediaType)) throw new Error('No se pudo verificar el formato del archivo.');
  const blob = await response.blob();
  if (signal.aborted) throw new DOMException('Descarga cancelada', 'AbortError');
  if (!blob.size || blob.size > CLINICAL_MAX_FILE_BYTES) throw new Error('No se pudo verificar el tamaño del archivo.');
  return blob;
}
