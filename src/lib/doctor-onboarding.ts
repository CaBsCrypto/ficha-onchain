import { randomUUID } from 'node:crypto';
import type { Sql } from '@/lib/db';
import type { AuthedUser } from '@/lib/auth/privy-auth';
import { verifiedWallet } from '@/lib/doctor-authorizations';
import { assertPrivateWrites, PrivateFlowError } from '@/lib/private-config';

export type DoctorOnboardingSource = 'application' | 'invitation';
export type DoctorOnboardingState = 'invited' | 'draft' | 'submitted' | 'changes_requested' |
  'rejected' | 'authorization_pending' | 'authorized' | 'expired' | 'revoked';

type Row = Record<string, unknown>;
export interface DoctorOnboardingProfile {
  name: string;
  specialty: string;
  licenseNum: string;
  rut: string;
}

const ACTIVE = ['invited', 'draft', 'submitted', 'changes_requested', 'authorization_pending'];
const PROFILE_LIMITS = { name: 160, specialty: 200, licenseNum: 80, rut: 30 } as const;

function normalizeEmail(email: string) { return email.trim().toLowerCase(); }
function cleanProfile(input: Record<string, unknown>): DoctorOnboardingProfile {
  const profile = {
    name: typeof input.name === 'string' ? input.name.trim() : '',
    specialty: typeof input.specialty === 'string' ? input.specialty.trim() : '',
    licenseNum: typeof input.licenseNum === 'string' ? input.licenseNum.trim() : '',
    rut: typeof input.rut === 'string' ? input.rut.trim() : '',
  };
  for (const [key, limit] of Object.entries(PROFILE_LIMITS)) {
    if (profile[key as keyof DoctorOnboardingProfile].length > limit) throw new PrivateFlowError('invalid_doctor_profile', 400);
  }
  if (!profile.name || !profile.specialty || !profile.licenseNum || !profile.rut) throw new PrivateFlowError('incomplete_doctor_profile', 400);
  return profile;
}

function publicOnboarding(row: Row | undefined, profile?: Row | undefined) {
  if (!row) return null;
  const expiresAt = row.expires_at ? new Date(String(row.expires_at)) : null;
  const state = row.state === 'invited' && expiresAt && expiresAt.getTime() <= Date.now() ? 'expired' : row.state;
  return {
    id: row.id, source: row.source, state, email: row.email,
    expiresAt: row.expires_at ?? null, submittedAt: row.submitted_at ?? null,
    reviewNote: row.review_note ?? null, authorizationRequestId: row.authorization_request_id ?? null,
    wallet: row.wallet ?? null,
    profile: profile ? {
      id: profile.id, name: profile.name, email: profile.email, specialty: profile.specialty ?? '',
      licenseNum: profile.license_num ?? '', rut: profile.rut ?? '', status: profile.status,
    } : null,
  };
}

async function latest(sql: Sql, email: string) {
  const rows = await sql.query<Row>(`SELECT * FROM doctor_onboarding_requests
    WHERE LOWER(email)=LOWER($1) ORDER BY created_at DESC LIMIT 1`, [email]);
  return rows[0];
}

async function profile(sql: Sql, email: string) {
  const rows = await sql.query<Row>(`SELECT id,name,email,specialty,license_num,rut,status,created_at
    FROM doctors WHERE LOWER(email)=LOWER($1) LIMIT 1`, [email]);
  return rows[0];
}

async function identity(sql: Sql, actor: AuthedUser) {
  if (!actor.email) throw new PrivateFlowError('unauthorized', 401);
  const wallet = await verifiedWallet(sql, actor.userId, actor.email);
  return { email: normalizeEmail(actor.email), ...wallet };
}

export async function doctorOnboardingView(sql: Sql, actor: AuthedUser) {
  const owner = await identity(sql, actor), current = await latest(sql, owner.email), doctor = await profile(sql, owner.email);
  if (current?.privy_user_id && (current.privy_user_id !== actor.userId || current.wallet_id !== owner.walletId || current.wallet !== owner.address)) {
    throw new PrivateFlowError('doctor_identity_mismatch', 403);
  }
  return { wallet: owner.address, onboarding: publicOnboarding(current, doctor), profile: doctor ?? null };
}

