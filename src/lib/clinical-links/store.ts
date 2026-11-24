import { randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { hashApiKey } from '@/lib/auth/api-key';
import { CLINICAL_ID } from '@/lib/clinical/config';
import { getDb, getDbConnection, sqlForConnection, type Sql } from '@/lib/db';
import { privatePrivyAppId } from '@/lib/private-config';
import { ClinicalLinksApiError, getClinicalLinksPilotPartnerOrigin, isClinicalPartnerOrigin } from './config';
import { requireConfirmedPartnerPrescription } from './prescription-mint';
import type { ClinicalAssociationStatus, ClinicalLinkEvent, ClinicalPartnerScope, ClinicalPatientAccount } from './types';

const CANNABIS = 'trustleaf-cannabis';
const CREDENTIAL_PREFIX = 'tl_clp_';
export type ClinicalPartner = { id: string; name: string; origin: string; privyAppClientId?: string | null };
export type BindingStatus = 'pending' | 'claimed' | 'active' | 'revoked' | 'expired';
export type ProofState = 'pending' | 'confirmed' | 'unavailable';
type DbDate = Date | string;
type BindingRow = { binding_id: string; status: Exclude<BindingStatus, 'expired'>; expires_at: DbDate;
  expired: boolean; partner_patient_ref: string | null; confirmation_hash: string | null; confirmation_attempts: number };
type EventRow = { event_id: string; link_ref: string; payload_hash: string; revision: number;
  result: 'applied' | 'stale'; received_at: DbDate };
type LinkRow = { link_ref: string; binding_id: string; clinical_status: 'active' | 'revoked';
  revision: number; document_revision: number; patient_user_id: string; partner_actor_ref: string };

export class PilotStoreError extends Error {
  constructor(public code: string, public status: number) { super(code); }
}

const iso = (date: DbDate) => new Date(date).toISOString();
const visibleBindingStatus = (row: BindingRow): BindingStatus => row.expired && row.status !== 'revoked' ? 'expired' : row.status;

type SharedBinding = BindingRow & {
  partner_actor_ref: string | null;
  shared_identity: boolean;
  shared_granted_at: DbDate | null;
  stale_after_revocation: boolean;
};

async function transaction<T>(run: (sql: Sql) => Promise<T>): Promise<T> {
  const client = await getDbConnection();
  try {
    await client.query('BEGIN');
    const result = await run(sqlForConnection(client));
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function audit(sql: Sql, partnerId: string | null, actorType: 'patient' | 'partner', actorRef: string,
  operation: string, outcome: string) {
  await sql`INSERT INTO clinical_link_audit (partner_id, actor_type, actor_ref, operation, outcome)
    VALUES ((SELECT partner_id FROM clinical_link_partners WHERE partner_id = ${partnerId}),
      ${actorType}, ${actorRef}, ${operation}, ${outcome})`;
}

export function hasClinicalPartnerCredential(request: Request): boolean {
  return new RegExp(`^Bearer ${CREDENTIAL_PREFIX}`, 'i').test(request.headers.get('authorization') ?? '');
}

export async function authenticateClinicalPartner(request: Request, scope: ClinicalPartnerScope): Promise<ClinicalPartner> {
  const token = request.headers.get('authorization')?.match(/^Bearer (tl_clp_[0-9a-f]{64})$/i)?.[1];
  if (!token) throw new PilotStoreError('unauthorized', 401);
  const sql = getDb();
  const [partner] = await sql<ClinicalPartner & { allowed: boolean }>`
    SELECT p.partner_id AS id, p.name, p.origin, p.privy_app_client_id AS "privyAppClientId", ${scope} = ANY(c.scopes) AS allowed
    FROM clinical_link_partner_credentials c JOIN clinical_link_partners p USING (partner_id)
    WHERE c.key_hash = ${hashApiKey(token)} AND c.expires_at > now() AND c.revoked_at IS NULL AND p.active`;
  if (!partner) throw new PilotStoreError('unauthorized', 401);
  if (!partner.allowed || !isClinicalPartnerOrigin(partner.origin)) {
    await audit(sql, partner.id, 'partner', partner.id, scope, 'denied');
    throw new PilotStoreError('forbidden', 403);
  }
  return { id: partner.id, name: partner.name, origin: partner.origin, privyAppClientId: partner.privyAppClientId };
}

export async function enrollClinicalPatient(
  partner: ClinicalPartner,
  authorization: { userId: string; verifiedAtEpochSeconds: number },
  authorizePrescriptionLinks: boolean,
) {
  const { userId, verifiedAtEpochSeconds } = authorization;
  return transaction(async sql => {
    await sql`SELECT pg_advisory_xact_lock(hashtext(${`clinical-binding:${partner.id}:${userId}`}))`;
    const [currentPartner] = await sql`SELECT partner_id FROM clinical_link_partners WHERE partner_id = ${partner.id}
      AND active AND origin = ${partner.origin} AND privy_app_client_id = ${partner.privyAppClientId ?? null} FOR SHARE`;
    if (!currentPartner) throw new PilotStoreError('not_found', 404);
    const [binding] = await sql<SharedBinding>`SELECT b.*, b.expires_at <= now() AS expired,
        b.shared_revoked_at >= to_timestamp(${verifiedAtEpochSeconds}) AS stale_after_revocation
      FROM clinical_partner_bindings b
      WHERE b.partner_id = ${partner.id} AND b.patient_user_id = ${userId}
        AND (b.shared_identity OR b.partner_patient_ref IS NOT NULL)
      ORDER BY b.shared_identity DESC, (b.status = 'active' AND b.expires_at > now()) DESC, b.created_at DESC
      LIMIT 1 FOR UPDATE`;
    const active = binding?.status === 'active' && !binding.expired;
    const grant = authorizePrescriptionLinks && !active;
    if (grant && binding?.stale_after_revocation) throw new PilotStoreError('consent_session_refresh_required', 409);

    await sql`INSERT INTO clinical_link_patient_accounts (patient_user_id, patient_ref)
      VALUES (${userId}, ${randomUUID()}) ON CONFLICT (patient_user_id) DO NOTHING`;
    const bindingId = binding?.binding_id ?? randomUUID();
    const partnerPatientRef = binding?.partner_patient_ref ?? randomUUID();
    const actorRef = binding?.partner_actor_ref ?? hashApiKey(JSON.stringify([partner.id, userId]));
    const state = active || grant ? 'active' : 'revoked';
    if (!binding) {
      await sql`INSERT INTO clinical_partner_bindings (
        binding_id, partner_id, patient_user_id, partner_actor_ref, partner_patient_ref,
        status, expires_at, shared_identity, shared_granted_at
      ) VALUES (${bindingId}, ${partner.id}, ${userId}, ${actorRef}, ${partnerPatientRef},
        ${state}, CASE WHEN ${grant} THEN now() + interval '24 hours' ELSE now() END,
        true, CASE WHEN ${grant} THEN now() ELSE NULL END)`;
    } else if (!binding.shared_identity || grant) {
      await sql`UPDATE clinical_partner_bindings SET shared_identity = true, status = ${state},
        expires_at = CASE WHEN ${grant} THEN now() + interval '24 hours' ELSE expires_at END,
        shared_granted_at = CASE WHEN ${grant} THEN now()
          WHEN NOT shared_identity AND status = 'active' THEN created_at ELSE shared_granted_at END
        WHERE binding_id = ${bindingId}`;
    }
    await audit(sql, partner.id, 'patient', userId, 'patient.enroll', grant ? 'authorized' : 'registered');
    return {
      status: 'active' as const,
      partnerPatientRef: state === 'active' ? partnerPatientRef : null,
      associationStatus: state === 'active' ? 'active' as const : 'not_authorized' as const,
    };
  });
}

export async function readClinicalPatientAccount(patientUserId: string): Promise<ClinicalPatientAccount> {
  const sql = getDb();
  const [patient] = await sql<{ enrolled: boolean; has_record: boolean; has_wallet: boolean }>`SELECT
    EXISTS(SELECT 1 FROM clinical_link_patient_accounts WHERE patient_user_id = ${patientUserId}) AS enrolled,
    EXISTS(SELECT 1 FROM clinical_web_histories WHERE owner_user_id = ${patientUserId}
      AND contract_id = ${CLINICAL_ID} AND network = 'testnet') AS has_record,
    EXISTS(SELECT 1 FROM privy_stellar_wallet_bindings WHERE app_id = ${privatePrivyAppId()} AND user_id = ${patientUserId}) AS has_wallet`;
  const bindings = await sql<{
    partner_id: string; name: string; status: BindingRow['status']; expired: boolean; binding_id: string;
    shared_identity: boolean; shared_granted_at: DbDate | null;
  }>`SELECT DISTINCT ON (b.partner_id) b.partner_id, p.name, b.status, b.expires_at <= now() AS expired,
      b.binding_id, b.shared_identity, b.shared_granted_at
    FROM clinical_partner_bindings b JOIN clinical_link_partners p USING (partner_id)
    WHERE b.patient_user_id = ${patientUserId} AND p.active AND (b.shared_identity OR b.partner_patient_ref IS NOT NULL)
    ORDER BY b.partner_id, b.shared_identity DESC, (b.status = 'active' AND b.expires_at > now()) DESC, b.created_at DESC`;
  const sources = bindings.map(binding => {
    let associationStatus: ClinicalAssociationStatus = 'active';
    if (binding.shared_identity && !binding.shared_granted_at) associationStatus = 'not_authorized';
    else if (binding.status === 'revoked') associationStatus = 'revoked';
    else if (binding.expired) associationStatus = 'expired';
    return { partnerId: binding.partner_id, source: binding.name, bindingId: binding.binding_id, associationStatus };
  });
  return {
    accountStatus: patient?.enrolled || patient?.has_record || patient?.has_wallet ||
      sources.some(source => source.associationStatus === 'active') ? 'active' : 'not_enrolled',
    recordStatus: patient?.has_record ? 'ready' : 'not_created',
    hasNativeWallet: patient?.has_wallet === true,
    sources,
  };
}

export async function startClinicalBinding(patientUserId: string) {
  const origin = getClinicalLinksPilotPartnerOrigin();
  const result = await transaction(async sql => {
    const [partner] = await sql<{ partner_id: string }>`SELECT partner_id FROM clinical_link_partners
      WHERE partner_id = ${CANNABIS} AND active AND origin = ${origin} AND privy_app_client_id IS NULL`;
    if (!partner) throw new PilotStoreError('partner_unavailable', 503);
    await sql`SELECT pg_advisory_xact_lock(hashtext(${`clinical-binding:${CANNABIS}:${patientUserId}`}))`;
    const [active] = await sql`SELECT binding_id FROM clinical_partner_bindings
      WHERE partner_id = ${CANNABIS} AND patient_user_id = ${patientUserId} AND status = 'active' AND expires_at > now()`;
    if (active) {
      await audit(sql, CANNABIS, 'patient', patientUserId, 'binding.start', 'active_exists');
      return null;
    }
    await sql`UPDATE clinical_partner_bindings SET status = 'revoked', claim_code_hash = NULL, confirmation_hash = NULL
      WHERE partner_id = ${CANNABIS} AND patient_user_id = ${patientUserId} AND status IN ('pending','claimed','active')`;
    const bindingId = randomUUID();
    const code = randomBytes(32).toString('base64url');
    const [row] = await sql<{ expires_at: DbDate }>`INSERT INTO clinical_partner_bindings
      (binding_id, partner_id, patient_user_id, claim_code_hash, status, expires_at)
      VALUES (${bindingId}, ${CANNABIS}, ${patientUserId}, ${hashApiKey(code)}, 'pending', now() + interval '10 minutes')
      RETURNING expires_at`;
    await audit(sql, CANNABIS, 'patient', patientUserId, 'binding.start', 'allowed');
    return { bindingId, code, expiresAt: iso(row.expires_at) };
  });
  if (!result) throw new PilotStoreError('binding_already_active', 409);
  return result;
}

export async function claimClinicalBinding(partner: ClinicalPartner, code: string, actorRef: string) {
  const confirmationCode = randomInt(100_000_000).toString().padStart(8, '0');
  const result = await transaction(async sql => {
    const [row] = await sql<{ binding_id: string }>`SELECT binding_id FROM clinical_partner_bindings
      WHERE partner_id = ${partner.id} AND claim_code_hash = ${hashApiKey(code)}
        AND status = 'pending' AND expires_at > now() FOR UPDATE`;
    if (!row) {
      await audit(sql, partner.id, 'partner', actorRef, 'binding.claim', 'denied');
      return null;
    }
    const hash = hashApiKey(`${row.binding_id}:${confirmationCode}`);
    await sql`UPDATE clinical_partner_bindings SET status = 'claimed', claim_code_hash = NULL,
      partner_actor_ref = ${actorRef}, confirmation_hash = ${hash} WHERE binding_id = ${row.binding_id}`;
    await audit(sql, partner.id, 'partner', actorRef, 'binding.claim', 'allowed');
    return { bindingId: row.binding_id, confirmationCode };
  });
  if (!result) throw new PilotStoreError('not_found', 404);
  return result;
}

export async function getClinicalBinding(patientUserId: string) {
  const sql = getDb();
  const origin = getClinicalLinksPilotPartnerOrigin();
  const [row] = await sql<BindingRow & { name: string }>`SELECT b.*, b.expires_at <= now() AS expired, p.name
    FROM clinical_partner_bindings b JOIN clinical_link_partners p USING (partner_id)
    WHERE b.patient_user_id = ${patientUserId} AND b.partner_id = ${CANNABIS} AND p.active AND p.origin = ${origin}
    ORDER BY b.created_at DESC, b.binding_id DESC LIMIT 1`;
  return row ? { bindingId: row.binding_id, status: visibleBindingStatus(row), expiresAt: iso(row.expires_at), name: row.name } : null;
}

export async function confirmClinicalBinding(patientUserId: string, bindingId: string, confirmationCode: string) {
  const origin = getClinicalLinksPilotPartnerOrigin();
  const result = await transaction(async sql => {
    await sql`SELECT pg_advisory_xact_lock(hashtext(${`clinical-binding:${CANNABIS}:${patientUserId}`}))`;
    const [row] = await sql<BindingRow & { partner_actor_ref: string }>`SELECT b.*, b.expires_at <= now() AS expired
      FROM clinical_partner_bindings b JOIN clinical_link_partners p USING (partner_id)
      WHERE b.binding_id = ${bindingId} AND b.patient_user_id = ${patientUserId} AND b.partner_id = ${CANNABIS}
        AND p.active AND p.origin = ${origin} FOR UPDATE OF b`;
    if (!row || row.expired || row.status !== 'claimed' || !row.confirmation_hash) {
      await audit(sql, CANNABIS, 'patient', patientUserId, 'binding.confirm', 'denied');
      return null;
    }
    const expected = hashApiKey(`${bindingId}:${confirmationCode}`);
    if (!timingSafeEqual(Buffer.from(row.confirmation_hash, 'hex'), Buffer.from(expected, 'hex'))) {
      const attempts = row.confirmation_attempts + 1;
      await sql`UPDATE clinical_partner_bindings SET confirmation_attempts = ${attempts},
        status = CASE WHEN ${attempts} = 5 THEN 'revoked' ELSE status END,
        confirmation_hash = CASE WHEN ${attempts} = 5 THEN NULL ELSE confirmation_hash END WHERE binding_id = ${bindingId}`;
      await audit(sql, CANNABIS, 'patient', patientUserId, 'binding.confirm', 'denied');
      return null;
    }
    await sql`SELECT pg_advisory_xact_lock(hashtext(${`clinical-binding-actor:${CANNABIS}:${row.partner_actor_ref}`}))`;
    const [active] = await sql`SELECT binding_id FROM clinical_partner_bindings WHERE partner_id = ${CANNABIS}
      AND (partner_actor_ref = ${row.partner_actor_ref} OR patient_user_id = ${patientUserId}) AND status = 'active' AND expires_at > now()`;
    if (active) {
      await audit(sql, CANNABIS, 'patient', patientUserId, 'binding.confirm', 'active_exists');
      return null;
    }
    await sql`UPDATE clinical_partner_bindings SET status = 'revoked' WHERE partner_id = ${CANNABIS}
      AND (partner_actor_ref = ${row.partner_actor_ref} OR patient_user_id = ${patientUserId}) AND status = 'active' AND expires_at <= now()`;
    const [updated] = await sql<{ expires_at: DbDate }>`UPDATE clinical_partner_bindings
      SET status = 'active', partner_patient_ref = ${randomUUID()}, confirmation_hash = NULL, expires_at = now() + interval '24 hours'
      WHERE binding_id = ${bindingId} RETURNING expires_at`;
    await audit(sql, CANNABIS, 'patient', patientUserId, 'binding.confirm', 'allowed');
    return { bindingId, status: 'active' as const, expiresAt: iso(updated.expires_at) };
  });
  if (!result) throw new PilotStoreError('binding_not_confirmed', 409);
  return result;
}

export async function readClinicalBinding(partner: ClinicalPartner, bindingId: string, actorRef: string) {
  const sql = getDb();
  const [row] = await sql<BindingRow>`SELECT *, expires_at <= now() AS expired FROM clinical_partner_bindings
    WHERE partner_id = ${partner.id} AND binding_id = ${bindingId} AND partner_actor_ref = ${actorRef}`;
  const status = row && visibleBindingStatus(row);
  await audit(sql, partner.id, 'partner', actorRef, 'binding.read', row ? 'allowed' : 'denied');
  if (!row) throw new PilotStoreError('not_found', 404);
  return { status, expiresAt: iso(row.expires_at),
    ...(status === 'active' ? { partnerPatientRef: row.partner_patient_ref! } : {}) };
}

export async function revokeClinicalBinding(patientUserId: string, bindingId: string) {
  const result = await transaction(async sql => {
    const [row] = await sql<{ partner_id: string }>`UPDATE clinical_partner_bindings SET status = 'revoked',
      claim_code_hash = NULL, confirmation_hash = NULL,
      shared_revoked_at = CASE WHEN shared_identity AND status = 'active' THEN clock_timestamp() ELSE shared_revoked_at END
      WHERE binding_id = ${bindingId} AND patient_user_id = ${patientUserId} RETURNING partner_id`;
    if (!row) return null;
    await audit(sql, row.partner_id, 'patient', patientUserId, 'binding.revoke', 'allowed');
    return { bindingId, status: 'revoked' as const };
  });
  if (!result) throw new PilotStoreError('not_found', 404);
  return result;
}

function eventReceipt(row: EventRow) {
  return { eventId: row.event_id, linkRef: row.link_ref, revision: row.revision, result: row.result, receivedAt: iso(row.received_at) };
}

function eventDigest(event: ClinicalLinkEvent) {
  const commitment = event.eventType === 'clinical-link.issued' ? event.commitment : null;
  return hashApiKey(JSON.stringify([event.schemaVersion, event.eventId, event.eventType, event.partnerPatientRef,
    event.resourceRef, event.category, event.clinicalStatus, event.revision, event.occurredAt, event.documentRevision, commitment]));
}

export async function recordClinicalLinkEvent(partner: ClinicalPartner, event: ClinicalLinkEvent) {
  const payloadHash = eventDigest(event);
  try {
    return await transaction(async sql => {
      await sql`SELECT pg_advisory_xact_lock(hashtext(${`clinical-link-event:${partner.id}:${event.eventId}`}))`;
      const [binding] = await sql<{ binding_id: string; patient_user_id: string; partner_actor_ref: string; shared_identity: boolean }>`
        SELECT binding_id, patient_user_id, partner_actor_ref, shared_identity FROM clinical_partner_bindings WHERE partner_id = ${partner.id}
          AND partner_patient_ref = ${event.partnerPatientRef} AND status = 'active' AND expires_at > now() FOR UPDATE`;
      if (!binding) throw new PilotStoreError('not_found', 404);
      const [existing] = await sql<EventRow>`SELECT * FROM clinical_link_events
        WHERE partner_id = ${partner.id} AND event_id = ${event.eventId}`;
      if (existing) {
        if (existing.payload_hash !== payloadHash) throw new PilotStoreError('event_conflict', 409);
        await audit(sql, partner.id, 'partner', partner.id, 'event.write', 'replayed');
        return eventReceipt(existing);
      }
      if (partner.privyAppClientId && !binding.shared_identity) throw new PilotStoreError('not_found', 404);
      const mint = binding.shared_identity && event.eventType === 'clinical-link.issued'
        ? await requireConfirmedPartnerPrescription(sql, {
          partnerId: partner.id, patientUserId: binding.patient_user_id, partnerPatientRef: event.partnerPatientRef,
          documentId: event.resourceRef, version: event.documentRevision, commitment: event.commitment,
        })
        : null;
      await sql`SELECT pg_advisory_xact_lock(hashtext(${`clinical-link-resource:${partner.id}:${event.resourceRef}`}))`;
      const [current] = await sql<LinkRow>`SELECT l.*, b.patient_user_id, b.partner_actor_ref
        FROM clinical_partner_links l JOIN clinical_partner_bindings b USING (binding_id, partner_id)
        WHERE l.partner_id = ${partner.id} AND l.resource_ref = ${event.resourceRef}`;
      if (current && (current.patient_user_id !== binding.patient_user_id || current.partner_actor_ref !== binding.partner_actor_ref)) {
        throw new PilotStoreError('not_found', 404);
      }
      if (current && ((event.revision === current.revision &&
          (event.clinicalStatus !== current.clinical_status || event.documentRevision !== current.document_revision)) ||
          (event.revision > current.revision && (event.documentRevision < current.document_revision ||
            (current.clinical_status === 'revoked' && event.clinicalStatus === 'active' && event.documentRevision === current.document_revision))))) {
        throw new PilotStoreError('revision_conflict', 409);
      }

      const linkRef = current?.link_ref ?? randomUUID();
      const stale = !!current && event.revision <= current.revision;
      if (!current) {
        await sql`INSERT INTO clinical_partner_links (link_ref, partner_id, binding_id, resource_ref, category,
          clinical_status, revision, document_revision, occurred_at) VALUES (${linkRef}, ${partner.id}, ${binding.binding_id},
          ${event.resourceRef}, ${event.category}, ${event.clinicalStatus}, ${event.revision}, ${event.documentRevision}, ${event.occurredAt})`;
      } else if (!stale) {
        await sql`UPDATE clinical_partner_links SET binding_id = ${binding.binding_id}, clinical_status = ${event.clinicalStatus},
          revision = ${event.revision}, document_revision = ${event.documentRevision}, occurred_at = ${event.occurredAt}
          WHERE link_ref = ${linkRef}`;
      }
      if (event.eventType === 'clinical-link.issued' && (!stale || current.document_revision === event.documentRevision)) {
        const [anchor] = await sql<{ commitment: string; proof_source: 'anchor' | 'prescription' }>`SELECT commitment, proof_source FROM clinical_link_anchors
          WHERE link_ref = ${linkRef} AND document_revision = ${event.documentRevision}`;
        if (anchor && anchor.commitment !== event.commitment) throw new PilotStoreError('document_revision_conflict', 409);
        if (!anchor && (!stale || current.binding_id === binding.binding_id)) {
          const [queued] = mint
            ? await sql`INSERT INTO clinical_link_anchors (commitment, link_ref, document_revision, state,
                proof_source, prescription_rx_id, transaction_hash, confirmed_at)
                VALUES (${event.commitment}, ${linkRef}, ${event.documentRevision}, 'confirmed', 'prescription',
                  ${mint.rxId}, ${mint.transactionHash}, now()) ON CONFLICT (commitment) DO NOTHING RETURNING commitment`
            : await sql`INSERT INTO clinical_link_anchors (commitment, link_ref, document_revision)
                VALUES (${event.commitment}, ${linkRef}, ${event.documentRevision}) ON CONFLICT (commitment) DO NOTHING RETURNING commitment`;
          if (!queued) throw new PilotStoreError('document_commitment_conflict', 409);
        } else if (mint && anchor?.proof_source === 'anchor') {
          await sql`UPDATE clinical_link_anchors SET state = 'confirmed', transaction_xdr = NULL, proof_source = 'prescription',
            prescription_rx_id = ${mint.rxId}, transaction_hash = ${mint.transactionHash}, confirmed_at = now()
            WHERE link_ref = ${linkRef} AND document_revision = ${event.documentRevision}`;
        }
      }
      const [saved] = await sql<EventRow>`INSERT INTO clinical_link_events
        (partner_id, event_id, binding_id, payload_hash, link_ref, revision, result)
        VALUES (${partner.id}, ${event.eventId}, ${binding.binding_id}, ${payloadHash}, ${linkRef}, ${event.revision}, ${stale ? 'stale' : 'applied'})
        RETURNING *`;
      await audit(sql, partner.id, 'partner', partner.id, 'event.write', saved.result);
      return eventReceipt(saved);
    });
  } catch (error) {
    if (error instanceof PilotStoreError || error instanceof ClinicalLinksApiError) {
      await audit(getDb(), partner.id, 'partner', partner.id, 'event.write', error.message);
    }
    throw error;
  }
}

export async function readClinicalLinkEvent(partner: ClinicalPartner, eventId: string) {
  const sql = getDb();
  const [row] = await sql<EventRow>`SELECT e.* FROM clinical_link_events e
    JOIN clinical_partner_bindings b USING (binding_id, partner_id)
    WHERE e.partner_id = ${partner.id} AND e.event_id = ${eventId} AND b.status = 'active' AND b.expires_at > now()`;
  await audit(sql, partner.id, 'partner', partner.id, 'event.read', row ? 'allowed' : 'denied');
  if (!row) throw new PilotStoreError('not_found', 404);
  return eventReceipt(row);
}

export async function listClinicalLinks(patientUserId: string) {
  const sql = getDb();
  const rows = await sql<LinkRow & { name: string; origin: string; occurred_at: DbDate; category: 'cannabis.prescription';
    resource_ref: string; proof_state: ProofState; prescription_rx_id: string | null }>`SELECT l.*, p.name, p.origin,
      COALESCE(a.state, 'unavailable') AS proof_state, a.prescription_rx_id
    FROM clinical_partner_links l JOIN clinical_partner_bindings b USING (binding_id, partner_id)
    JOIN clinical_link_partners p USING (partner_id)
    LEFT JOIN clinical_link_anchors a ON a.link_ref = l.link_ref AND a.document_revision = l.document_revision
    WHERE b.patient_user_id = ${patientUserId} AND b.status = 'active' AND b.expires_at > now() AND p.active
    ORDER BY l.occurred_at DESC, l.link_ref`;
  await audit(sql, null, 'patient', patientUserId, 'links.list', 'allowed');
  return rows.filter(row => isClinicalPartnerOrigin(row.origin)).map(row => ({
    linkRef: row.link_ref, category: row.category, source: row.name, clinicalStatus: row.clinical_status,
    revision: row.revision, documentRevision: row.document_revision, occurredAt: iso(row.occurred_at), proofState: row.proof_state,
    ...(row.proof_state === 'confirmed' && row.prescription_rx_id ? { credentialId: row.prescription_rx_id } : {}),
    href: new URL(`/pilot/recetas/${encodeURIComponent(row.resource_ref)}`, row.origin).href,
  }));
}

export async function readClinicalLinkProof(actor: { patientUserId: string } | { partner: ClinicalPartner }, linkRef: string, revision: number) {
  const sql = getDb();
  const partnerId = 'partner' in actor ? actor.partner.id : null;
  const patientUserId = 'patientUserId' in actor ? actor.patientUserId : null;
  const [row] = await sql<{ state: ProofState | null; document_revision: number; commitment: string | null;
    transaction_hash: string | null; confirmed_at: DbDate | null; origin: string;
    proof_source: 'anchor' | 'prescription' | null }>`SELECT a.state, l.document_revision,
      a.commitment, a.transaction_hash, a.confirmed_at, a.proof_source, p.origin FROM clinical_partner_links l
    JOIN clinical_partner_bindings b USING (binding_id, partner_id)
    JOIN clinical_link_partners p USING (partner_id)
    LEFT JOIN clinical_link_anchors a ON a.link_ref = l.link_ref AND a.document_revision = ${revision}
    WHERE l.link_ref = ${linkRef} AND b.status = 'active' AND b.expires_at > now() AND p.active
      AND (b.patient_user_id = ${patientUserId} OR p.partner_id = ${partnerId})`;
  const allowed = !!row && isClinicalPartnerOrigin(row.origin) && (!!row.state || row.document_revision === revision);
  await audit(sql, partnerId, patientUserId ? 'patient' : 'partner', patientUserId ?? partnerId!,
    'proof.read', allowed ? 'allowed' : 'denied');
  if (!allowed) throw new PilotStoreError('not_found', 404);
  const confirmed = row.state === 'confirmed';
  return { linkRef, revision, state: row.state ?? 'unavailable', network: 'testnet' as const,
    proofSource: row.proof_source,
    commitment: confirmed ? row.commitment : null, transactionHash: confirmed ? row.transaction_hash : null,
    confirmedAt: confirmed && row.confirmed_at ? iso(row.confirmed_at) : null };
}
