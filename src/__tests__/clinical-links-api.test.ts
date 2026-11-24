import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  partner: vi.fn(), proof: vi.fn(), anchor: vi.fn(), event: vi.fn(), session: vi.fn(), pilot: vi.fn(),
}));

vi.mock('@/lib/clinical-links/store', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/clinical-links/store')>(),
  authenticateClinicalPartner: mocks.partner,
  readClinicalLinkProof: mocks.proof,
  recordClinicalLinkEvent: mocks.event,
}));
vi.mock('@/lib/clinical-links/config', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/clinical-links/config')>(),
  assertClinicalLinksPilot: mocks.pilot,
  getClinicalLinksPilotPartnerOrigin: () => 'https://cannabis-preview.example',
  isClinicalLinksPilotPatient: (id: string) => id === 'patient-1',
}));
vi.mock('@/lib/clinical-links/anchor', () => ({ readClinicalLinkAnchor: mocks.anchor }));
vi.mock('@/lib/auth/privy-auth', () => ({ requirePrivySession: mocks.session }));

import { GET as getProof } from '@/app/api/v1/clinical-links/[linkRef]/proof/route';
import { POST as postEvent } from '@/app/api/v1/clinical-link-events/route';
import { ClinicalLinksApiError } from '@/lib/clinical-links/config';
import { PilotStoreError } from '@/lib/clinical-links/store';

const linkRef = '25c1bf62-56cf-4a61-a8a0-502c67f8b966';
const commitment = 'ab'.repeat(32);
const partner = { id: 'cannabis', origin: 'https://cannabis-preview.example', name: 'Cannabis' };
const partnerAuth = `Bearer tl_clp_${'cd'.repeat(32)}`;
const event = {
  schemaVersion: 1,
  eventId: '4be90267-3468-47ab-bec7-93a26823dcf7',
  eventType: 'clinical-link.issued',
  partnerPatientRef: '0562477a-89a3-49f3-8de5-cdf259ef7b0e',
  resourceRef: 'rx_0123456789abcdef',
  category: 'cannabis.prescription',
  clinicalStatus: 'active',
  revision: 1,
  documentRevision: 1,
  occurredAt: '2026-11-23T12:00:00Z',
  commitment,
};

function eventRequest(payload: unknown, authorization = partnerAuth) {
  return new Request('https://ficha-preview.example/api/v1/clinical-link-events', {
    method: 'POST',
    headers: { authorization, 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

function proofRequest(authorization = partnerAuth) {
  const request = new Request(`https://ficha-preview.example/api/v1/clinical-links/${linkRef}/proof?revision=1`, {
    headers: { authorization },
  });
  return getProof(request, { params: Promise.resolve({ linkRef }) });
}

describe('clinical links API', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.partner.mockResolvedValue(partner);
    mocks.session.mockResolvedValue({ userId: 'patient-1' });
    mocks.event.mockResolvedValue({ eventId: event.eventId, linkRef, result: 'applied' });
    mocks.proof.mockResolvedValue({ state: 'confirmed', commitment });
    mocks.anchor.mockResolvedValue('verified');
  });

  it('accepts normalized metadata only, with a scoped partner credential', async () => {
    const response = await postEvent(eventRequest(event));
    expect(response.status).toBe(202);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(mocks.partner).toHaveBeenCalledWith(expect.any(Request), 'clinical-links:write');
    expect(mocks.event).toHaveBeenCalledWith(partner, { ...event, occurredAt: '2026-11-23T12:00:00.000Z' });
  });

  it.each([
    { ...event, pdf: 'unexpected' },
    { ...event, occurredAt: '2026-02-30T12:00:00Z' },
    { ...event, documentRevision: 2 },
    { ...event, clinicalStatus: 'revoked' },
    { ...event, documentRevision: 1, eventType: 'clinical-link.revoked', revision: 2, clinicalStatus: 'revoked' },
  ])('rejects invalid events before storing them', async payload => {
    expect((await postEvent(eventRequest(payload))).status).toBe(400);
    expect(mocks.event).not.toHaveBeenCalled();
  });

  it('rejects oversized requests', async () => {
    expect((await postEvent(eventRequest({ ...event, extra: 'x'.repeat(4100) }))).status).toBe(413);
    expect(mocks.event).not.toHaveBeenCalled();
  });

  it('enforces the pilot flag before authentication and storage', async () => {
    mocks.pilot.mockImplementation(() => { throw new ClinicalLinksApiError('pilot_disabled', 404); });
    expect((await postEvent(eventRequest(event))).status).toBe(404);
    expect(mocks.partner).not.toHaveBeenCalled();
    expect(mocks.event).not.toHaveBeenCalled();
  });

  it('verifies the pinned commitment and authorizes the resource again before delivery', async () => {
    const response = await proofRequest();
    expect(await response.json()).toEqual({ linkRef, revision: 1, integrityStatus: 'verified', commitment });
    expect(mocks.partner).toHaveBeenCalledWith(expect.any(Request), 'proofs:verify');
    expect(mocks.proof).toHaveBeenCalledTimes(2);
    expect(mocks.anchor).toHaveBeenCalledWith(commitment);
    expect(mocks.session).not.toHaveBeenCalled();
  });

  it('withholds proof when a grant is revoked during the ledger read', async () => {
    mocks.proof.mockResolvedValueOnce({ state: 'confirmed', commitment }).mockRejectedValueOnce(new PilotStoreError('not_found', 404));
    const response = await proofRequest();
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'not_found' });
  });

  it('uses the confirmed private prescription receipt instead of a detached anchor', async () => {
    mocks.proof.mockResolvedValue({ state: 'confirmed', commitment, proofSource: 'prescription', transactionHash: '23'.repeat(32) });
    expect(await (await proofRequest()).json()).toEqual({ linkRef, revision: 1, integrityStatus: 'verified', commitment });
    expect(mocks.proof).toHaveBeenCalledTimes(2);
    expect(mocks.anchor).not.toHaveBeenCalled();
  });

  it('reports the ledger outage independently of the stored confirmation', async () => {
    mocks.anchor.mockResolvedValue('unavailable');
    const response = await proofRequest('Bearer patient-session');
    expect(await response.json()).toEqual({ linkRef, revision: 1, integrityStatus: 'unavailable', commitment: null });
    expect(mocks.proof).toHaveBeenCalledWith({ patientUserId: 'patient-1' }, linkRef, 1);
  });
});
