import { getDb, type Sql } from '@/lib/db';
import type { AuthedUser } from '@/lib/auth/privy-auth';
import { privateApi, privateBody } from '@/lib/private-api';
import { assertPrivateWrites, PrivateFlowError } from '@/lib/private-config';
import { resolveDoctor, verifiedWallet } from '@/lib/doctor-authorizations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const limits: Record<string, number> = {
  name: 160, specialty: 200, bio: 2000, rut: 30, license_num: 80,
  phone: 80, center_name: 200, center_address: 500, signature_url: 2048,
};

/** Pending doctors can maintain their own profile; this never grants chain permissions. */
async function ownProfile(sql: Sql, actor: AuthedUser) {
  const wallet = await verifiedWallet(sql, actor.userId, actor.email!);
  const [profile] = await sql`SELECT id, name, email, specialty, bio, telemedicine, license_num,
    rut, phone, center_name, center_address, signature_url, status, created_at
    FROM doctors WHERE LOWER(email)=${actor.email} LIMIT 1`;
  if (!profile) return null;
  const doctor = await resolveDoctor(sql, Number(profile.id));
  if (doctor.userId !== actor.userId || doctor.walletId !== wallet.walletId || doctor.address !== wallet.address ||
      String(doctor.doctor.email).toLowerCase() !== actor.email) throw new PrivateFlowError('doctor_identity_mismatch', 403);
  return profile;
}

export function GET(request: Request) {
  return privateApi(request, async actor => ({ data: await ownProfile(getDb(), actor) }));
}

export function PUT(request: Request) {
  return privateApi(request, async actor => {
    assertPrivateWrites();
    const body = await privateBody(request, [...Object.keys(limits), 'telemedicine']);
    if (!Object.keys(body).length || Object.entries(body).some(([key, value]) => key === 'telemedicine'
      ? typeof value !== 'boolean' : typeof value !== 'string' || value.length > limits[key])) {
      throw new PrivateFlowError('invalid_doctor_profile', 400);
    }
    if (typeof body.name === 'string' && !body.name.trim()) throw new PrivateFlowError('invalid_doctor_profile', 400);
    const value = (key: string) => typeof body[key] === 'string' ? body[key].trim() : null;
    const sql = getDb(), profile = await ownProfile(sql, actor);
    if (!profile) throw new PrivateFlowError('doctor_not_found', 404);
    const [updated] = await sql`UPDATE doctors SET
      name=COALESCE(${value('name')},name), specialty=COALESCE(${value('specialty')},specialty),
      bio=COALESCE(${value('bio')},bio), telemedicine=COALESCE(${body.telemedicine ?? null},telemedicine),
      rut=COALESCE(${value('rut')},rut), license_num=COALESCE(${value('license_num')},license_num),
      phone=COALESCE(${value('phone')},phone), center_name=COALESCE(${value('center_name')},center_name),
      center_address=COALESCE(${value('center_address')},center_address), signature_url=COALESCE(${value('signature_url')},signature_url),
      updated_at=NOW() WHERE id=${Number(profile.id)} AND LOWER(email)=${actor.email}
      RETURNING id, name, email, specialty, bio, telemedicine, license_num,
        rut, phone, center_name, center_address, signature_url, status, created_at`;
    if (!updated) throw new PrivateFlowError('doctor_not_found', 404);
    return { data: updated };
  });
}
