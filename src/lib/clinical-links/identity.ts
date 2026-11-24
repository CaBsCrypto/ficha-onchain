import { importSPKI, jwtVerify } from 'jose';
import { PRIVY_APP, privatePrivyAppId } from '@/lib/private-config';
import { ClinicalLinksApiError, isClinicalLinksPilotPatient } from './config';
import type { ClinicalPartner } from './store';

export async function verifyPartnerActor(request: Request, partner: ClinicalPartner) {
  const token = request.headers.get('privy-access-token');
  if (!token || token.length > 12_000) throw new ClinicalLinksApiError('unauthorized', 401);
  if (!partner.privyAppClientId) throw new ClinicalLinksApiError('forbidden', 403);
  const audience = privatePrivyAppId();
  const pem = process.env.TRUSTLEAF_CLINICAL_LINKS_PRIVY_VERIFICATION_KEY?.replaceAll('\\n', '\n');
  if (!pem || audience === PRIVY_APP) throw new ClinicalLinksApiError('pilot_configuration_invalid', 503);

  let verificationKey;
  try {
    verificationKey = await importSPKI(pem, 'ES256');
  } catch {
    throw new ClinicalLinksApiError('pilot_configuration_invalid', 503);
  }
  try {
    const { payload } = await jwtVerify(token, verificationKey, {
      issuer: 'privy.io',
      audience,
      algorithms: ['ES256'],
      maxTokenAge: '1h',
      requiredClaims: ['exp', 'iat', 'sub'],
    });
    if (payload.app_client_id !== partner.privyAppClientId ||
        typeof payload.sub !== 'string' || !/^did:privy:[A-Za-z0-9_-]{6,128}$/.test(payload.sub) ||
        typeof payload.iat !== 'number' || !Number.isSafeInteger(payload.iat) || payload.iat < 0) {
      throw new ClinicalLinksApiError('unauthorized', 401);
    }
    return { userId: payload.sub, verifiedAtEpochSeconds: payload.iat };
  } catch (error) {
    if (error instanceof ClinicalLinksApiError) throw error;
    throw new ClinicalLinksApiError('unauthorized', 401);
  }
}

export async function verifyPartnerPatient(request: Request, partner: ClinicalPartner) {
  const actor = await verifyPartnerActor(request, partner);
  if (!isClinicalLinksPilotPatient(actor.userId)) throw new ClinicalLinksApiError('not_found', 404);
  return actor;
}
