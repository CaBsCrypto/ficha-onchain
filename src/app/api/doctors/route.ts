import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireUser, unauthorized } from '@/lib/auth/privy-auth';
import { isSameOrigin } from '@/lib/auth/same-origin';
import { assertPrivateEnvironment, assertPrivateWrites, PrivateFlowError } from '@/lib/private-config';
import { DoctorAuthorizationError, resolveDoctor, readPrivateDoctor } from '@/lib/doctor-authorizations';

export const runtime='nodejs';
export const dynamic='force-dynamic';

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export async function GET(request:Request){
  const actor=await requireUser(request);if(!actor?.email)return unauthorized();
  try{
    assertPrivateEnvironment();const sql=getDb();
    const rows=await sql`SELECT id,name,email,specialty,telemedicine,center_name FROM doctors WHERE status='active' ORDER BY name`;
    const doctors=[];
    for(const row of rows){
      try{
        const resolved=await resolveDoctor(sql,Number(row.id));
        if((await readPrivateDoctor(resolved.address)).authorized)doctors.push(row);
      }catch(error){
        // A historical profile without a Privy account is not a bookable private doctor.
        if(error instanceof DoctorAuthorizationError&&error.message==='doctor_privy_login_required')continue;
        throw error;
      }
    }
    return json({doctors});
  }catch{return json({error:'doctor_directory_unavailable'},503);}
}

const limits: Record<string, number> = {
  name: 160,
  email: 254,
  specialty: 200,
  licenseNum: 80,
  license_num: 80,
  rut: 30,
  phone: 80,
  centerName: 200,
  center_name: 200,
};

export async function POST(request: Request) {
  const actor = await requireUser(request);
  if (!actor?.email) return unauthorized();
  if (!isSameOrigin(request)) return json({ error: 'forbidden' }, 403);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw Error();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  if (Object.keys(body).some(k => !(k in limits)) || Object.values(body).some(v => typeof v !== 'string')) {
    return json({ error: 'invalid_doctor_profile' }, 400);
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name || name.length > limits.name) return json({ error: 'invalid_doctor_profile' }, 400);

  if (typeof body.email === 'string' && body.email.trim().toLowerCase() !== actor.email.toLowerCase()) {
    return json({ error: 'invalid_doctor_profile' }, 400);
  }

  const specialty = typeof body.specialty === 'string' ? body.specialty.trim() || null : null;
  const licenseNum = (typeof body.licenseNum === 'string' ? body.licenseNum : typeof body.license_num === 'string' ? body.license_num : '').trim() || null;
  const rut = typeof body.rut === 'string' ? body.rut.trim() || null : null;
  const phone = typeof body.phone === 'string' ? body.phone.trim() || null : null;
  const centerName = (typeof body.centerName === 'string' ? body.centerName : typeof body.center_name === 'string' ? body.center_name : '').trim() || null;

  try {
    assertPrivateWrites();
    const sql = getDb();
    const email = actor.email.toLowerCase();

    const [existing] = await sql`SELECT id, status FROM doctors WHERE LOWER(email)=${email} LIMIT 1`;
    if (existing) {
      return json({ error: 'doctor_already_registered', status: existing.status }, 409);
    }

    const [doctor] = await sql`INSERT INTO doctors(name, email, specialty, license_num, rut, phone, center_name, status)
      VALUES(${name}, ${email}, ${specialty}, ${licenseNum}, ${rut}, ${phone}, ${centerName}, 'pending')
      RETURNING id, name, email, specialty, license_num, rut, phone, center_name, status, created_at`;

    if (!doctor) return json({ error: 'doctor_not_created' }, 503);
    return json({ success: true, doctor }, 201);
  } catch (error) {
    if (error instanceof PrivateFlowError) return json({ error: error.message }, error.status);
    if ((error as { code?: string })?.code === '23505') return json({ error: 'doctor_already_registered' }, 409);
    return json({ error: 'doctor_registration_unavailable' }, 503);
  }
}
