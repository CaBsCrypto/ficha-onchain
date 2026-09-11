import type { Sql } from '@/lib/db';
import { readPrivateDoctor } from '@/lib/doctor-authorizations';
import { isDoctorLocallyApproved } from '@/lib/doctor-onboarding';

/** Application review and contractual validity are independent, required gates. */
export async function isApprovedDoctor(sql: Sql, doctorId: number, owner: { userId: string; email: string; walletId: string; address: string }): Promise<boolean> {
  if (!await isDoctorLocallyApproved(sql,doctorId,{...owner,email:owner.email.toLowerCase()})) return false;
  return (await readPrivateDoctor(owner.address)).authorized;
}
