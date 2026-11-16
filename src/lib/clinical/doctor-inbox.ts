import 'server-only';
import { createHash } from 'node:crypto';
import { StrKey } from '@stellar/stellar-sdk';
import type { AuthedUser } from '@/lib/auth/privy-auth';
import { getDb } from '@/lib/db';
import { isDoctorLocallyApproved } from '@/lib/doctor-onboarding';
import { PrivateFlowError, PRIVY_APP } from '@/lib/private-config';
import { appointmentStartedByDoctorSql } from '@/lib/prescription-booking';
import type { ClinicalActor, DoctorClinicalInbox, DoctorClinicalNotification, DoctorClinicalRecordAccess } from '@/types/clinical';
import { createClinicalWebChain, deriveClinicalHistoryId } from './chain';
import { CLINICAL_ID } from './config';
import { clinicalDoctorIdentity } from './doctor-context';

const notificationLimit = 24;
const maxGrantReaders = 4;
const denied = () => new PrivateFlowError('clinical_context_unavailable', 404);

interface GrantObservation {
  observation: 'record' | 'notification';
  receipt_hash: string;
  history_id: string;
  patient_wallet: string;
  patient_label: string | null;
  active_appointment_ids: number[] | null;
  can_read: boolean;
  can_append: boolean;
  expected_revision: number | string;
  confirmed_at: string | Date;
  kind: DoctorClinicalNotification['kind'] | null;
}

