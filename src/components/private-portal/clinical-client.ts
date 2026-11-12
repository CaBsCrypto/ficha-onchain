'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSignRawHash } from '@privy-io/react-auth/extended-chains';
import { authedFetch } from '@/lib/auth/authed-fetch';
import { createClientClinicalReadTrace } from '@/lib/clinical/read-trace-client';
import { clinicalReadStage, emitClinicalReadTrace, type ClinicalReadTrace } from '@/lib/clinical/read-trace';
import { CLINICAL_PREPARE_CAPABILITY_HEADER, CLINICAL_PREPARE_CAPABILITY_VERSION } from '@/lib/clinical/client-contract';
import { QUOTE_MAX_AGE_SECONDS, CLINICAL_QUOTE_MAX_AGE_SECONDS } from '@/lib/sponsorship/quote-window';
import { jsonBody } from './client';
import { clinicalRehearsalLimitMessages, portalErrorMessage } from './errors';
import type { ClinicalOperation, ClinicalPrepareRequest, ClinicalSnapshot, ClinicalFile, ClinicalPrescriptionReference } from '@/types/clinical';

export type ClinicalIntent = Omit<ClinicalPrepareRequest, 'requestId'>;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const HASH = /^[a-f0-9]{64}$/i;
const actions = ['create_history', 'append_version', 'set_permissions'];
const states = ['awaiting_signature', 'submitted', 'confirmed', 'failed', 'cancelled'];
const messages: Record<string, string> = {
  ...clinicalRehearsalLimitMessages,
  clinical_client_update_required: 'La aplicación abierta está desactualizada. Conserva o recupera tu borrador y recarga la página antes de preparar una firma. No se creó ningún intento.',
  clinical_quote_expired: 'La cotización venció. Conservamos el borrador; consulta el intento antes de preparar otra publicación.',
  clinical_sponsorship_budget_exceeded: 'La publicación supera el presupuesto disponible. El borrador privado se conserva; no se pedirá otra firma.',
  clinical_sponsorship_unavailable: 'El patrocinio no está disponible. Puedes conservar tu borrador privado y volver a comprobar más tarde.',
  clinical_draft_conflict: 'El borrador cambió. Guarda o recupera su revisión actual antes de publicar.',
  clinical_draft_publication_pending: 'Este borrador ya está vinculado a una publicación. Consulta ese mismo intento.',
  signature_cancelled: 'Se canceló la confirmación de firma en Privy. Consulta el mismo intento antes de volver a revisar su confirmación.',
  clinical_signing_wallet_unavailable: 'Privy no encuentra tu wallet Stellar en esta sesión. Consulta el mismo intento y comprueba tu sesión antes de firmar.',
  clinical_signing_session_unavailable: 'Privy no pudo verificar tu sesión para firmar. Consulta el mismo intento y comprueba tu acceso a la cuenta.',
  clinical_signing_proxy_unavailable: 'Privy no pudo iniciar el componente de firma en este navegador. Consulta el mismo intento y comprueba el acceso a Privy.',
  clinical_signing_recovery_required: 'Privy requiere recuperar el acceso de firma de esta cuenta en este navegador. Consulta el mismo intento antes de continuar.',
  clinical_signing_verification_required: 'Privy no completó la verificación adicional de esta cuenta. Consulta el mismo intento antes de continuar.',
  clinical_signing_transport_unavailable: 'No pudimos conectar con el servicio de firma de Privy. Consulta el mismo intento antes de volver a revisar su confirmación.',
  clinical_signing_browser_unavailable: 'El navegador no pudo preparar las funciones que Privy necesita para firmar. Consulta el mismo intento antes de continuar.',
  clinical_signing_rate_limited: 'Privy limitó temporalmente las solicitudes de firma. Consulta el mismo intento antes de volver a revisar su confirmación.',
  clinical_signing_request_rejected: 'Privy no pudo validar esta solicitud de firma. Consulta el mismo intento antes de continuar.',
  clinical_signing_not_supported: 'Privy indicó que esta configuración no admite la solicitud de firma. Consulta el mismo intento antes de continuar.',
  clinical_signing_provider_failed: 'Privy informó un fallo de su servicio o componente de firma. Consulta el mismo intento antes de continuar.',
  clinical_signing_response_invalid: 'Privy no devolvió una respuesta de firma verificable. Consulta el mismo intento antes de continuar.',
  clinical_signing_failed: 'Privy no pudo completar la firma y no devolvió una causa reconocida. Consulta el mismo intento antes de continuar.',
  signature_request_expired: 'Venció el tiempo para firmar este intento. Consulta su estado; esta preparación no se renovará automáticamente.',
  owner_signature_invalid: 'No pudimos verificar la firma de esta cuenta. Consulta el mismo intento antes de continuar.',
  clinical_signing_unavailable: 'La firma de tu cuenta no está disponible. Vuelve a comprobar tu sesión antes de continuar.',
  clinical_service_unavailable: 'No pudimos completar la comprobación del intento. Consulta su estado antes de continuar.',
  clinical_rehearsal_scope_rejected: 'Este aporte o cambio no corresponde al ensayo autorizado. Revisa el paso previsto; no se preparará otra firma.',
  clinical_rehearsal_expired: 'La ventana del ensayo venció. Consulta el mismo intento pendiente; no prepares ni firmes otro.',
  clinical_rehearsal_order_conflict: 'Este paso aún no corresponde o ya se realizó. Consulta los recibos antes de continuar.',
  clinical_rehearsal_unavailable: 'No pudimos comprobar el alcance del ensayo. Las nuevas firmas permanecen bloqueadas.',
  clinical_context_unavailable: 'No pudimos comprobar el acceso a esta ficha. Revisa el código, tu autorización médica y el permiso del paciente.',
  clinical_access_denied: 'El acceso a esta ficha ya no está autorizado. No se mostrará el contenido anterior.',
  clinical_prescription_verification_unavailable: 'No pudimos comprobar el acceso y estado de la receta. Vuelve a consultar sin emitirla de nuevo.',
  clinical_doctor_unauthorized: 'Tu autorización médica no está vigente. No se mostrará la ficha ni se prepararán aportes.',
  clinical_permission_denied: 'El paciente no ha autorizado este acceso. Vuelve a comprobar los permisos con el paciente.',
  clinical_prescription_unavailable: 'No pudimos comprobar tu acceso a la receta vinculada. Su documento no se mostrará.',
  clinical_read_timeout: 'La consulta está tardando demasiado. Vuelve a consultar; no se preparará otra firma.',
  clinical_configuration_unavailable: 'El historial privado aún no está habilitado en este entorno de prueba.',
  clinical_account_funding_required: 'Tu cuenta de Testnet necesita preparación antes de crear el historial. Solicita revisar el acceso de prueba.',
  clinical_chain_unavailable: 'No pudimos comprobar el registro en Stellar. Vuelve a consultar sin preparar otra firma.',
  clinical_version_conflict: 'Existe una versión más reciente. Actualiza el historial antes de corregirla.',
  clinical_permission_conflict: 'Los permisos cambiaron. Actualiza antes de confirmar.',
  clinical_file_invalid: 'El archivo no es un PDF, PNG o JPEG válido, o su extensión no coincide. El máximo es 3.000.000 bytes.',
  clinical_file_processing_limit: 'El archivo supera los límites de validación: cinco segundos por archivo y 32 millones de píxeles para imágenes. No se modificó ni publicó.',
  clinical_file_validation_busy: 'La validación de archivos está ocupada. Conserva el archivo y vuelve a intentarlo.',
  clinical_request_invalid: 'Revisa los campos antes de preparar tu firma.',
  clinical_history_already_exists: 'Tu historial ya existe. Actualiza para abrirlo.',
  clinical_history_unavailable: 'No pudimos verificar el historial. No mostraremos su contenido hasta comprobarlo.',
  clinical_keys_unavailable: 'El almacenamiento privado no está disponible. Puedes volver a consultar.',
  clinical_wallet_changed: 'Tu cuenta Stellar cambió. El historial queda bloqueado hasta revisar su asociación.',
  clinical_patient_demo_quota_exceeded: 'Esta cuenta alcanzó el límite de operaciones de la demostración. Los documentos y recibos existentes siguen disponibles; consulta el mismo intento si quedó pendiente.',
  clinical_create_once_expired: 'La habilitación temporal para crear tu ficha venció. No necesitas volver a ingresar con Privy por este motivo. Solicita revisar esta misma prueba.',
  clinical_create_once_window_too_short: 'Ya no queda tiempo suficiente para preparar y firmar la creación. No vuelvas a firmar ni prepares otro intento; solicita revisar la ventana de esta prueba.',
  clinical_create_once_fee_exceeded: 'La operación supera el presupuesto o no cumple los límites de esta prueba. No se enviará; solicita revisar la preparación.',
};
const englishMessages: Record<string, string> = {
  network_unavailable: 'The connection is unavailable. Check your connection and try again.',
  clinical_context_unavailable: 'We could not verify access to this clinical record. Check the record code, your doctor authorization and the patient’s permissions.',
  clinical_access_denied: 'Access to this clinical record is no longer authorized. Its contents are hidden.',
  clinical_doctor_unauthorized: 'Your doctor authorization is inactive. You cannot view the clinical record or prepare entries.',
  clinical_permission_denied: 'The patient has not granted this access. Ask the patient to check their permissions.',
  clinical_history_unavailable: 'We could not verify the clinical record. Its contents stay hidden until verification succeeds.',
  clinical_prescription_unavailable: 'We could not verify access to the linked prescription. Its document is hidden.',
  clinical_prescription_verification_unavailable: 'We could not verify access to the prescription or check its status. Check again using the same prescription.',
  clinical_read_timeout: 'This check is taking too long. Try the status check again before preparing a signature.',
  clinical_configuration_unavailable: 'Private clinical records are unavailable in this test environment.',
  clinical_account_funding_required: 'Your Testnet account needs setup before you can create a clinical record.',
  clinical_chain_unavailable: 'We could not verify the record in Stellar. Check its status again before preparing a signature.',
  clinical_file_invalid: 'Choose a valid PDF, PNG or JPEG whose extension matches its contents. The maximum is 3,000,000 bytes.',
  clinical_file_processing_limit: 'The file exceeds the validation limits of five seconds per file and 32 million pixels per image. The file was left unchanged.',
  clinical_file_validation_busy: 'File validation is busy. Keep the file and try again.',
  clinical_history_already_exists: 'Your clinical record already exists. Refresh to open it.',
  clinical_create_once_expired: 'The window to create this clinical record has expired. Ask the administrator to review this attempt.',
  clinical_create_once_window_too_short: 'There is too little time to prepare and sign this operation. Ask the administrator to review the test window.',
  clinical_create_once_fee_exceeded: 'This operation exceeds the limits for this test. It will stay unsent.',
  clinical_version_conflict: 'A newer version already exists. Refresh the clinical record before correcting it.',
  clinical_permission_conflict: 'The permissions have changed. Refresh them before confirming.',
  clinical_quote_expired: 'The quote expired. Your draft is saved. Check this attempt before preparing a new one.',
  clinical_rehearsal_fee_exceeded: 'The fee exceeds the test limit. This operation will stay unsent.',
  clinical_rehearsal_budget_exceeded: 'The remaining test budget cannot cover this step and the funds reserved to revoke access. Check the same attempt if it already exists.',
  clinical_rehearsal_budget_unavailable: 'We could not verify the receipts and the remaining budget. Check the same attempt before continuing.',
  clinical_rehearsal_scope_rejected: 'This change falls outside the authorized test. Check the scheduled step before preparing a signature.',
  clinical_rehearsal_expired: 'The test window expired. Check the same pending attempt.',
  clinical_rehearsal_order_conflict: 'This step is out of order or has already been completed. Check the receipts.',
  clinical_sponsorship_unavailable: 'Sponsorship is unavailable. Keep your private draft and check again later.',
  clinical_sponsorship_budget_exceeded: 'This change exceeds the available budget. Your private draft is saved.',
  clinical_draft_conflict: 'The draft has changed. Save or recover the current revision before publishing.',
  clinical_draft_publication_pending: 'This draft already has a publication attempt. Check the same attempt.',
  private_writes_paused: 'Confirmations are temporarily disabled. You can still check existing attempts.',
  private_writes_disabled: 'Confirmations are temporarily disabled. You can still check existing attempts.',
  signature_cancelled: 'The Privy confirmation was cancelled. Check the same attempt before signing again.',
  signature_request_expired: 'The time to sign this attempt expired. Check its status before continuing.',
  owner_signature_invalid: 'We could not verify the signature for this account. Check the same attempt before continuing.',
  clinical_signing_unavailable: 'Signing is unavailable. Check your session before continuing.',
};

