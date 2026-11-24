import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClinicalLinkEvent } from '@/lib/clinical-links/types';

const db = vi.hoisted(() => ({ query: vi.fn(), release: vi.fn() }));
vi.mock('@/lib/db', () => {
  const client = { query: db.query, release: db.release };
  const sql = async (strings: TemplateStringsArray, ...parameters: unknown[]) => {
    const text = strings.reduce((query, part, i) => `${query}${i ? `$${i}` : ''}${part}`, '');
    return (await client.query(text, parameters)).rows;
  };
  return { getDb: () => sql, getDbConnection: async () => client, sqlForConnection: () => sql };
});
vi.mock('@/lib/clinical-links/config', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/clinical-links/config')>(),
  getClinicalLinksPilotPartnerOrigin: () => 'https://partner.example',
}));

import {
  authenticateClinicalPartner, claimClinicalBinding, confirmClinicalBinding, enrollClinicalPatient, listClinicalLinks,
  readClinicalLinkProof, readClinicalPatientAccount, recordClinicalLinkEvent,
} from '@/lib/clinical-links/store';

const partner = { id: 'trustleaf-cannabis', name: 'TrustLeaf Cannabis', origin: 'https://partner.example' };
const patientUserId = 'synthetic-patient-a';
const bindingId = '10000000-0000-4000-8000-000000000001';
const linkRef = '10000000-0000-4000-8000-000000000002';
const occurredAt = '2026-11-23T13:00:00.000Z';
const commitment = 'c'.repeat(64);
const issue: ClinicalLinkEvent = {
  schemaVersion: 1, eventId: '10000000-0000-4000-8000-000000000003', eventType: 'clinical-link.issued',
  category: 'cannabis.prescription', partnerPatientRef: '10000000-0000-4000-8000-000000000004',
  resourceRef: 'synthetic-resource-a', clinicalStatus: 'active', revision: 1, documentRevision: 1, occurredAt, commitment,
};
const binding = { binding_id: bindingId, patient_user_id: patientUserId, partner_actor_ref: 'a'.repeat(64) };
const receipt = { event_id: issue.eventId, link_ref: linkRef, revision: 1, result: 'applied', received_at: occurredAt };
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

function reply(handler: (query: string, values: unknown[]) => Record<string, unknown>[]) {
  db.query.mockImplementation(async (query: string, values: unknown[] = []) => ({ rows: handler(query, values) }));
}

const calls = (pattern: RegExp) => db.query.mock.calls.filter(([query]) => pattern.test(query));

beforeEach(() => vi.resetAllMocks());