export async function acceptDoctorInvitation(sql: Sql, actor: AuthedUser) {
  assertPrivateWrites();
  const owner = await identity(sql, actor);
  const rows = await sql.query<Row>(`UPDATE doctor_onboarding_requests SET
      state='draft',privy_user_id=$2,wallet_id=$3,wallet=$4,updated_at=NOW()
    WHERE id=(SELECT id FROM doctor_onboarding_requests WHERE LOWER(email)=LOWER($1)
      ORDER BY created_at DESC LIMIT 1)
      AND state='invited' AND expires_at>NOW()
      AND privy_user_id IS NULL AND wallet_id IS NULL AND wallet IS NULL
    RETURNING *`, [owner.email, actor.userId, owner.walletId, owner.address]);
  if (!rows[0]) {
    const current = await latest(sql, owner.email);
    if (!current) throw new PrivateFlowError('invitation_not_found', 404);
    if (current.state === 'invited' && new Date(String(current.expires_at)).getTime() <= Date.now()) throw new PrivateFlowError('invitation_expired', 409);
    throw new PrivateFlowError('invitation_not_acceptable', 409);
  }
  return doctorOnboardingView(sql, actor);
}

export async function reconcileAuthorizedDoctorOnboarding(sql: Sql, actor: AuthedUser) {
  const owner = await identity(sql, actor);
  const rows = await sql.query<Row>(`UPDATE doctor_onboarding_requests SET
      state='authorized',authorized_at=COALESCE(authorized_at,NOW()),updated_at=NOW()
    WHERE id=(SELECT id FROM doctor_onboarding_requests WHERE LOWER(email)=LOWER($1)
      ORDER BY created_at DESC LIMIT 1)
      AND state IN ('draft','submitted','changes_requested','authorization_pending')
      AND privy_user_id=$2 AND wallet_id=$3 AND wallet=$4
    RETURNING *`, [owner.email, actor.userId, owner.walletId, owner.address]);
  if (!rows[0]) {
    const current = await latest(sql, owner.email);
    if (current?.state !== 'authorized' || current.privy_user_id !== actor.userId ||
        current.wallet_id !== owner.walletId || current.wallet !== owner.address) {
      throw new PrivateFlowError('doctor_identity_mismatch', 403);
    }
  }
  await sql.query(`UPDATE doctors SET status='active',updated_at=NOW()
    WHERE LOWER(email)=LOWER($1)`, [owner.email]);
  return doctorOnboardingView(sql, actor);
}

async function ensureApplication(sql: Sql, actor: AuthedUser, owner: Awaited<ReturnType<typeof identity>>, values: DoctorOnboardingProfile) {
  let current = await latest(sql, owner.email);
  if (current) return current;
  const doctors = await sql.query<Row>(`INSERT INTO doctors(name,email,specialty,license_num,rut,status)
    VALUES($1,$2,$3,$4,$5,'pending')
    ON CONFLICT(email) DO UPDATE SET updated_at=doctors.updated_at
    RETURNING id,name,email,specialty,license_num,rut,status`,
  [values.name, owner.email, values.specialty, values.licenseNum, values.rut]);
  const doctor = doctors[0];
  if (!doctor) throw new PrivateFlowError('doctor_not_created', 503);
  try {
    const rows = await sql.query<Row>(`INSERT INTO doctor_onboarding_requests
      (id,doctor_id,source,email,state,privy_user_id,wallet_id,wallet)
      VALUES($1,$2,'application',$3,'draft',$4,$5,$6) RETURNING *`,
    [randomUUID(), doctor.id, owner.email, actor.userId, owner.walletId, owner.address]);
    current = rows[0];
  } catch (error) {
    if ((error as { code?: string }).code !== '23505') throw error;
    current = await latest(sql, owner.email);
  }
  if (!current) throw new PrivateFlowError('doctor_onboarding_unavailable', 503);
  return current;
}