export class ClinicalClientError extends Error {
  constructor(public readonly status: number, public readonly code: string) {
    super(messages[code] ?? portalErrorMessage(code, status));
  }
}

type PortalLanguage = 'es' | 'en';

export function localizedClinicalError(error: unknown, language: PortalLanguage, fallback: string): string {
  if (language === 'es') return error instanceof Error ? error.message : fallback;
  if (!(error instanceof ClinicalClientError)) return fallback;
  if (error.status === 401) return 'Your session expired. Sign in again with Privy.';
  if (error.status === 403 && error.code === 'clinical_history_unavailable') return 'Access to this file is no longer authorized.';
  if (Object.hasOwn(englishMessages, error.code)) return englishMessages[error.code];
  if (error.status === 403) return 'Your account does not have permission for this action.';
  if (error.code.startsWith('clinical_signing_')) return 'Privy could not complete signing. Check the same attempt before continuing.';
  return fallback;
}

/** The SDK failure stays inside this boundary. Only exact installed SDK/EIP
 * markers are classified; messages, nested payloads, IDs and provider details
 * are never copied into client state, logs or API requests. */
export function clinicalPrivySigningError(error: unknown): ClinicalClientError {
  const read = (value: unknown, key: string): unknown => {
    try { return value !== null && (typeof value === 'object' || typeof value === 'function') ? (value as Record<string, unknown>)[key] : undefined; }
    catch { return undefined; }
  };
  const cause = read(error, 'cause');
  const candidates = [error, ...(cause !== undefined && cause !== error ? [cause] : [])];
  const markers = candidates.flatMap(value => ['code', 'privyErrorCode', 'type'].map(key => read(value, key)));
  const texts = candidates.map(value => read(value, 'message'));
  const has = (...allowed: unknown[]) => markers.some(value => allowed.includes(value));
  const says = (...allowed: string[]) => texts.some(value => typeof value === 'string' && allowed.includes(value));
  let code = 'clinical_signing_failed';
  if (has(4001, '4001', 'user_rejected', 'user_rejected_request', 'mfa_canceled') || candidates.some(value => read(value, 'type') === 'client_error' && read(value, 'message') === 'MFA canceled')) code = 'signature_cancelled';
  else if (has('embedded_wallet_not_found') || says('Wallet not found')) code = 'clinical_signing_wallet_unavailable';
  else if (has('must_be_authenticated', 'invalid_credentials', 'missing_or_invalid_token', 'unknown_auth_error') || says('User must be authenticated before signing', 'User must be authenticated', 'Must have valid access token.')) code = 'clinical_signing_session_unavailable';
  else if (says('Wallet proxy not initialized', 'Wallet proxy not initialized.', 'iframe not initialized', 'Failed to initialize embedded wallet proxy.', 'Failed to connect to wallet proxy')) code = 'clinical_signing_proxy_unavailable';
  else if (has('wallet_not_on_device', 'invalid_recovery_pin', 'embedded_wallet_password_unconfirmed')) code = 'clinical_signing_recovery_required';
  else if (has('mfa_timeout', 'missing_or_invalid_mfa', 'mfa_verification_max_attempts_reached', 'twilio_verification_failed', 'unknown_mfa_error')) code = 'clinical_signing_verification_required';
  else if (has('client_request_timeout', 'ERR_NETWORK', 'ECONNABORTED') || says('Failed to fetch', 'NetworkError when attempting to fetch resource.')) code = 'clinical_signing_transport_unavailable';
  else if (has('session_storage_unavailable', 'buffer_not_defined')) code = 'clinical_signing_browser_unavailable';
  else if (has('too_many_requests')) code = 'clinical_signing_rate_limited';
  else if (has('invalid_data', 'invalid_message', 'invalid_request_arguments', 'embedded_wallet_password_already_exists', 'embedded_wallet_recovery_already_exists')) code = 'clinical_signing_request_rejected';
  else if (has('unsupported_wallet_type', 'unsupported_chain_id', 'not_supported')) code = 'clinical_signing_not_supported';
  else if (says('Failed to sign')) code = 'clinical_signing_response_invalid';
  else if (has('unable_to_sign', 'unknown_connect_wallet_error', 'generic_connect_wallet_error', 'unknown_embedded_wallet_error', 'error')) code = 'clinical_signing_provider_failed';
  return new ClinicalClientError(400, code);
}

