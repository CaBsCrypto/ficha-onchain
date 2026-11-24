import { randomUUID } from 'node:crypto';
import { Keypair } from '@stellar/stellar-sdk';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { partnerPrescriptionAppointment } from './clinical-links-mint-policy.mjs';
import {
  assertHostedPrivateRxReceiptScope, assertPrivateRxScopeOpen, loadPartnerPrivateRxScope,
  PRIVATE_RX_AUTHORITY, PRIVATE_RX_CONTRACT_ID, PRIVATE_RX_REGISTRY_ID,
} from './digital-cabs-rx-scope.mjs';

function fixture() {
  const address = () => Keypair.random().publicKey();
  const consultationRef = randomUUID();
  const databaseHost = 'ep-mint-fixture.neon.tech';
  const env = {
    TRUSTLEAF_CLINICAL_LINKS_PILOT_ENABLED: 'true', TRUSTLEAF_ENV: 'test',
    TRUSTLEAF_DATABASE_URL: `postgresql://fixture@${databaseHost}/fixture`,
    TRUSTLEAF_DB_HOST: databaseHost, TRUSTLEAF_CLINICAL_LINKS_DB_HOST: databaseHost,
    NEXT_PUBLIC_STELLAR_NETWORK: 'testnet', TRUSTLEAF_PARTNER_RX_ENABLED: 'true',
    TRUSTLEAF_PRIVATE_WRITES_ENABLED: 'false',
    TRUSTLEAF_PARTNER_RX_RELAYER_ADDRESS: address(),
    TRUSTLEAF_PARTNER_RX_CONSULTATIONS: JSON.stringify({ [consultationRef]: 1 }),
  };
  const plan = {
    phase: 'issuance', network: 'testnet', contractId: PRIVATE_RX_CONTRACT_ID, registryId: PRIVATE_RX_REGISTRY_ID, authority: PRIVATE_RX_AUTHORITY,
    relayer: env.TRUSTLEAF_PARTNER_RX_RELAYER_ADDRESS, appointmentId: 1, issuanceId: '1'.repeat(64), prescriptionId: randomUUID(),
    openedAt: 10, until: 100, bookingValidUntil: 100, maxTotalFeeStroops: '100',
    patient: { address: address(), userId: 'did:privy:syntheticpatient01', walletId: 'syntheticpatientwallet' },
    doctor: { address: address(), userId: 'did:privy:syntheticdoctor01', walletId: 'syntheticdoctorwallet' },
    steps: {
      consent: { requestId: randomUUID(), maxFeeStroops: '50' },
      mint: { requestId: randomUUID(), maxFeeStroops: '50' },
    },
  };
  const context = { consultationRef, attestationHash: '2'.repeat(64), commitment: '3'.repeat(64), partnerId: 'trustleaf-cannabis', bindingId: randomUUID(), expiresAt: 200 };
  return { env, plan, context };
}

test('a partner mint scope only opens the pinned Testnet appointment and the two owner steps', () => {
  const { env, plan, context } = fixture();
  assert.equal(partnerPrescriptionAppointment(context.consultationRef, env), 1);
  assert.equal(partnerPrescriptionAppointment(randomUUID(), env), null);
  const scope = loadPartnerPrivateRxScope(plan, context, { env });
  for (const step of ['mint', 'consent']) assert.equal(assertPrivateRxScopeOpen(scope, { env, now: 25, step }), scope);
  assert.throws(() => assertPrivateRxScopeOpen(scope, { env, now: 25, step: 'attest' }));
  assert.throws(() => assertPrivateRxScopeOpen(scope, { env, now: 100, step: 'mint' }), { message: 'private_rx_scope_expired' });
  assert.throws(() => assertPrivateRxScopeOpen({ ...scope }, { env, now: 25, step: 'mint' }));
  assert.throws(() => assertPrivateRxScopeOpen(scope, { env: { ...env, TRUSTLEAF_PRIVATE_WRITES_ENABLED: 'true' }, now: 25, step: 'mint' }));
});

test('partner scope rejects substituted commitment, appointments and signer combinations', () => {
  const { env, plan, context } = fixture();
  for (const replacement of [
    { appointmentId: 2 }, { contractId: PRIVATE_RX_REGISTRY_ID }, { doctor: plan.patient }, { maxTotalFeeStroops: '99' },
  ]) assert.throws(() => loadPartnerPrivateRxScope({ ...plan, ...replacement }, context, { env }));
  assert.throws(() => loadPartnerPrivateRxScope(plan, { ...context, commitment: '0'.repeat(64) }, { env }));
  const alternate = loadPartnerPrivateRxScope(plan, { ...context, commitment: '4'.repeat(64) }, { env });
  assert.notEqual(alternate.policyHash, loadPartnerPrivateRxScope(plan, context, { env }).policyHash);
});

test('historical scopes can settle an existing receipt but cannot sign or broadcast', () => {
  const { env, plan, context } = fixture();
  const active = loadPartnerPrivateRxScope(plan, context, { env });
  const historical = loadPartnerPrivateRxScope(plan, context, { env, historical: true });
  assert.equal(historical.policyHash, active.policyHash);
  assert.doesNotThrow(() => assertHostedPrivateRxReceiptScope(historical, 'mint'));
  assert.throws(() => assertHostedPrivateRxReceiptScope(historical, 'attest'));
  assert.throws(() => assertPrivateRxScopeOpen(historical, { env, now: 25, step: 'mint' }));
});