function safePatientLabel(value: string | null) {
  const label = value?.normalize('NFC').trim().replace(/ +/g, ' ') ?? '';
  return /^\p{L}[\p{L}\p{M} .'-]{0,79}$/u.test(label) ? label : null;
}

/** Use revision order to find the current confirmed action. A duplicate at the
 * latest revision remains ambiguous and never reveals an older active grant. */
async function inboxObservations(doctorId: number, actor: ClinicalActor) {
  return getDb().query<GrantObservation>(`WITH confirmed AS (
    SELECT o.id,o.transaction_hash AS receipt_hash,o.confirmed_at,h.history_id,h.owner_user_id,h.wallet_id,h.patient_wallet,
      (o.expected->>'expectedRevision')::bigint AS expected_revision,
      (o.expected->>'canRead')::boolean AS can_read,(o.expected->>'canAppend')::boolean AS can_append
    FROM clinical_web_operations o
    JOIN clinical_web_histories h ON h.history_id=o.expected->>'historyId' AND h.network=o.network
      AND h.contract_id=o.contract_id AND h.owner_user_id=o.actor_user_id AND h.wallet_id=o.wallet_id
      AND h.patient_wallet=o.source_wallet AND h.patient_wallet=o.expected->>'patient'
    JOIN privy_stellar_wallet_bindings b ON b.app_id=$5 AND b.user_id=h.owner_user_id
      AND b.wallet_id=h.wallet_id AND b.address=h.patient_wallet
    WHERE o.network='testnet' AND o.contract_id=$6 AND o.action='set_permissions' AND o.method='set_permissions'
      AND o.state='confirmed' AND o.confirmed_at IS NOT NULL AND o.transaction_hash IS NOT NULL AND o.signed_xdr IS NOT NULL
      AND o.expected->'doctorId'=to_jsonb($1::integer) AND o.expected->>'doctor'=$2 AND h.patient_wallet<>$2
  ), counted AS (
    SELECT confirmed.*,
      COUNT(*) OVER (PARTITION BY history_id,expected_revision) AS peers
    FROM confirmed
  ), revised AS (
    SELECT counted.*,
      ROW_NUMBER() OVER (PARTITION BY history_id ORDER BY expected_revision DESC,confirmed_at DESC,id DESC) AS current_rank,
      LAG(expected_revision) OVER revision_order AS prior_revision,
      LAG(peers) OVER revision_order AS prior_peers,
      LAG(can_read OR can_append) OVER revision_order AS prior_access
    FROM counted
    WINDOW revision_order AS (PARTITION BY history_id ORDER BY expected_revision,confirmed_at,id)
  ), recent AS (
    SELECT * FROM revised WHERE peers=1 ORDER BY confirmed_at DESC,id DESC LIMIT $7
  )
  SELECT 'record' AS observation,r.id,r.receipt_hash,r.history_id,r.patient_wallet,visits.patient_name AS patient_label,
    r.can_read,r.can_append,r.expected_revision,r.confirmed_at,NULL::text AS kind,visits.active_appointment_ids
  FROM revised r
  LEFT JOIN LATERAL (
    WITH paired AS NOT MATERIALIZED (
      SELECT a.id,a.date,a.patient_name,a.status,a.completed_at,a.attendance_at,a.attendance_user_id,
        a.patient_user_id,a.started_at,a.started_by,a.doctor_user_id
      FROM appointments a WHERE a.doctor_id=$1 AND a.doctor_wallet=$2
        AND a.doctor_user_id=$3 AND a.doctor_wallet_id=$4
        AND a.patient_user_id=r.owner_user_id AND a.patient_wallet_id=r.wallet_id AND a.patient_wallet=r.patient_wallet
    )
    SELECT (SELECT patient_name FROM paired ORDER BY date DESC,id DESC LIMIT 1) AS patient_name,
      ARRAY(SELECT a.id FROM paired a
        WHERE a.status='in_progress' AND a.completed_at IS NULL AND (${appointmentStartedByDoctorSql})
          AND a.date=(a.started_at AT TIME ZONE 'America/Santiago')::date
        ORDER BY a.id) AS active_appointment_ids
  ) visits ON TRUE
  WHERE r.current_rank=1 AND r.peers=1 AND (r.can_read OR r.can_append)
  UNION ALL
  SELECT 'notification',id,receipt_hash,history_id,patient_wallet,NULL,can_read,can_append,expected_revision,confirmed_at,
    CASE
      WHEN NOT (can_read OR can_append) THEN 'access_withdrawn'
      WHEN expected_revision=0 OR (prior_revision=expected_revision-1 AND prior_peers=1 AND NOT prior_access) THEN 'access_granted'
      ELSE 'access_changed'
    END,NULL::integer[]
  FROM recent
  ORDER BY confirmed_at DESC,id DESC`, [doctorId, actor.address, actor.userId, actor.walletId, PRIVY_APP, CLINICAL_ID, notificationLimit]);
}

async function currentInboxRecords(candidates: GrantObservation[], actor: ClinicalActor, primary: ReturnType<typeof createClinicalWebChain>,
  signal?: AbortSignal) {
  const visible = new Map<string, DoctorClinicalRecordAccess>();
  let nextIndex = 0;
  let failed = false;
  await Promise.all(Array.from({ length: Math.min(maxGrantReaders, candidates.length) }, async (_, index) => {
    // Monotonic RPC observations are sequential within each pinned reader.
    const chain = index === 0 ? primary : createClinicalWebChain();
    while (!failed && nextIndex < candidates.length) {
      signal?.throwIfAborted();
      const row = candidates[nextIndex++];
      if (!StrKey.isValidEd25519PublicKey(row.patient_wallet) || deriveClinicalHistoryId(row.patient_wallet) !== row.history_id) continue;
      let grant;
      try { grant = await chain.grant(row.history_id, actor.address); }
      catch (error) {
        failed = true;
        throw error;
      }
      if (!grant || (!grant.canRead && !grant.canAppend) || grant.revision !== Number(row.expected_revision) + 1 ||
          grant.canRead !== row.can_read || grant.canAppend !== row.can_append) continue;
      const ids = (row.active_appointment_ids ?? []).filter(id => Number.isInteger(id) && id > 0 && id <= 2_147_483_647);
      visible.set(row.history_id, { historyId: row.history_id, patientLabel: safePatientLabel(row.patient_label),
        canRead: grant.canRead, canAppend: grant.canAppend, activeAppointmentIds: [...new Set(ids)].sort((a, b) => a - b) });
    }
  }));
  return visible;
}

export async function clinicalDoctorInbox(user: AuthedUser, actor: ClinicalActor, signal?: AbortSignal): Promise<DoctorClinicalInbox> {
  signal?.throwIfAborted();
  const email = user.email?.toLowerCase();
  if (!email) throw denied();
  const chain = createClinicalWebChain();
  const [identity, registry] = await Promise.allSettled([
    clinicalDoctorIdentity(user, actor, true), chain.doctorAuthorized(actor.address),
  ]);
  signal?.throwIfAborted();
  if (identity.status === 'rejected') throw identity.reason;
  if (registry.status === 'rejected') throw registry.reason;
  if (!registry.value) throw denied();
  const { doctorId } = identity.value;
  const observations = await inboxObservations(doctorId, actor);
  signal?.throwIfAborted();
  const candidates = observations.filter(row => row.observation === 'record');
  const visible = await currentInboxRecords(candidates, actor, chain, signal);
  signal?.throwIfAborted();
  const records = candidates.flatMap(row => {
    const record = visible.get(row.history_id);
    return record ? [record] : [];
  });
  const notifications = observations.flatMap((row): DoctorClinicalNotification[] => {
    if (row.observation !== 'notification' || !row.kind) return [];
    const record = row.kind === 'access_withdrawn' ? undefined : visible.get(row.history_id);
    const id = createHash('sha256').update('doctor-clinical-inbox-v1:' + actor.address + ':' + row.receipt_hash).digest('hex');
    return [{ id, kind: row.kind, at: new Date(row.confirmed_at).toISOString(),
      historyId: record?.historyId ?? null, patientLabel: record?.patientLabel ?? null,
      canRead: record ? row.can_read : false, canAppend: record ? row.can_append : false }];
  });
  // Approval and registry can change during the grant reads. The route also
  // rechecks the exact Privy identity, email and existing wallet before sending.
  const [approved, authorized] = await Promise.all([
    isDoctorLocallyApproved(getDb(), doctorId, { ...actor, email }), chain.doctorAuthorized(actor.address),
  ]);
  signal?.throwIfAborted();
  if (!approved || !authorized) throw denied();
  return { records, notifications };
}