export interface ClinicalSignDiagnostic { phase: 'review' | 'privy' | 'delivery'; status: number; code: string }
const signDiagnosticCodes = new Set([...Object.keys(messages), 'unauthorized', 'forbidden', 'network_unavailable',
  'clinical_identity_changed', 'clinical_saved_intent_invalid', 'clinical_operation_not_found', 'clinical_operation_unavailable',
  'clinical_fee_budget_exceeded', 'clinical_confirmation_required', 'relayer_unavailable', 'private_writes_paused',
  'private_environment_mismatch', 'private_configuration_mismatch']);
/** Only fixed codes and a numeric status may leave the signature error boundary. */
export function clinicalSignDiagnostic(phase: ClinicalSignDiagnostic['phase'], error: unknown): Readonly<ClinicalSignDiagnostic> {
  const code = error instanceof ClinicalClientError && signDiagnosticCodes.has(error.code) ? error.code : 'clinical_service_unavailable';
  const status = error instanceof ClinicalClientError && Number.isSafeInteger(error.status) && (error.status === 0 || error.status >= 400 && error.status <= 599) ? error.status : 0;
  return Object.freeze({ phase, status, code });
}

export type ClinicalRehearsal = NonNullable<ClinicalSnapshot['rehearsal']>;
function assertRehearsal(plan: ClinicalRehearsal, now = Date.now()) {
  if (!UUID.test(plan.runId) || !Number.isSafeInteger(plan.until) || !Array.isArray(plan.steps) ||
      plan.steps.some(step => !step || !UUID.test(step.requestId) || !actions.includes(step.action)) ||
      new Set(plan.steps.map(step => step.requestId)).size !== plan.steps.length) throw new ClinicalClientError(409, 'clinical_rehearsal_scope_rejected');
  if (plan.until * 1000 <= now) throw new ClinicalClientError(409, 'clinical_rehearsal_expired');
}
/** A prepared rehearsal never invents a replacement UUID or silently chooses another step. */
export function clinicalRequestId(input: ClinicalIntent, plan?: ClinicalRehearsal, newId: () => string = () => crypto.randomUUID(), now = Date.now()) {
  if (!plan) return newId();
  assertRehearsal(plan, now);
  const matches = plan.steps.filter(step => {
    if (step.action !== input.action) return false;
    if (input.action === 'set_permissions') {
      // The one final cleanup intent may retire the grant after an early stop.
      const cleanup = step.expectedRevision === 6 && step.canRead === false && step.canAppend === false &&
        input.canRead === false && input.canAppend === false && [4, 5, 6].includes(input.expectedRevision ?? -1);
      return (step.expectedRevision === input.expectedRevision || cleanup) && step.canRead === input.canRead && step.canAppend === input.canAppend;
    }
    if (input.action === 'append_version') {
      if (!!input.note === !!input.file) return false;
      return (step.expectedVersion ?? 0) === (input.expectedVersion ?? 0) && step.entryId === input.entryId && step.kind === (input.note ? 'note' : 'file');
    }
    return true;
  });
  if (matches.length !== 1) throw new ClinicalClientError(409, 'clinical_rehearsal_scope_rejected');
  return matches[0].requestId;
}