export async function saveDoctorApplication(sql: Sql, actor: AuthedUser, input: Record<string, unknown>, submit: boolean) {
  assertPrivateWrites();
  const values = cleanProfile(input), owner = await identity(sql, actor);
  const current = await ensureApplication(sql, actor, owner, values);
  const effective = current.state === 'invited' && new Date(String(current.expires_at)).getTime() <= Date.now() ? 'expired' : current.state;
  if (effective === 'invited') throw new PrivateFlowError('invitation_acceptance_required', 409);
  if (!['draft', 'changes_requested'].includes(String(effective))) throw new PrivateFlowError(
    effective === 'rejected' ? 'application_rejected' : effective === 'expired' ? 'invitation_expired' : 'application_not_editable', 409);
  if (current.privy_user_id !== actor.userId || current.wallet_id !== owner.walletId || current.wallet !== owner.address) {
    throw new PrivateFlowError('doctor_identity_mismatch', 403);
  }
  const doctors = await sql.query<Row>(`UPDATE doctors SET name=$2,specialty=$3,license_num=$4,rut=$5,updated_at=NOW()
    WHERE id=$1 AND LOWER(email)=LOWER($6) RETURNING id`,
  [current.doctor_id, values.name, values.specialty, values.licenseNum, values.rut, owner.email]);
  if (!doctors[0]) throw new PrivateFlowError('doctor_identity_mismatch', 403);
  const next = submit ? 'submitted' : current.state;
  const rows = await sql.query<Row>(`UPDATE doctor_onboarding_requests SET state=$2,
      submitted_at=CASE WHEN $2='submitted' THEN NOW() ELSE submitted_at END,
      updated_at=NOW()
    WHERE id=$1 AND state IN ('draft','changes_requested')
      AND privy_user_id=$3 AND wallet_id=$4 AND wallet=$5 RETURNING *`,
  [current.id, next, actor.userId, owner.walletId, owner.address]);
  if (!rows[0]) throw new PrivateFlowError('application_state_changed', 409);
  return doctorOnboardingView(sql, actor);
}

export async function createDoctorInvitation(sql: Sql, actor: AuthedUser, input: Record<string, unknown>) {
  assertPrivateWrites();
  const email = typeof input.email === 'string' ? normalizeEmail(input.email) : '';
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const specialty = typeof input.specialty === 'string' ? input.specialty.trim() : '';
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !name || !specialty || name.length > 160 || specialty.length > 200) {
    throw new PrivateFlowError('invalid_doctor_invitation', 400);
  }
  await sql.query(`UPDATE doctor_onboarding_requests SET state='expired',updated_at=NOW()
    WHERE LOWER(email)=LOWER($1) AND state='invited' AND expires_at<=NOW()`, [email]);
  const active = await sql.query<Row>(`SELECT id FROM doctor_onboarding_requests WHERE LOWER(email)=LOWER($1)
    AND state=ANY($2::text[]) LIMIT 1`, [email, ACTIVE]);
  if (active[0]) throw new PrivateFlowError('doctor_onboarding_already_active', 409);
  const doctors = await sql.query<Row>(`INSERT INTO doctors(name,email,specialty,status)
    VALUES($1,$2,$3,'pending') ON CONFLICT(email) DO UPDATE SET
      name=CASE WHEN doctors.status='pending' THEN EXCLUDED.name ELSE doctors.name END,
      specialty=CASE WHEN doctors.status='pending' THEN EXCLUDED.specialty ELSE doctors.specialty END,
      updated_at=NOW() RETURNING id,name,email,specialty,status`, [name, email, specialty || null]);
  const doctor = doctors[0];
  if (!doctor || doctor.status !== 'pending') throw new PrivateFlowError('doctor_already_registered', 409);
  let rows: Row[];
  try {
    rows = await sql.query<Row>(`INSERT INTO doctor_onboarding_requests
      (id,doctor_id,source,email,state,invited_by,invited_email,expires_at)
      VALUES($1,$2,'invitation',$3,'invited',$4,$5,NOW()+INTERVAL '7 days') RETURNING *`,
    [randomUUID(), doctor.id, email, actor.userId, actor.email]);
  } catch (error) {
    if ((error as { code?: string }).code === '23505') throw new PrivateFlowError('doctor_onboarding_already_active', 409);
    throw error;
  }
  if (!rows[0]) throw new PrivateFlowError('doctor_invitation_not_created', 503);
  return { doctor, onboarding: publicOnboarding(rows[0], doctor) };
}