describe('clinical links pilot storage', () => {
  it('hashes the service secret and requires the exact scope and registered origin', async () => {
    const token = `tl_clp_${'1'.repeat(64)}`;
    const request = new Request('https://ficha.example', { headers: { authorization: `Bearer ${token}` } });
    reply((query, params) => {
      if (query.includes('FROM clinical_link_partner_credentials')) {
        expect(params).toEqual(['proofs:verify', sha256(token)]);
        expect(query).toMatch(/c\.expires_at > now\(\) AND c\.revoked_at IS NULL AND p\.active/);
        return [{ ...partner, allowed: false }];
      }
      return [];
    });
    await expect(authenticateClinicalPartner(request, 'proofs:verify')).rejects.toMatchObject({ status: 403 });
    expect(calls(/INSERT INTO clinical_link_audit/)).toHaveLength(1);
  });

  it('consumes a claim once and preserves the fifth invalid confirmation attempt', async () => {
    const clientCode = 'A'.repeat(43);
    reply((query, params) => {
      if (query.includes('SELECT binding_id FROM clinical_partner_bindings') && query.includes('claim_code_hash')) {
        expect(params).toEqual([partner.id, sha256(clientCode)]);
        expect(query).toContain('FOR UPDATE');
        return [{ binding_id: bindingId }];
      }
      if (query.includes('SELECT b.*, b.expires_at')) {
        return [{ status: 'claimed', confirmation_hash: sha256(`${bindingId}:12345678`), confirmation_attempts: 4 }];
      }
      return [];
    });
    await expect(claimClinicalBinding(partner, clientCode, 'b'.repeat(64))).resolves.toEqual({
      bindingId, confirmationCode: expect.stringMatching(/^\d{8}$/),
    });
    expect(calls(/claim_code_hash = NULL/)).toHaveLength(1);
    await expect(confirmClinicalBinding(patientUserId, bindingId, '99999999')).rejects.toMatchObject({ status: 409 });
    const [attempt] = calls(/SET confirmation_attempts/);
    expect(attempt[1]).toEqual([5, 5, 5, bindingId]);
    expect(calls(/^COMMIT$/)).toHaveLength(2);
  });

  it('persists projection, anchor and receipt together and replays an identical event', async () => {
    let stored: Record<string, unknown> | null = null;
    reply((query, params) => {
      if (query.includes('SELECT binding_id, patient_user_id')) return [binding];
      if (query.includes('SELECT * FROM clinical_link_events')) return stored ? [stored] : [];
      if (query.includes('INSERT INTO clinical_link_anchors')) return [{ commitment }];
      if (query.includes('INSERT INTO clinical_link_events')) {
        stored = { ...receipt, payload_hash: params[3] };
        return [stored];
      }
      return [];
    });
    const initial = await recordClinicalLinkEvent(partner, issue);
    await expect(recordClinicalLinkEvent(partner, { ...issue })).resolves.toEqual(initial);
    for (const target of ['clinical_partner_links', 'clinical_link_anchors', 'clinical_link_events']) {
      expect(calls(new RegExp(`INSERT INTO ${target}`))).toHaveLength(1);
    }
    expect(calls(/^COMMIT$/)).toHaveLength(2);
    await expect(recordClinicalLinkEvent(partner, { ...issue, occurredAt: '2026-11-23T13:00:01.000Z' }))
      .rejects.toMatchObject({ code: 'event_conflict', status: 409 });
    expect(calls(/^ROLLBACK$/)).toHaveLength(1);
  });

  it('keeps a newer revocation while accepting the late issued document proof', async () => {
    reply(query => {
      if (query.includes('SELECT binding_id, patient_user_id')) return [binding];
      if (query.includes('SELECT l.*, b.patient_user_id')) {
        return [{ ...binding, link_ref: linkRef, clinical_status: 'revoked', revision: 2, document_revision: 1 }];
      }
      if (query.includes('INSERT INTO clinical_link_anchors')) return [{ commitment }];
      if (query.includes('INSERT INTO clinical_link_events')) return [{ ...receipt, result: 'stale' }];
      return [];
    });
    await expect(recordClinicalLinkEvent(partner, issue)).resolves.toMatchObject({ linkRef, result: 'stale' });
    expect(calls(/UPDATE clinical_partner_links/)).toHaveLength(0);
    expect(calls(/INSERT INTO clinical_link_anchors/)).toHaveLength(1);
  });

  it('does not let a different patient take over an existing resource', async () => {
    reply(query => {
      if (query.includes('SELECT binding_id, patient_user_id')) return [binding];
      if (query.includes('SELECT l.*, b.patient_user_id')) {
        return [{ ...binding, patient_user_id: 'synthetic-patient-b', link_ref: linkRef }];
      }
      return [];
    });
    await expect(recordClinicalLinkEvent(partner, issue)).rejects.toMatchObject({ status: 404 });
    expect(calls(/INSERT INTO clinical_link_anchors|UPDATE clinical_partner_links/)).toHaveLength(0);
  });

  it('applies live grant checks to the patient list and both proof callers', async () => {
    reply((query, parameters) => {
      if (query.includes('LEFT JOIN clinical_link_anchors')) {
        expect(query).toMatch(/b\.status = 'active' AND b\.expires_at > now\(\) AND p\.active/);
        expect(parameters).toContain(query.includes('l.link_ref =') && parameters.at(-1) ? partner.id : patientUserId);
      }
      return [];
    });
    await expect(listClinicalLinks(patientUserId)).resolves.toEqual([]);
    await expect(readClinicalLinkProof({ patientUserId }, linkRef, 1)).rejects.toMatchObject({ status: 404 });
    await expect(readClinicalLinkProof({ partner }, linkRef, 1)).rejects.toMatchObject({ status: 404 });
  });

  it('lists documents from their own registered origins and projects a verified prescription ID', async () => {
    const second = 'https://synthetic-second.example';
    reply(query => query.includes('COALESCE(a.state') ? [
      { link_ref: linkRef, occurred_at: occurredAt, origin: partner.origin, resource_ref: issue.resourceRef,
        proof_state: 'confirmed', prescription_rx_id: '17' },
      { link_ref: bindingId, occurred_at: occurredAt, origin: second, resource_ref: issue.resourceRef, proof_state: 'pending' },
    ] : []);
    await expect(listClinicalLinks(patientUserId)).resolves.toMatchObject([
      { href: `${partner.origin}/pilot/recetas/${issue.resourceRef}`, credentialId: '17' },
      { href: `${second}/pilot/recetas/${issue.resourceRef}` },
    ]);
  });

  it('does not grant exposure when an authenticated source enrolls a patient without consent', async () => {
    const sandboxPartner = { ...partner, privyAppClientId: 'client_cannabis' };
    reply(query => query.includes('SELECT partner_id FROM clinical_link_partners') ? [{ partner_id: partner.id }] : []);
    await expect(enrollClinicalPatient(sandboxPartner, { userId: patientUserId, verifiedAtEpochSeconds: 1 }, false))
      .resolves.toEqual({ status: 'active', partnerPatientRef: null, associationStatus: 'not_authorized' });
    expect(calls(/INSERT INTO clinical_link_patient_accounts/)).toHaveLength(1);
    expect(calls(/INSERT INTO clinical_partner_bindings/)[0][1]).toContain('revoked');
  });

  it('refuses an enrollment replay after the owner revokes consent', async () => {
    reply(query => {
      if (query.includes('SELECT partner_id FROM clinical_link_partners')) return [{ partner_id: partner.id }];
      if (query.includes('stale_after_revocation')) return [{ ...binding, status: 'revoked', stale_after_revocation: true }];
      return [];
    });
    await expect(enrollClinicalPatient({ ...partner, privyAppClientId: 'client_cannabis' },
      { userId: patientUserId, verifiedAtEpochSeconds: 1 }, true))
      .rejects.toMatchObject({ code: 'consent_session_refresh_required', status: 409 });
    expect(calls(/INSERT INTO clinical_link_patient_accounts|UPDATE clinical_partner_bindings/)).toHaveLength(0);
  });

  it('reads the owner account without provisioning a wallet and exposes existing wallet readiness', async () => {
    reply((query, parameters) => {
      if (query.includes('AS has_wallet')) {
        expect(parameters.at(-1)).toBe(patientUserId);
        return [{ enrolled: false, has_record: false, has_wallet: true }];
      }
      return [];
    });
    await expect(readClinicalPatientAccount(patientUserId)).resolves.toEqual({
      accountStatus: 'active', recordStatus: 'not_created', hasNativeWallet: true, sources: [],
    });
    expect(calls(/INSERT|UPDATE|BEGIN/)).toHaveLength(0);
  });
});