export const CLINICAL_READ_TIMEOUT_MS = 90_000;
// The complete verified timeline crossed 180s in Testnet. Only this read gets
// five minutes; individual reads, quote expiry and mutation recovery stay separate.
export const CLINICAL_SNAPSHOT_READ_TIMEOUT_MS = 300_000;
/** Bound the complete read, including Privy's token and response body. Never
 * wrap signatures or mutation requests: an uncertain write keeps its intent. */
async function clinicalRead<T>(work: (signal: AbortSignal, trace?: ClinicalReadTrace) => Promise<T>, signal?: AbortSignal, path?: string,
  timeoutMs: typeof CLINICAL_READ_TIMEOUT_MS | typeof CLINICAL_SNAPSHOT_READ_TIMEOUT_MS = CLINICAL_READ_TIMEOUT_MS): Promise<T> {
  const controller = new AbortController();
  const diagnostic = path ? createClientClinicalReadTrace(path) : undefined;
  const trace = diagnostic?.trace;
  emitClinicalReadTrace(trace, 'read', 'start');
  let timer: ReturnType<typeof setTimeout>;
  let cancel: () => void = () => {};
  try {
    return await new Promise<T>((resolve, reject) => {
      cancel = () => { emitClinicalReadTrace(trace, 'read', 'aborted'); controller.abort(); reject(new DOMException('Consulta cancelada', 'AbortError')); };
      timer = setTimeout(() => {
        emitClinicalReadTrace(trace, 'read', 'timeout');
        reject(new ClinicalClientError(0, 'clinical_read_timeout'));
        controller.abort();
      }, timeoutMs);
      if (signal?.aborted) { cancel(); return; }
      signal?.addEventListener('abort', cancel, { once: true });
      Promise.resolve().then(() => { controller.signal.throwIfAborted(); return work(controller.signal, trace); }).then(
        result => { emitClinicalReadTrace(trace, 'read', 'ok'); resolve(result); },
        error => { emitClinicalReadTrace(trace, 'read', 'error'); reject(error); });
    });
  } finally { clearTimeout(timer!); signal?.removeEventListener('abort', cancel); diagnostic?.close(); }
}
/** Privy bearer stays in the existing adapter, never in URLs or browser storage. */
export async function clinicalApi<T>(path: string, init: RequestInit = {}, trace?: ClinicalReadTrace): Promise<T> {
  let response: Response;
  let request = init;
  if (path === '/api/private-clinical-operations' && init.method?.toUpperCase() === 'POST') {
    const headers = new Headers(init.headers);
    headers.set(CLINICAL_PREPARE_CAPABILITY_HEADER, CLINICAL_PREPARE_CAPABILITY_VERSION);
    request = { ...init, headers };
  }
  try { response = trace ? await authedFetch(path, { ...request, cache: 'no-store' }, trace) : await authedFetch(path, { ...request, cache: 'no-store' }); }
  catch { throw new ClinicalClientError(0, 'network_unavailable'); }
  const body = await clinicalReadStage(trace, 'body', () => response.json()).catch(() => null);
  if (!response.ok || !body) {
    const code = typeof body?.error === 'string' && /^[a-z0-9_]{1,80}$/.test(body.error) ? body.error : 'clinical_service_unavailable';
    throw new ClinicalClientError(response.ok ? 503 : response.status, code);
  }
  return body as T;
}
const keysExactly = (value: unknown, required: string[], optional: string[] = []): value is Record<string, any> =>
  !!value && typeof value === 'object' && !Array.isArray(value) && required.every(key => Object.hasOwn(value, key)) &&
  Object.keys(value).every(key => required.includes(key) || optional.includes(key));