export async function listDoctorOnboarding(sql: Sql) {
  const rows = await sql.query<Row>(`SELECT d.id,d.name,d.email,d.specialty,d.status,
      o.id AS onboarding_id,o.source,o.state AS onboarding_state,o.expires_at,o.submitted_at,o.review_note,o.wallet
    FROM doctors d LEFT JOIN LATERAL (
      SELECT * FROM doctor_onboarding_requests r WHERE r.doctor_id=d.id ORDER BY r.created_at DESC LIMIT 1
    ) o ON TRUE ORDER BY COALESCE(o.updated_at,d.created_at) DESC`);
  return rows.map(row => ({
    id: row.id, name: row.name, email: row.email, specialty: row.specialty, status: row.status,
    onboarding: row.onboarding_id ? {
      id: row.onboarding_id, source: row.source,
      state: row.onboarding_state === 'invited' && row.expires_at && new Date(String(row.expires_at)).getTime() <= Date.now() ? 'expired' : row.onboarding_state,
      expiresAt: row.expires_at ?? null, submittedAt: row.submitted_at ?? null,
      reviewNote: row.review_note ?? null, wallet: row.wallet ?? null,
    } : null,
  }));
}

export async function reviewDoctorOnboarding(sql: Sql, actor: AuthedUser, id: string, action: string, note: string) {
  assertPrivateWrites();
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(id) || note.length > 500 ||
      !['request_changes', 'reject', 'reopen'].includes(action) || (action !== 'reopen' && !note)) {
    throw new PrivateFlowError('invalid_onboarding_review', 400);
  }
  const transition = action === 'request_changes'
    ? { from: ['submitted'], to: 'changes_requested', stamp: 'changes_requested_at' }
    : action === 'reject'
      ? { from: ['submitted', 'changes_requested'], to: 'rejected', stamp: 'rejected_at' }
      : { from: ['rejected'], to: 'changes_requested', stamp: 'reopened_at' };
  const rows = await sql.query<Row>(`UPDATE doctor_onboarding_requests SET state=$2,review_note=COALESCE(NULLIF($3,''),review_note),
      reviewed_by=$4,reviewed_email=$5,${transition.stamp}=NOW(),updated_at=NOW()
    WHERE id=$1 AND state=ANY($6::text[]) RETURNING *`,
  [id, transition.to, note || null, actor.userId, actor.email, transition.from]);
  if (!rows[0]) throw new PrivateFlowError('onboarding_state_changed', 409);
  return publicOnboarding(rows[0], await profile(sql, String(rows[0].email)));
}

export async function onboardingForDoctor(sql: Sql, doctorId: number) {
  const rows = await sql.query<Row>(`SELECT o.* FROM doctor_onboarding_requests o
    WHERE o.doctor_id=$1 ORDER BY o.created_at DESC LIMIT 1`, [doctorId]);
  return publicOnboarding(rows[0], await (async () => {
    const profiles = await sql.query<Row>('SELECT id,name,email,specialty,license_num,rut,status FROM doctors WHERE id=$1', [doctorId]);
    return profiles[0];
  })());
}

export async function assertSubmittedOnboarding(sql: Sql, doctorId: number) {
  const rows = await sql.query<Row>(`SELECT id,state,privy_user_id,wallet_id,wallet,authorization_request_id FROM doctor_onboarding_requests
    WHERE doctor_id=$1 ORDER BY created_at DESC LIMIT 1`, [doctorId]);
  const row = rows[0];
  if (!row || !['submitted', 'authorization_pending'].includes(String(row.state)) || !row.privy_user_id || !row.wallet_id || !row.wallet) {
    throw new PrivateFlowError('doctor_onboarding_not_submitted', 409);
  }
  return row;
}

export async function markOnboardingAuthorizationPending(sql: Sql, onboardingId: string, authorizationRequestId: string) {
  const rows = await sql.query<Row>(`UPDATE doctor_onboarding_requests SET state='authorization_pending',
      authorization_request_id=COALESCE(authorization_request_id,$2),updated_at=NOW()
    WHERE id=$1 AND ((state='submitted' AND authorization_request_id IS NULL)
      OR (state='authorization_pending' AND authorization_request_id=$2)) RETURNING id`,
  [onboardingId, authorizationRequestId]);
  if (!rows[0]) throw new PrivateFlowError('onboarding_state_changed', 409);
}
