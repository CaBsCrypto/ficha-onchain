import assert from 'node:assert/strict';
import test from 'node:test';
import { Account, BASE_FEE, Keypair, Networks, SorobanDataBuilder, TransactionBuilder } from '@stellar/stellar-sdk';
import { PRIVATE_RX_CONTRACT_ID } from './digital-cabs-rx-scope.mjs';
import { createPrivateRxSponsorship, privateRxInvocation, privateRxQuote } from './private-rx-sponsorship.mjs';

const now = 1_800_000_000;
const address = () => Keypair.random().publicKey();
const scope = {
  phase: 'issuance', openedAt: now, until: now + 500, bookingValidUntil: now + 180,
  authority: address(), relayer: address(), contractId: PRIVATE_RX_CONTRACT_ID, issuanceId: '12'.repeat(32),
  doctor: { userId: 'did:privy:fixture-doctor', walletId: 'fixture-doctor', address: address() },
  patient: { userId: 'did:privy:fixture-patient', walletId: 'fixture-patient', address: address() },
  maxTotalFeeStroops: '10000000', steps: {
    attest: { requestId: '71000000-0000-4000-8000-000000000001', maxFeeStroops: '10000000' },
    consent: { requestId: '71000000-0000-4000-8000-000000000002', maxFeeStroops: '10000000' },
    mint: { requestId: '71000000-0000-4000-8000-000000000003', maxFeeStroops: '10000000' },
  },
};
const expected = { doctor: scope.doctor.address, patient: scope.patient.address, issuanceId: scope.issuanceId,
  validUntil: scope.bookingValidUntil, commitment: '34'.repeat(32), expiresAt: now + 1800 };
function envelope(step, resourceFee, { maxTime = scope.bookingValidUntil, source } = {}) {
  const signer = source ?? ({ attest: scope.authority, consent: scope.patient.address, mint: scope.doctor.address })[step];
  return new TransactionBuilder(new Account(signer, '10'), { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
    .setSorobanData(new SorobanDataBuilder().setResourceFee(resourceFee).build())
    .addOperation(privateRxInvocation(scope, step, expected)).setTimebounds(0, maxTime).build().toXDR();
}

test('each prescription quote counts the whole fee bump and preserves the booking time bound', async () => {
  for (const step of ['attest', 'consent', 'mint']) {
    const quote = await privateRxQuote(scope, step, envelope(step, '9800000'), expected, { preparedAt: now, now });
    assert.equal(quote.offeredFeeStroops, '10000000');
    assert.equal(quote.sponsorBaseFeeStroops, '100000');
    assert.equal(quote.validUntil, scope.bookingValidUntil);
    await assert.rejects(privateRxQuote(scope, step, envelope(step, '9800001'), expected, { preparedAt: now, now }), /private_rx_fee_budget_exceeded/);
  }
});

test('cannot quote a different source, issuance or time bound', async () => {
  const clock = { preparedAt: now, now };
  await assert.rejects(privateRxQuote(scope, 'consent', envelope('consent', '1', { source: scope.doctor.address }), expected, clock));
  await assert.rejects(privateRxQuote(scope, 'mint', envelope('mint', '1'), { ...expected, issuanceId: '56'.repeat(32) }, clock));
  await assert.rejects(privateRxQuote(scope, 'attest', envelope('attest', '1', { maxTime: scope.bookingValidUntil + 1 }), undefined, clock));
  await assert.rejects(privateRxQuote(scope, 'attest', envelope('attest', '1'), undefined, { preparedAt: now, now: scope.bookingValidUntil }));
});

test('a preview can quote but cannot reach the persistent budget or signer', async () => {
  let queries = 0;
  const preview = { ...scope, approved: false };
  const sponsorship = createPrivateRxSponsorship({ scope: preview, env: {}, now: () => now,
    client: { async query() { queries++; throw Error('unexpected_database_access'); } } });
  const unsigned = envelope('attest', '400000');
  const quote = await privateRxQuote(preview, 'attest', unsigned, undefined, { preparedAt: now, now });
  assert.equal(quote.offeredFeeStroops, '600000');
  await assert.rejects(sponsorship.reserve('attest', unsigned, undefined, { atomic: false, pinnedQuoteId: quote.quoteId }), /private_rx_scope_rejected/);
  assert.equal(queries, 0);
});