const reviewWallet = (value: unknown): value is string => typeof value === 'string' && /^G[A-Z2-7]{55}$/.test(value);
function verifiedReview(value: unknown, op: ClinicalOperation): NonNullable<ClinicalOperation['review']> {
  const invalid = () => { throw new ClinicalClientError(503, 'clinical_operation_unavailable'); };
  if (!keysExactly(value, ['network','contractId','historyId','patient','author','operationId','content'], ['entryId','version']) ||
      value.network !== 'testnet' || typeof value.contractId !== 'string' || !/^C[A-Z2-7]{55}$/.test(value.contractId) ||
      typeof value.historyId !== 'string' || !HASH.test(value.historyId) || typeof value.operationId !== 'string' || !HASH.test(value.operationId) || !reviewWallet(value.patient) || !reviewWallet(value.author) ||
      op.state !== 'awaiting_signature' || op.signing && op.signing.address !== value.author) return invalid();
  const content = value.content;
  let checked: NonNullable<ClinicalOperation['review']>['content'];
  if (op.action === 'append_version') {
    if (typeof value.entryId !== 'string' || !HASH.test(value.entryId) || !Number.isSafeInteger(value.version) || value.version < 1 || value.version > 0xffff_ffff) return invalid();
    if (content?.kind === 'file') {
      if (!keysExactly(content, ['kind','fileName','mediaType','byteLength','sha256']) ||
          typeof content.fileName !== 'string' || !content.fileName.trim() || content.fileName.trim() !== content.fileName ||
          new TextEncoder().encode(content.fileName).length > 255 || /[\x00-\x1f\x7f/\\]/.test(content.fileName) || ['.','..'].includes(content.fileName) ||
          !['application/pdf','image/png','image/jpeg'].includes(content.mediaType) || !Number.isSafeInteger(content.byteLength) ||
          content.byteLength < 1 || content.byteLength > 3_000_000 || typeof content.sha256 !== 'string' || !HASH.test(content.sha256)) return invalid();
      checked = Object.freeze({ kind:'file', fileName:content.fileName, mediaType:content.mediaType, byteLength:content.byteLength, sha256:content.sha256 });
    } else if (content?.kind === 'note') {
      if (!keysExactly(content, ['kind','note']) || !keysExactly(content.note, ['title','text','eventDate'], ['prescriptionId'])) return invalid();
      const note = content.note;
      if (typeof note.title !== 'string' || !note.title.trim() || note.title.length > 120 ||
          typeof note.text !== 'string' || !note.text.trim() || note.text.length > 20_000 ||
          note.eventDate !== null && (typeof note.eventDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(note.eventDate) ||
          !Number.isFinite(Date.parse(note.eventDate)) || new Date(note.eventDate).toISOString().slice(0,10) !== note.eventDate) ||
          note.prescriptionId !== undefined && (typeof note.prescriptionId !== 'string' || !UUID.test(note.prescriptionId))) return invalid();
      checked = Object.freeze({ kind:'note', note:Object.freeze({ title:note.title, text:note.text, eventDate:note.eventDate,
        ...(note.prescriptionId === undefined ? {} : { prescriptionId:note.prescriptionId }) }) });
    } else return invalid();
  } else {
    if (value.entryId !== undefined || value.version !== undefined || value.author !== value.patient) return invalid();
    if (op.action === 'set_permissions') {
      if (!keysExactly(content, ['kind','doctor','canRead','canAppend','expectedRevision']) || content.kind !== 'permissions' ||
          !reviewWallet(content.doctor) || content.doctor === value.patient || typeof content.canRead !== 'boolean' || typeof content.canAppend !== 'boolean' ||
          !Number.isSafeInteger(content.expectedRevision) || content.expectedRevision < 0) return invalid();
      checked = Object.freeze({ kind:'permissions', doctor:content.doctor, canRead:content.canRead, canAppend:content.canAppend, expectedRevision:content.expectedRevision });
    } else {
      if (!keysExactly(content, ['kind']) || content.kind !== 'history') return invalid();
      checked = Object.freeze({ kind:'history' });
    }
  }
  return Object.freeze({ network:'testnet', contractId:value.contractId, historyId:value.historyId, patient:value.patient, author:value.author, operationId:value.operationId,
    ...(op.action === 'append_version' ? { entryId:value.entryId, version:value.version } : {}), content:checked });
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
  if (op.sponsorship && (!keysExactly(op.sponsorship, ['maxFeeStroops','quotePreparedAt','quoteExpiresAt'], ['quoteValidUntil']) ||
      op.state !== 'awaiting_signature' || !/^[1-9][0-9]{0,18}$/.test(op.sponsorship.maxFeeStroops) ||
      !Number.isSafeInteger(op.sponsorship.quotePreparedAt) || op.sponsorship.quotePreparedAt < 1 ||
      !Number.isSafeInteger(op.sponsorship.quoteExpiresAt) || op.sponsorship.quoteExpiresAt <= op.sponsorship.quotePreparedAt ||
      (op.sponsorship.quoteValidUntil === undefined
        ? op.sponsorship.quoteExpiresAt !== Math.min(op.sponsorship.quotePreparedAt + QUOTE_MAX_AGE_SECONDS, op.expiresAt)
        : !Number.isSafeInteger(op.sponsorship.quoteValidUntil) || op.sponsorship.quoteValidUntil !== op.sponsorship.quoteExpiresAt ||
          op.sponsorship.quoteValidUntil !== Math.min(op.sponsorship.quotePreparedAt + CLINICAL_QUOTE_MAX_AGE_SECONDS, op.expiresAt)))) throw new ClinicalClientError(503, 'clinical_operation_unavailable');
  const signing = op.signing;
  if (signing && (op.state !== 'awaiting_signature' || Object.keys(signing).sort().join(',') !== 'address,expiresAt,hash,network' ||
      !reviewWallet(signing.address) || !HASH.test(signing.hash) || signing.network !== 'testnet' || signing.expiresAt !== op.expiresAt)) {
    throw new ClinicalClientError(503, 'clinical_operation_unavailable');
  }
  const review = op.review === undefined ? undefined : verifiedReview(op.review, op);
  return Object.freeze({ id: op.id, action: op.action, state: op.state, expiresAt: op.expiresAt, transactionHash: op.transactionHash, errorCode: op.errorCode,
    ...(signing ? { signing: Object.freeze({ ...signing }) } : {}), ...(op.sponsorship ? { sponsorship: Object.freeze({ ...op.sponsorship }) } : {}), ...(review ? { review } : {}) });
}
export function clinicalSigningPayload(op: ClinicalOperation, address: string) {
  verifiedClinicalOperation(op);
  if (!op.signing || op.signing.address !== address || op.expiresAt*1000 <= Date.now()) throw new ClinicalClientError(400, 'signature_request_expired');
  if (!op.sponsorship || !op.review) throw new ClinicalClientError(503, 'clinical_operation_unavailable');
  if (op.sponsorship.quotePreparedAt * 1000 > Date.now() || op.sponsorship.quoteExpiresAt * 1000 <= Date.now()) throw new ClinicalClientError(409, 'clinical_quote_expired');
  return { address, chainType: 'stellar' as const, hash: ('0x'+op.signing.hash) as Parameters<ReturnType<typeof useSignRawHash>['signRawHash']>[0]['hash'] };
}
function mergeOperation(previous: ClinicalOperation | null, incoming: ClinicalOperation) {
  if (!previous) return incoming;
  verifiedClinicalOperation(incoming, previous);
  if ((previous.transactionHash && incoming.transactionHash !== previous.transactionHash) ||
      previous.expiresAt !== incoming.expiresAt || (previous.signing && incoming.signing &&
      (previous.signing.address !== incoming.signing.address || previous.signing.hash !== incoming.signing.hash || previous.signing.network !== incoming.signing.network)) ||
      (previous.state === 'submitted' && ['awaiting_signature', 'cancelled'].includes(incoming.state)) ||
      (['confirmed', 'failed', 'cancelled'].includes(previous.state) && incoming.state !== previous.state)) {
    throw new ClinicalClientError(503, 'clinical_operation_unavailable');
  }
  if (previous.sponsorship && incoming.sponsorship && JSON.stringify(previous.sponsorship) !== JSON.stringify(incoming.sponsorship) || previous.review && incoming.review && JSON.stringify(previous.review) !== JSON.stringify(incoming.review)) throw new ClinicalClientError(503, 'clinical_operation_unavailable');
  return incoming;
}
export interface ClinicalClientState {
  operation: ClinicalOperation | null; busy: boolean; uncertain: boolean; error: string; canSign: boolean; accessLost: boolean;
  signDiagnostic?: Readonly<ClinicalSignDiagnostic>;
}
const emptyState = (): ClinicalClientState => ({ operation: null, busy: false, uncertain: false, error: '', canSign: false, accessLost: false });
type Requester = <T>(path: string, init?: RequestInit) => Promise<T>;
type OwnerSigner = (payload: ReturnType<typeof clinicalSigningPayload>) => Promise<{ signature: string }>;

