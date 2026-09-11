import { randomUUID } from 'node:crypto';
import { getDbConnection, sqlForConnection, type Sql } from '@/lib/db';
import type { AuthedUser } from '@/lib/auth/privy-auth';
import { verifiedWallet, resolveDoctor } from '@/lib/doctor-authorizations';
import { assertPrivateEnvironment, assertPrivateWrites, PrivateFlowError, PRIVY_APP } from '@/lib/private-config';
import { encryptDossier, decryptDossier } from '../../scripts/lib/private-doctor-dossier.mjs';

export type DoctorOnboardingSource = 'application' | 'invitation';
export type DoctorOnboardingState = 'invited' | 'draft' | 'submitted' | 'changes_requested' |
  'rejected' | 'authorization_pending' | 'authorized' | 'expired' | 'revoked';
export interface DoctorOnboardingProfile { name: string; specialty: string; licenseNum: string; rut: string }
type Row = Record<string, unknown>;
type Owner = { userId: string; email: string; walletId: string; address: string };
export interface FrozenDoctorSubmission {
  id: string; onboardingId: string; revision: number; owner: Owner;
  profile: DoctorOnboardingProfile;
}
const PROFILE_LIMITS = { name: 160, specialty: 200, licenseNum: 80, rut: 30 } as const;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const normalizeEmail = (email: string) => email.trim().toLowerCase();
const fail = (code: string, status = 409): never => { throw new PrivateFlowError(code, status); };

