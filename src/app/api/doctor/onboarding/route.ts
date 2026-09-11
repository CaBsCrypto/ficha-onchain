import { getDb } from '@/lib/db';
import { privateApi, privateBody } from '@/lib/private-api';
import { acceptDoctorInvitation, doctorOnboardingView, saveDoctorApplication } from '@/lib/doctor-onboarding';
import { PrivateFlowError } from '@/lib/private-config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return privateApi(request, actor => doctorOnboardingView(getDb(), actor));
}

export function POST(request: Request) {
  return privateApi(request, async actor => {
    const body = await privateBody(request, ['action', 'name', 'specialty', 'licenseNum', 'rut']);
    if (body.action === 'accept_invitation') {
      if (Object.keys(body).length !== 1) throw new PrivateFlowError('invalid_request', 400);
      return acceptDoctorInvitation(getDb(), actor);
    }
    if (body.action !== 'save' && body.action !== 'submit') throw new PrivateFlowError('invalid_onboarding_action', 400);
    return saveDoctorApplication(getDb(), actor, body, body.action === 'submit');
  });
}