/** The exact pending intent lives only in memory; persisted attempts remain on the server. */
export class ClinicalOperationController {
  private state = emptyState();
  private pending: ClinicalPrepareRequest | null = null;
  private epoch = 0;
  private active = true;
  private inFlight: AbortController | null = null;
  constructor(private readonly request: Requester, private readonly publish: (state: ClinicalClientState) => void,
    private readonly newId: (input: ClinicalIntent) => string = () => crypto.randomUUID(), private readonly signer?: { address: string; sign: OwnerSigner },
    private readonly rehearsal?: () => ClinicalRehearsal | undefined,
    private readonly reportSignDiagnostic?: (diagnostic: Readonly<ClinicalSignDiagnostic>) => void,
    private readonly language: () => PortalLanguage = () => 'es') {}
  activate() { this.active = true; this.state = emptyState(); this.pending = null; this.emit(); }
  dispose() { this.active = false; this.epoch++; this.inFlight?.abort(); this.pending = null; this.state = emptyState(); }
  snapshot() {
    let canSign = this.state.canSign;
    const operation = this.state.operation;
    try { const plan = this.rehearsal?.(); if (plan) { assertRehearsal(plan); if (operation && !plan.steps.some(step => step.requestId === operation.id && step.action === operation.action)) canSign = false; } }
    catch { canSign = false; }
    if (operation?.state === 'awaiting_signature') { try { clinicalSigningPayload(operation, operation.signing?.address ?? ''); } catch { canSign = false; } }
    return { ...this.state, canSign };
  }
  refreshPolicy() { this.emit(); }
  private assertRehearsalIntent(operation?: Pick<ClinicalOperation, 'id' | 'action'>) {
    const plan = this.rehearsal?.(); if (!plan) return;
    assertRehearsal(plan);
    if (operation && !plan.steps.some(step => step.requestId === operation.id && step.action === operation.action)) throw new ClinicalClientError(409, 'clinical_rehearsal_scope_rejected');
  }
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
        const language = this.language();
        this.state = { ...this.state, uncertain: !definitive || preservePending && !!this.pending,
          error: localizedClinicalError(error, language, language === 'en' ? 'We could not verify the result. Check the same attempt before continuing.' : 'No pudimos comprobar el resultado.') };
        if (error instanceof ClinicalClientError && error.code === 'signature_request_expired') this.state.canSign = false;
        if (definitive && !preservePending && !this.state.operation) { this.pending = null; this.state.canSign = false; }
        if (error instanceof ClinicalClientError && (error.code === 'clinical_rehearsal_budget_unavailable' || error.status === 409 &&
            ['clinical_create_once_expired', 'clinical_create_once_window_too_short', 'clinical_create_once_fee_exceeded', 'clinical_rehearsal_expired', 'clinical_rehearsal_fee_exceeded', 'clinical_rehearsal_budget_exceeded', 'clinical_rehearsal_scope_rejected', 'clinical_rehearsal_order_conflict'].includes(error.code))) this.state.canSign = false;
        if (error instanceof ClinicalClientError && ([401, 403].includes(error.status) || error.status === 404 && error.code === 'clinical_context_unavailable')) { this.pending = null; this.state.operation = null; this.state.canSign = false; this.state.uncertain = false; this.state.accessLost = true; }
        this.emit();
      }
      throw error;
    } finally {
      if (this.active && epoch === this.epoch) { this.state.busy = false; this.inFlight = null; this.emit(); }
    }
  }
  async prepare(input: ClinicalIntent) {
    this.assertRehearsalIntent();
    if (this.state.busy || this.state.uncertain || this.state.operation && ['awaiting_signature', 'submitted'].includes(this.state.operation.state)) {
      throw new Error('Consulta o termina el intento anterior antes de preparar otro.');
    }
    this.pending = JSON.parse(JSON.stringify({ ...input, requestId: this.newId(input) })) as ClinicalPrepareRequest; this.state = emptyState(); this.state.canSign = true;
    return this.prepareSaved();
  }
  async prepareSaved() {
    if (!this.pending || this.state.operation && this.state.operation.state !== 'awaiting_signature') throw new Error('No hay una preparación pendiente para retomar.');
    const saved = this.pending;
    this.assertRehearsalIntent({ id: saved.requestId, action: saved.action });
    return this.perform(async signal => verifiedClinicalOperation((await this.request<{ operation: ClinicalOperation }>(
      '/api/private-clinical-operations', { ...jsonBody(saved), signal })).operation, { id: saved.requestId, action: saved.action }));
  }
  reopen(operation: ClinicalOperation) {
    if (this.state.busy || this.state.uncertain) return;
    const verified = verifiedClinicalOperation(operation);
    const same = this.state.operation?.id === verified.id;
    this.state = { operation: same ? mergeOperation(this.state.operation, verified) : verified, busy: false, uncertain: false, error: '',
      canSign: same ? this.state.canSign : !!verified.review && !!verified.sponsorship, accessLost: false };
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
    const signingEpoch = this.epoch;
    let phase: ClinicalSignDiagnostic['phase'] = 'review';
    try {
      const op = this.state.operation;
      this.assertRehearsalIntent(op ?? undefined);
      if (!op || op.state !== 'awaiting_signature' || this.state.uncertain || !this.state.canSign) throw new Error('Primero consulta el intento y revisa su contenido antes de firmar.');
      const epoch = this.epoch;
      if (!this.state.busy) this.state = { ...this.state, signDiagnostic: undefined };
      return await this.perform(async signal => {
        if (!this.signer) throw new ClinicalClientError(400, 'clinical_signing_unavailable');
        const payload = clinicalSigningPayload(op, this.signer.address);
        let signed;
        phase = 'privy';
        try { signed = await this.signer.sign(payload); }
        catch (failure) { throw clinicalPrivySigningError(failure); }
        phase = 'review';
        // A Privy prompt cannot be aborted by fetch's signal. Do not deliver a
        // late signature after leaving this identity, or after the intent expires.
        if (!this.active || epoch !== this.epoch || signal.aborted) throw new Error('La sesión cambió. No se enviará la firma anterior.');
        this.assertRehearsalIntent(op);
        clinicalSigningPayload(op, this.signer.address);
        if (!/^(?:0x)?[a-f0-9]{128}$/i.test(signed.signature)) throw new ClinicalClientError(400, 'owner_signature_invalid');
        phase = 'delivery';
        return verifiedClinicalOperation((await this.request<{ operation: ClinicalOperation }>(
          `/api/private-clinical-operations/${encodeURIComponent(op.id)}/sign`, { ...jsonBody({ confirmed: true, signature: signed.signature }), signal })).operation, op);
      });
    } catch (error) {
      const diagnostic = clinicalSignDiagnostic(phase, error);
      if (this.active && this.epoch === signingEpoch && !this.state.busy) { this.state = { ...this.state, signDiagnostic: diagnostic }; this.emit(); }
      try {
        this.reportSignDiagnostic?.(diagnostic);
        if (process.env.NODE_ENV === 'development') console.debug('[TrustLeaf clinical signature]', diagnostic);
      } catch { /* Diagnostics never change signature state or delivery. */ }
      throw error;
    }
  }
  async retry() {
    const op = this.state.operation;
    this.assertRehearsalIntent(op ?? undefined);
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
export function useClinicalOperation(identity: string, address: string, rehearsal?: ClinicalSnapshot['rehearsal'], language: PortalLanguage = 'es') {
  const { signRawHash } = useSignRawHash();
  const live = useRef({ identity, signRawHash, rehearsal, language });
  live.current = { identity, signRawHash, language, rehearsal: rehearsal ?? (live.current.identity === identity ? live.current.rehearsal : undefined) };
  const rehearsalUntil = live.current.rehearsal?.until;
  const [view, setView] = useState<{ identity: string; state: ClinicalClientState }>({ identity: '', state: emptyState() });
  const controller = useMemo(() => new ClinicalOperationController(clinicalApi, state => setView({ identity, state }), input => clinicalRequestId(input, live.current.rehearsal), { address, sign: async payload => {
    const signed = await live.current.signRawHash(payload);
    if (live.current.identity !== identity) throw new Error('La sesión cambió.');
    return signed;
  } }, () => live.current.identity === identity ? live.current.rehearsal : undefined, undefined, () => live.current.language), [identity, address]);
  useEffect(() => { controller.activate(); return () => controller.dispose(); }, [controller]);
  useEffect(() => {
    controller.refreshPolicy();
    if (rehearsalUntil === undefined) return;
    const timer = setTimeout(() => controller.refreshPolicy(), Math.max(0, Math.min(2_147_483_647, rehearsalUntil * 1000 - Date.now())));
    return () => clearTimeout(timer);
  }, [controller, rehearsalUntil]);
  const state = view.identity === identity && identity ? view.state : emptyState();
  const quoteUntil = state.operation?.state === 'awaiting_signature' ? state.operation.sponsorship?.quoteExpiresAt : undefined;
  useEffect(() => {
    if (quoteUntil === undefined) return;
    const timer = setTimeout(() => controller.refreshPolicy(), Math.max(0, Math.min(2_147_483_647, quoteUntil * 1000 - Date.now())));
    return () => clearTimeout(timer);
  }, [controller, quoteUntil]);
  useEffect(() => {
    if (state.operation?.state !== 'submitted' || state.busy) return;
    const timer = setTimeout(() => void controller.check().catch(() => {}), 2500);
    return () => clearTimeout(timer);
  }, [controller, state.operation?.id, state.operation?.state, state.busy]);
  return { ...state, controller };
}
export function useClinicalSnapshot(identity: string, historyId?: string, language: PortalLanguage = 'es') {
  const scope = historyId === undefined ? identity : `${identity}:history:${historyId}`;
  const languageRef = useRef(language);
  languageRef.current = language;
  const [view, setView] = useState<{ identity: string; data: ClinicalSnapshot | null; loading: boolean; error: string }>({ identity: '', data: null, loading: true, error: '' });
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => { setView({ identity: scope, data: null, loading: true, error: '' }); setRevision(n => n + 1); }, [scope]);
  useEffect(() => {
    if (!identity) { setView({ identity: scope, data: null, loading: false, error: '' }); return; }
    let alive = true; const abort = new AbortController();
    setView({ identity: scope, data: null, loading: true, error: '' });
    const path = clinicalHistoryPath(historyId);
    void clinicalRead((signal, trace) => clinicalApi<ClinicalSnapshot>(path, { signal }, trace), abort.signal, path, CLINICAL_SNAPSHOT_READ_TIMEOUT_MS).then(data => {
      if (!data || !Array.isArray(data.entries) || !Array.isArray(data.grants) || !Array.isArray(data.operations) || !Number.isFinite(Date.parse(data.verifiedAt))) throw new ClinicalClientError(503, 'clinical_history_unavailable');
      if (historyId !== undefined && (data.history?.id !== historyId || data.context?.role !== 'doctor' || typeof data.context.canRead !== 'boolean' || typeof data.context.canAppend !== 'boolean' || !Number.isSafeInteger(data.context.grantRevision) || !data.context.canRead && data.entries.length > 0)) throw new ClinicalClientError(503, 'clinical_history_unavailable');
      data.operations.forEach(op => verifiedClinicalOperation(op));
      if (alive) setView({ identity: scope, data, loading: false, error: '' });
    }).catch(error => {
      if (!alive) return;
      const locale = languageRef.current;
      setView({ identity: scope, data: null, loading: false, error: localizedClinicalError(error, locale, locale === 'en' ? 'We could not verify the clinical record.' : 'No pudimos verificar el historial.') });
    });
    return () => { alive = false; abort.abort(); };
  }, [identity, historyId, revision]);
  return { ...(view.identity === scope ? view : { identity: scope, data: null, loading: !!identity, error: '' }), refresh };
}
export function clinicalHistoryPath(historyId?: string, suffix = '') {
  if (historyId !== undefined && !HASH.test(historyId)) throw new ClinicalClientError(400, 'clinical_request_invalid');
  return `/api/private-clinical-history${suffix}${historyId === undefined ? '' : `?historyId=${encodeURIComponent(historyId)}`}`;
}
export async function readClinicalPrescriptions(historyId?: string, signal?: AbortSignal, prescriptionId?: string) {
  if (prescriptionId !== undefined && !UUID.test(prescriptionId)) throw new ClinicalClientError(400, 'clinical_request_invalid');
  const selectedId = prescriptionId?.toLowerCase();
  const base = clinicalHistoryPath(historyId, '/prescriptions');
  const path = selectedId === undefined ? base : `${base}${historyId === undefined ? '?' : '&'}prescriptionId=${encodeURIComponent(selectedId)}`;
  return clinicalRead(async (readSignal, trace) => {
    const result = await clinicalApi<{ prescriptions: ClinicalPrescriptionReference[] }>(path, { signal: readSignal }, trace);
    if (!Array.isArray(result.prescriptions) || (selectedId !== undefined &&
        (result.prescriptions.length > 1 || result.prescriptions.some(value => !value || value.id !== selectedId)))) {
      throw new ClinicalClientError(503, 'clinical_prescription_unavailable');
    }
    return result.prescriptions;
  }, signal, path);
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
export async function readClinicalDownload(entryId: string, version: number, signal: AbortSignal, historyId?: string): Promise<Blob> {
  if (!HASH.test(entryId) || !Number.isSafeInteger(version) || version < 1) throw new Error('No se pudo identificar el archivo.');
  const base = clinicalHistoryPath(historyId, '/document');
  const path = `${base}${historyId === undefined ? '?' : '&'}entryId=${entryId}&version=${version}`;
  return clinicalRead(async (readSignal, trace) => {
  let response: Response;
  try { response = trace ? await authedFetch(path, { cache: 'no-store', signal: readSignal }, trace) : await authedFetch(path, { cache: 'no-store', signal: readSignal }); }
  catch { throw new ClinicalClientError(0, 'network_unavailable'); }
  if (!response.ok) throw new ClinicalClientError(response.status, 'clinical_history_unavailable');
  const mediaType = response.headers.get('content-type')?.split(';')[0];
  if (!mediaType || !['application/pdf', 'image/png', 'image/jpeg'].includes(mediaType)) throw new Error('No se pudo verificar el formato del archivo.');
  const blob = await clinicalReadStage(trace, 'body', () => response.blob());
  if (readSignal.aborted) throw new DOMException('Descarga cancelada', 'AbortError');
  if (!blob.size || blob.size > CLINICAL_MAX_FILE_BYTES) throw new Error('No se pudo verificar el tamaño del archivo.');
  return blob;
  }, signal, path);
}