export function cleanDoctorProfile(input: Record<string, unknown>, complete = true): DoctorOnboardingProfile {
  const profile: DoctorOnboardingProfile = { name: '', specialty: '', licenseNum: '', rut: '' };
  for (const key of Object.keys(PROFILE_LIMITS) as (keyof DoctorOnboardingProfile)[]) {
    if (input[key] !== undefined && typeof input[key] !== 'string') fail('invalid_doctor_profile', 400);
    profile[key] = typeof input[key] === 'string' ? input[key].trim() : '';
    if (profile[key].length > PROFILE_LIMITS[key]) fail('invalid_doctor_profile', 400);
    if (complete && !profile[key]) fail('incomplete_doctor_profile', 400);
  }
  return profile;
}
function key() {
  const value = process.env.TRUSTLEAF_DATA_KEY;
  if (!value || !/^[a-f0-9]{64}$/i.test(value)) return fail('private_storage_unavailable', 503);
  return value;
}
function context(kind: 'draft' | 'submission', id: string) {
  return JSON.stringify(['TrustLeaf/DoctorOnboarding/v1', 'testnet', PRIVY_APP, kind, id]);
}
function encryptProfile(profile: DoctorOnboardingProfile, kind: 'draft' | 'submission', id: string) {
  return encryptDossier({ schemaVersion: 1, profile }, key(), context(kind, id));
}
function decryptProfile(ciphertext: unknown, kind: 'draft' | 'submission', id: string) {
  try {
    const plain = decryptDossier<{ schemaVersion: number; profile: Record<string, unknown> }>(String(ciphertext), key(), context(kind, id));
    if (plain.schemaVersion !== 1) fail('onboarding_profile_integrity_error', 503);
    return cleanDoctorProfile(plain.profile, kind === 'submission');
  } catch { return fail('onboarding_profile_integrity_error', 503); }
}
async function identity(sql: Sql, actor: AuthedUser): Promise<Owner> {
  if (!actor.email) return fail('unauthorized', 401);
  const wallet = await verifiedWallet(sql, actor.userId, actor.email);
  return { userId: actor.userId, email: normalizeEmail(actor.email), walletId: wallet.walletId, address: wallet.address };
}
function assertOwner(row: Row, owner: Owner) {
  if (normalizeEmail(String(row.email)) !== owner.email || row.privy_user_id !== owner.userId ||
      row.wallet_id !== owner.walletId || row.wallet !== owner.address) fail('doctor_identity_mismatch', 403);
}
async function assertBinding(sql: Sql, owner: Owner) {
  const rows = await sql.query(`SELECT user_id FROM privy_stellar_wallet_bindings
    WHERE app_id=$1 AND user_id=$2 AND wallet_id=$3 AND address=$4 FOR SHARE`,
  [PRIVY_APP, owner.userId, owner.walletId, owner.address]);
  if (rows.length !== 1) fail('doctor_identity_mismatch', 403);
}
/** Every writer uses this normalized email lock, then doctor/onboarding row locks. */
export async function onboardingTransaction<T>(email: string, run: (sql: Sql) => Promise<T>): Promise<T> {
  assertPrivateWrites();
  const client = await getDbConnection();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`doctor-onboarding:${normalizeEmail(email)}`]);
    const result = await run(sqlForConnection(client));
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}
async function latest(sql: Sql, email: string, lock = false) {
  return (await sql.query<Row>(`SELECT * FROM doctor_onboarding_requests WHERE LOWER(email)=$1
    ORDER BY created_at DESC,id DESC LIMIT 1 ${lock ? 'FOR UPDATE' : ''}`, [normalizeEmail(email)]))[0];
}
async function doctorProfile(sql: Sql, email: string, lock = false) {
  const rows = await sql.query<Row>(`SELECT id,name,email,specialty,license_num,rut,status FROM doctors
    WHERE LOWER(email)=$1 ${lock ? 'FOR UPDATE' : ''}`, [normalizeEmail(email)]);
  if (rows.length > 1) fail('doctor_identity_ambiguous', 409);
  return rows[0];
}
async function event(sql: Sql, onboardingId: unknown, actor: AuthedUser, state: string, note: string | null = null) {
  await sql.query(`INSERT INTO doctor_onboarding_events(id,onboarding_id,actor_user_id,actor_email,state,note)
    VALUES($1,$2,$3,$4,$5,$6)`, [randomUUID(), onboardingId, actor.userId, actor.email, state, note]);
}
export async function readDoctorSubmission(sql: Sql, current: Row): Promise<FrozenDoctorSubmission> {
  if (!current.current_submission_id) return fail('onboarding_submission_missing');
  const [row] = await sql.query<Row>(`SELECT * FROM doctor_onboarding_submissions
    WHERE id=$1 AND onboarding_id=$2`, [current.current_submission_id, current.id]);
  if (!row || row.privy_user_id !== current.privy_user_id || row.wallet_id !== current.wallet_id ||
      row.wallet !== current.wallet || row.email !== current.email) return fail('onboarding_submission_mismatch', 409);
  return { id: String(row.id), onboardingId: String(row.onboarding_id), revision: Number(row.revision),
    owner: { userId: String(row.privy_user_id), email: String(row.email), walletId: String(row.wallet_id), address: String(row.wallet) },
    profile: decryptProfile(row.encrypted_profile, 'submission', String(row.id)) };
}
const submission = readDoctorSubmission;
async function publicView(sql: Sql, row: Row | undefined, doctor: Row | undefined) {
  if (!row) return null;
  let profile = cleanDoctorProfile({ name: doctor?.name, specialty: doctor?.specialty ?? '',
    licenseNum: doctor?.license_num ?? '', rut: doctor?.rut ?? '' }, false);
  let submitted: FrozenDoctorSubmission | null = null;
  if (row.current_submission_id) { submitted = await submission(sql, row); profile = submitted.profile; }
  if (['draft', 'changes_requested'].includes(String(row.state)) && row.encrypted_draft) {
    profile = decryptProfile(row.encrypted_draft, 'draft', String(row.id));
  }
  const expired = row.state === 'invited' && row.expires_at && new Date(String(row.expires_at)).getTime() <= Date.now();
  return { id: row.id, source: row.source, state: expired ? 'expired' : row.state, email: row.email,
    expiresAt: row.expires_at ?? null, submittedAt: row.submitted_at ?? null, reviewNote: row.review_note ?? null,
    authorizationRequestId: row.authorization_request_id ?? null, wallet: row.wallet ?? null, profile,
    submissionId: submitted?.id ?? null, revision: submitted?.revision ?? null };
}
export async function doctorOnboardingView(sql: Sql, actor: AuthedUser) {
  assertPrivateEnvironment();
  const owner = await identity(sql, actor), current = await latest(sql, owner.email), doctor = await doctorProfile(sql, owner.email);
  if (current?.privy_user_id) assertOwner(current, owner);
  return { wallet: owner.address, onboarding: await publicView(sql, current, doctor),
    profile: doctor ? { id: doctor.id, name: doctor.name, specialty: doctor.specialty, status: doctor.status } : null };
}
export async function acceptDoctorInvitation(sql: Sql, actor: AuthedUser) {
  const owner = await identity(sql, actor);
  await onboardingTransaction(owner.email, async tx => {
    await doctorProfile(tx, owner.email, true);
    const current = await latest(tx, owner.email, true);
    if (!current) return fail('invitation_not_found', 404);
    // Lost response/reload of the same acceptance cannot create another wallet or process.
    if (current.state !== 'invited') {
      assertOwner(current, owner);
      if (current.source === 'invitation' && current.accepted_at) return;
      return fail('invitation_not_acceptable');
    }
    const [valid] = await tx.query(`SELECT id FROM doctor_onboarding_requests WHERE id=$1 AND expires_at>NOW()`, [current.id]);
    if (!valid) return fail('invitation_expired');
    if (current.privy_user_id || current.wallet_id || current.wallet) return fail('doctor_identity_mismatch', 403);
    await assertBinding(tx, owner);
    await tx.query(`UPDATE doctor_onboarding_requests SET state='draft',privy_user_id=$2,wallet_id=$3,wallet=$4,
      accepted_at=NOW(),updated_at=NOW() WHERE id=$1`, [current.id, owner.userId, owner.walletId, owner.address]);
    await event(tx, current.id, actor, 'draft');
  });
  // There is deliberately no registry call or state=authorized reconciliation here.
  return doctorOnboardingView(sql, actor);
}
export async function saveDoctorApplication(sql: Sql, actor: AuthedUser, input: Record<string, unknown>, submit: boolean) {
  const values = cleanDoctorProfile(input, submit), owner = await identity(sql, actor);
  await onboardingTransaction(owner.email, async tx => {
    let doctor = await doctorProfile(tx, owner.email, true), current = await latest(tx, owner.email, true);
    if (!current) {
      if (doctor && doctor.status !== 'pending') return fail('doctor_already_registered');
      if (!doctor) {
        if (!values.name) return fail('incomplete_doctor_profile', 400);
        [doctor] = await tx.query<Row>(`INSERT INTO doctors(name,email,specialty,status)
          VALUES($1,$2,$3,'pending') RETURNING id,name,email,specialty,status`, [values.name, owner.email, values.specialty]);
      }
      if (!doctor) return fail('doctor_not_created', 503);
      [current] = await tx.query<Row>(`INSERT INTO doctor_onboarding_requests
        (id,doctor_id,source,email,state,privy_user_id,wallet_id,wallet)
        VALUES($1,$2,'application',$3,'draft',$4,$5,$6) RETURNING *`,
      [randomUUID(), doctor.id, owner.email, owner.userId, owner.walletId, owner.address]);
    }
    if (!current || !doctor) return fail('doctor_onboarding_unavailable', 503);
    if (current.state === 'invited') return fail('invitation_acceptance_required');
    assertOwner(current, owner);
    // A repeat of the same submitted profile is a read, never another revision.
    if (current.state === 'submitted' && submit && current.current_submission_id) {
      const previous = await submission(tx, current);
      if (JSON.stringify(previous.profile) === JSON.stringify(values)) return;
    }
    if (!['draft', 'changes_requested'].includes(String(current.state))) {
      return fail(current.state === 'rejected' ? 'application_rejected' : 'application_not_editable');
    }
    await assertBinding(tx, owner);
    const encrypted = encryptProfile(values, 'draft', String(current.id));
    let submissionId: string | null = null;
    if (submit) {
      submissionId = randomUUID();
      const [revision] = await tx.query<{ revision: number }>(`SELECT COALESCE(MAX(revision),0)+1 AS revision
        FROM doctor_onboarding_submissions WHERE onboarding_id=$1`, [current.id]);
      await tx.query(`INSERT INTO doctor_onboarding_submissions
        (id,onboarding_id,revision,privy_user_id,email,wallet_id,wallet,encrypted_profile)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [submissionId, current.id, Number(revision.revision), owner.userId,
        owner.email, owner.walletId, owner.address, encryptProfile(values, 'submission', submissionId)]);
      // Operational directory fields only. RUT/license remain in encrypted evidence.
      await tx.query(`UPDATE doctors SET name=$2,specialty=$3,updated_at=NOW() WHERE id=$1`, [doctor.id, values.name, values.specialty]);
    }
    const next = submit ? 'submitted' : String(current.state);
    await tx.query(`UPDATE doctor_onboarding_requests SET state=$2,encrypted_draft=$3,
      current_submission_id=COALESCE($4::uuid,current_submission_id),
      submitted_at=CASE WHEN $2='submitted' THEN NOW() ELSE submitted_at END,updated_at=NOW() WHERE id=$1`,
    [current.id, next, encrypted, submissionId]);
    await event(tx, current.id, actor, next);
  });
  return doctorOnboardingView(sql, actor);
}
export async function createDoctorInvitation(sql: Sql, actor: AuthedUser, input: Record<string, unknown>) {
  const email = typeof input.email === 'string' ? normalizeEmail(input.email) : '';
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const specialty = typeof input.specialty === 'string' ? input.specialty.trim() : '';
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !name || !specialty || name.length > 160 || specialty.length > 200) {
    return fail('invalid_doctor_invitation', 400);
  }
  return onboardingTransaction(email, async tx => {
    let doctor = await doctorProfile(tx, email, true);
    const current = await latest(tx, email, true);
    if (doctor && doctor.status !== 'pending') return fail('doctor_already_registered');
    if (current) {
      const [expired] = await tx.query<Row>(`UPDATE doctor_onboarding_requests SET state='expired',updated_at=NOW()
        WHERE id=$1 AND state='invited' AND expires_at<=NOW() RETURNING id`, [current.id]);
      if (!expired && current.state !== 'expired') return fail('doctor_onboarding_already_active');
      if (expired) await event(tx, current.id, actor, 'expired');
    }
    if (!doctor) {
      [doctor] = await tx.query<Row>(`INSERT INTO doctors(name,email,specialty,status)
        VALUES($1,$2,$3,'pending') RETURNING id,name,email,specialty,status`, [name, email, specialty]);
    }
    if (!doctor) return fail('doctor_not_created', 503);
    const [created] = await tx.query<Row>(`INSERT INTO doctor_onboarding_requests
      (id,doctor_id,source,email,state,invited_by,invited_email,expires_at,encrypted_draft)
      VALUES($1,$2,'invitation',$3,'invited',$4,$5,NOW()+INTERVAL '7 days',NULL) RETURNING *`,
    [randomUUID(), doctor.id, email, actor.userId, actor.email]);
    if (!created) return fail('doctor_invitation_not_created', 503);
    await tx.query(`UPDATE doctors SET name=$2,specialty=$3,updated_at=NOW() WHERE id=$1`, [doctor.id, name, specialty]);
    doctor = { ...doctor, name, specialty };
    await event(tx, created.id, actor, 'invited');
    return { doctor, onboarding: await publicView(tx, created, doctor) };
  });
}
export async function reviewDoctorOnboarding(sql: Sql, actor: AuthedUser, id: string, action: string, note: string, expectedSubmissionId: string) {
  if (!UUID.test(id) || !UUID.test(expectedSubmissionId) || note.length > 500 ||
      !['request_changes', 'reject', 'reopen'].includes(action) || (action !== 'reopen' && !note.trim())) return fail('invalid_onboarding_review', 400);
  const [hint] = await sql.query<Row>('SELECT email FROM doctor_onboarding_requests WHERE id=$1', [id]);
  if (!hint) return fail('onboarding_not_found', 404);
  return onboardingTransaction(String(hint.email), async tx => {
    const doctor = await doctorProfile(tx, String(hint.email), true), current = await latest(tx, String(hint.email), true);
    if (!current || current.id !== id || current.current_submission_id !== expectedSubmissionId) return fail('onboarding_state_changed');
    const from = action === 'request_changes' ? ['submitted'] : action === 'reject' ? ['submitted', 'changes_requested'] : ['rejected'];
    const next = action === 'reject' ? 'rejected' : 'changes_requested';
    if (!from.includes(String(current.state))) return fail('onboarding_state_changed');
    await submission(tx, current);
    const [updated] = await tx.query<Row>(`UPDATE doctor_onboarding_requests SET state=$2,review_note=$3,
      reviewed_by=$4,reviewed_email=$5,updated_at=NOW() WHERE id=$1 RETURNING *`,
    [id, next, note.trim() || null, actor.userId, actor.email]);
    await event(tx, id, actor, next, note.trim() || null);
    return publicView(tx, updated, doctor);
  });
}
export async function onboardingForDoctor(sql: Sql, doctorId: number) {
  const [doctor] = await sql.query<Row>('SELECT id,name,email,specialty,license_num,rut,status FROM doctors WHERE id=$1', [doctorId]);
  if (!doctor) return fail('doctor_not_found', 404);
  return publicView(sql, await latest(sql, String(doctor.email)), doctor);
}
export async function listDoctorOnboarding(sql: Sql) {
  const rows = await sql.query<Row>(`SELECT d.id,d.name,d.email,d.specialty,d.status,o.id AS onboarding_id,
    o.source,o.state AS onboarding_state,o.expires_at,o.submitted_at,o.review_note,o.wallet,o.current_submission_id
    FROM doctors d LEFT JOIN LATERAL (SELECT * FROM doctor_onboarding_requests r
      WHERE r.doctor_id=d.id ORDER BY r.created_at DESC,r.id DESC LIMIT 1) o ON TRUE ORDER BY d.id DESC`);
  return rows.map(row => ({ id: row.id, name: row.name, email: row.email, specialty: row.specialty, status: row.status,
    onboarding: row.onboarding_id ? { id: row.onboarding_id, source: row.source,
      state: row.onboarding_state === 'invited' && row.expires_at && new Date(String(row.expires_at)).getTime() <= Date.now() ? 'expired' : row.onboarding_state,
      expiresAt: row.expires_at ?? null, submittedAt: row.submitted_at ?? null, reviewNote: row.review_note ?? null,
      submissionId: row.current_submission_id ?? null, wallet: row.wallet ?? null } : null }));
}
/** Local approval is separate from chain validity; callers must require both for writes. */
export async function isDoctorLocallyApproved(sql: Sql, doctorId: number, owner: Owner): Promise<boolean> {
  const [row] = await sql.query<Row>(`SELECT d.status,o.id AS onboarding_id,o.state,o.privy_user_id,o.wallet_id,o.wallet,
    o.authorization_request_id,r.state AS request_state,r.transaction_hash,
    r.onboarding_submission_id,o.current_submission_id
    FROM doctors d LEFT JOIN LATERAL (SELECT * FROM doctor_onboarding_requests x WHERE x.doctor_id=d.id
      ORDER BY x.created_at DESC,x.id DESC LIMIT 1) o ON TRUE
    LEFT JOIN doctor_authorization_requests r ON r.id=o.authorization_request_id
    WHERE d.id=$1 AND LOWER(d.email)=$2`, [doctorId, owner.email]);
  if (!row || row.status !== 'active') return false;
  if (!row.onboarding_id) return true; // Existing approved profile, never a pending self-application.
  return row.state === 'authorized' && row.privy_user_id === owner.userId && row.wallet_id === owner.walletId &&
    row.wallet === owner.address && row.request_state === 'confirmed' && !!row.transaction_hash &&
    !!row.current_submission_id && row.onboarding_submission_id === row.current_submission_id;
}
/** Supply authorization preparation as a callback to keep its insert/link/state change atomic. */
export async function approveDoctorOnboarding<T extends { request: { id: unknown } | null }>(
  sql: Sql, actor: AuthedUser, doctorId: number, expectedSubmissionId: string,
  prepare: (tx: Sql, submission: FrozenDoctorSubmission) => Promise<T>,
): Promise<T> {
  if (!UUID.test(expectedSubmissionId)) return fail('onboarding_submission_required', 400);
  const resolved = await resolveDoctor(sql, doctorId);
  const owner: Owner = { userId: resolved.userId, email: normalizeEmail(String(resolved.doctor.email)), walletId: resolved.walletId, address: resolved.address };
  return onboardingTransaction(owner.email, async tx => {
    const doctor = await doctorProfile(tx, owner.email, true), current = await latest(tx, owner.email, true);
    if (!doctor || Number(doctor.id) !== doctorId || !current || Number(current.doctor_id) !== doctorId ||
        current.current_submission_id !== expectedSubmissionId || !['submitted', 'authorization_pending'].includes(String(current.state))) {
      return fail('onboarding_state_changed');
    }
    assertOwner(current, owner);
    await assertBinding(tx, owner);
    const frozen = await submission(tx, current);
    const result = await prepare(tx, frozen);
    if (!result.request?.id) return fail('authorization_not_created', 503);
    // The request must have been prepared from this exact frozen submission inside the callback.
    const [request] = await tx.query<Row>(`SELECT id,state,prepared_xdr,transaction_hash FROM doctor_authorization_requests
      WHERE id=$1 AND doctor_id=$2 AND doctor_user_id=$3 AND doctor_email=$4 AND wallet_id=$5 AND wallet=$6
        AND onboarding_submission_id=$7 FOR UPDATE`,
    [result.request.id, doctorId, owner.userId, owner.email, owner.walletId, owner.address, frozen.id]);
    if (!request || !['pending', 'submitted'].includes(String(request.state))) return fail('authorization_submission_mismatch');
    if (current.authorization_request_id && current.authorization_request_id !== request.id) {
      const [previous] = await tx.query<Row>(`SELECT id FROM doctor_authorization_requests
        WHERE id=$1 AND state='failed' AND prepared_xdr IS NULL AND transaction_hash IS NULL
          AND (lease_until IS NULL OR lease_until<NOW()) FOR UPDATE`, [current.authorization_request_id]);
      if (!previous || request.prepared_xdr || request.transaction_hash || request.state !== 'pending') return fail('failed_authorization_requires_reconciliation');
    }
    await tx.query(`UPDATE doctor_onboarding_requests SET state='authorization_pending',authorization_request_id=$2,
      reviewed_by=$3,reviewed_email=$4,updated_at=NOW() WHERE id=$1`, [current.id, request.id, actor.userId, actor.email]);
    if (current.authorization_request_id !== request.id) await event(tx, current.id, actor, 'authorization_pending');
    return result;
  });
}
