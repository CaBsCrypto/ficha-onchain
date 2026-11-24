import { ClinicalLinksApiError } from './config';
import type { ClinicalLinkEvent } from './types';

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const opaqueRef = /^[A-Za-z0-9_-]{16,64}$/;
const hex32 = /^[a-f0-9]{64}$/;
const utcTimestamp = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/;
const maxBodySize = 4096;

function invalid(): never { throw new ClinicalLinksApiError('invalid_request', 400); }

export async function pilotBody(request: Request) {
  if (request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') invalid();
  const reader = request.body?.getReader();
  if (!reader) invalid();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let raw = '';
  let size = 0;
  let parsed: unknown;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBodySize) {
        await reader.cancel();
        throw new ClinicalLinksApiError('request_too_large', 413);
      }
      raw += decoder.decode(value, { stream: true });
    }
    parsed = JSON.parse(raw + decoder.decode());
  } catch (error) {
    if (error instanceof ClinicalLinksApiError) throw error;
    invalid();
  } finally {
    reader.releaseLock();
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) invalid();
  return parsed as Record<string, unknown>;
}

export function requireKeys(body: Record<string, unknown>, keys: string[]) {
  if (Object.keys(body).length !== keys.length || keys.some(key => !Object.hasOwn(body, key))) invalid();
}

export function requireText(value: unknown, pattern: RegExp) {
  if (typeof value !== 'string' || !pattern.test(value)) invalid();
  return value;
}

export function requireEventId(value: unknown) { return requireText(value, uuid); }
export function requireBindingId(value: unknown) { return requireText(value, uuid); }
export function requireLinkRef(value: unknown) { return requireText(value, uuid); }
export function requireActorRef(value: unknown) { return requireText(value, hex32); }
export function requireBindingCode(value: unknown) { return requireText(value, /^[A-Za-z0-9_-]{43}$/); }
export function requireConfirmationCode(value: unknown) { return requireText(value, /^\d{8}$/); }

export function requireRevision(value: unknown) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 2147483647) invalid();
  return value;
}

export function readRevision(request: Request) {
  const query = new URL(request.url).searchParams;
  const revisions = query.getAll('revision');
  if (revisions.length !== 1 || !/^[1-9]\d{0,9}$/.test(revisions[0])) invalid();
  return requireRevision(Number(revisions[0]));
}

export function parseClinicalLinkEvent(body: Record<string, unknown>): ClinicalLinkEvent {
  const issued = body.eventType === 'clinical-link.issued';
  if ((!issued && body.eventType !== 'clinical-link.revoked') || body.schemaVersion !== 1 || body.category !== 'cannabis.prescription') invalid();
  const keys = ['schemaVersion', 'eventId', 'eventType', 'partnerPatientRef', 'resourceRef', 'category', 'clinicalStatus', 'revision', 'occurredAt', 'documentRevision'];
  requireKeys(body, issued ? [...keys, 'commitment'] : keys);
  const date = requireText(body.occurredAt, utcTimestamp);
  const parsed = new Date(date);
  if (!Number.isFinite(parsed.valueOf()) || parsed.toISOString().slice(0, 19) !== date.slice(0, 19)) invalid();
  const event = {
    schemaVersion: 1 as const,
    eventId: requireEventId(body.eventId),
    partnerPatientRef: requireText(body.partnerPatientRef, uuid),
    resourceRef: requireText(body.resourceRef, opaqueRef),
    category: 'cannabis.prescription' as const,
    revision: requireRevision(body.revision),
    occurredAt: parsed.toISOString(),
    documentRevision: requireRevision(body.documentRevision),
  };
  if (issued && body.clinicalStatus === 'active' && event.documentRevision === event.revision) {
    return { ...event, eventType: 'clinical-link.issued', clinicalStatus: 'active', commitment: requireText(body.commitment, hex32) };
  }
  if (!issued && body.clinicalStatus === 'revoked' && event.documentRevision < event.revision) {
    return { ...event, eventType: 'clinical-link.revoked', clinicalStatus: 'revoked' };
  }
  return invalid();
}
