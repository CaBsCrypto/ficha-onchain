import { exportSPKI, generateKeyPair, SignJWT } from 'jose';
import { afterEach, describe, expect, it, vi } from 'vitest';

const sandbox = 'cmtestsharedapp000000001';
const subject = 'did:privy:synthetic-patient';
const partner = { id: 'cannabis', name: 'Cannabis', origin: 'https://cannabis.example', privyAppClientId: 'client_cannabis' };
vi.mock('@/lib/private-config', () => ({ PRIVY_APP: 'pinned-production-app', privatePrivyAppId: () => sandbox }));

import { verifyPartnerPatient } from '@/lib/clinical-links/identity';

async function signed(options: { issuer?: string; audience?: string; client?: string; sub?: string } = {}) {
  const { privateKey, publicKey } = await generateKeyPair('ES256');
  vi.stubEnv('TRUSTLEAF_CLINICAL_LINKS_PRIVY_VERIFICATION_KEY', await exportSPKI(publicKey));
  const token = await new SignJWT({ app_client_id: options.client ?? partner.privyAppClientId })
    .setProtectedHeader({ alg: 'ES256' }).setIssuer(options.issuer ?? 'privy.io').setSubject(options.sub ?? subject)
    .setAudience(options.audience ?? sandbox).setIssuedAt().setExpirationTime('5min').sign(privateKey);
  return new Request('https://ficha.example', { headers: { 'Privy-Access-Token': token } });
}

afterEach(() => vi.unstubAllEnvs());

describe('shared Privy enrollment identity proof', () => {
  it('resolves the allowed patient from the signed sandbox JWT', async () => {
    vi.stubEnv('TRUSTLEAF_CLINICAL_LINKS_PATIENT_IDS', subject);
    const request = await signed();
    await expect(verifyPartnerPatient(request, partner)).resolves.toEqual({
      userId: subject, verifiedAtEpochSeconds: expect.any(Number),
    });
  });

  it.each([
    { issuer: 'other-provider.example' }, { audience: 'other-app-id' }, { client: 'client_other_partner' }, { sub: 'caller-choice' },
  ])('rejects unrelated issuer, app, client and malformed subject', async options => {
    await expect(verifyPartnerPatient(await signed(options), partner)).rejects.toMatchObject({ status: 401 });
  });

  it('excludes a verified identity outside the pilot allowlist', async () => {
    vi.stubEnv('TRUSTLEAF_CLINICAL_LINKS_PATIENT_IDS', 'did:privy:another-patient');
    await expect(verifyPartnerPatient(await signed(), partner)).rejects.toMatchObject({ status: 404 });
  });
});
