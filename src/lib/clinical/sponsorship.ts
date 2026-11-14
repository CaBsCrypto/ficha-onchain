import 'server-only';
import { createHash } from 'node:crypto';
import type { PoolClient } from '@neondatabase/serverless';
import { FeeBumpTransaction, Keypair, Networks, Transaction, TransactionBuilder } from '@stellar/stellar-sdk';
import type { ClinicalActor, ClinicalAction, ClinicalExpected } from '@/types/clinical';
import { PrivateFlowError } from '@/lib/private-config';
import { assertSponsorshipPath, createSponsorshipService, loadSponsorshipConfig, quoteSponsorship, SqlSponsorshipStore,
  SponsorshipError, verifySponsorshipPrincipal, bindingDigest, quoteDigest, quoteExpiresAt, CLINICAL_QUOTE_MAX_AGE_SECONDS, type SponsorshipPrincipal } from '@/lib/sponsorship';
import { clinicalWebFeeQuote, CLINICAL_WEB_SPONSOR_BASE_FEE } from '../../../scripts/lib/clinical-web-fee-policy.mjs';
import { assertClinicalUnsigned } from './chain';
import { CLINICAL_ID } from './config';
type Row = Record<string, any>;
const path = '/api/private-clinical-operations';
const now = () => Math.floor(Date.now() / 1000);
function translate(error: unknown): never {
  if (error instanceof PrivateFlowError) throw error;
  const code = error instanceof SponsorshipError ? error.code : '';
  if (['sponsorship_quote_expired','sponsorship_envelope_expired'].includes(code)) throw new PrivateFlowError('clinical_quote_expired', 409);
  if (['sponsorship_price_blocked','sponsorship_daily_limit'].includes(code)) throw new PrivateFlowError('clinical_sponsorship_budget_exceeded', 409);
  throw new PrivateFlowError('clinical_sponsorship_unavailable', 503);
}
async function safe<T>(work: () => Promise<T>): Promise<T> { try { return await work(); } catch (e) { return translate(e); } }
export function assertClinicalSponsorshipConfigured() {
  try { assertSponsorshipPath(path, { method: 'POST', purpose: 'spend' }); } catch (e) { translate(e); }
}
function services(client?: PoolClient) {
  // reserve is the LAST stage after RPC validation. Bucket locks live only
  // through the following intent INSERT + draft binding + outer COMMIT.
  const store = new SqlSponsorshipStore(client ? async () => ({
    query: (sql: string, values?: unknown[]) => client.query(sql === 'BEGIN' ? 'SAVEPOINT sponsorship_reserve' :
      sql === 'COMMIT' ? 'RELEASE SAVEPOINT sponsorship_reserve' :
      sql === 'ROLLBACK' ? 'ROLLBACK TO SAVEPOINT sponsorship_reserve' : sql, values),
    release() { /* The clinical transaction owns this connection. */ },
  }) : undefined);
  return { store, service: createSponsorshipService({ store, policy: loadSponsorshipConfig().policy, now }) };
}
async function principal(actor: ClinicalActor, id: string, action: ClinicalAction, expected: ClinicalExpected, unsignedXdr: string, payer?: string): Promise<SponsorshipPrincipal> {
  const tx = TransactionBuilder.fromXDR(unsignedXdr, Networks.TESTNET);
  if (!(tx instanceof Transaction)) throw new Error();
  assertClinicalUnsigned(tx, actor.address, action, expected);
  const invocation = tx.operations[0];
  if (invocation.type !== 'invokeHostFunction') throw new Error();
  return verifySponsorshipPrincipal(async () => ({
    requestId: id, network: 'testnet', sourceAddress: actor.address,
    sponsorAddress: payer ?? Keypair.fromSecret(process.env.RELAYER_SECRET ?? '').publicKey(),
    patientAddress: expected.patient, actorId: actor.userId, walletId: actor.walletId, contractId: CLINICAL_ID, action,
    operationFingerprint: createHash('sha256').update(invocation.func.toXDR('base64')).digest('hex'),
    ...(action === 'append_version' ? { encounterId: expected.entryId } : {}),
    intent: action === 'set_permissions' && expected.canRead === false && expected.canAppend === false ? 'revoke' : 'standard',
  }));
}
export async function reserveClinicalSponsorship(actor: ClinicalActor, id: string, action: ClinicalAction, expected: ClinicalExpected, unsigned: Transaction, client: PoolClient) {
  return safe(async () => {
    assertClinicalSponsorshipConfigured();
    const p = await principal(actor, id, action, expected, unsigned.toXDR()), { service } = services(client), at = now();
    const quote = quoteSponsorship(p, { unsignedXdr: unsigned.toXDR(), sponsorBaseFeeStroops: CLINICAL_WEB_SPONSOR_BASE_FEE, preparedAt: at, now: at,
      validUntil: Math.min(at + CLINICAL_QUOTE_MAX_AGE_SECONDS, Number(unsigned.timeBounds?.maxTime)) });
    return service.reserve(p, quote);
  });
}
export async function assertClinicalSponsorshipSign(actor: ClinicalActor, row: Row) {
  return safe(async () => {
    assertClinicalSponsorshipConfigured();
    const p = await principal(actor, row.id, row.action, row.expected, row.unsigned_xdr);
    await services().service.assertReady(p, 'sign');
  });
}
/** After the clinical COMMIT, persist the same signed hash before the first or any repeated broadcast. */
export async function bindClinicalSponsorshipSubmission(actor: ClinicalActor, row: Row) {
  return safe(async () => {
    assertClinicalSponsorshipConfigured();
    const tx = TransactionBuilder.fromXDR(row.signed_xdr, Networks.TESTNET);
    if (!(tx instanceof FeeBumpTransaction) || tx.hash().toString('hex') !== row.transaction_hash) throw new Error();
    const p = await principal(actor, row.id, row.action, row.expected, row.unsigned_xdr, tx.feeSource);
    const signedAt = Math.floor(new Date(row.updated_at).getTime() / 1000);
    if (!Number.isSafeInteger(signedAt)) throw new Error();
    const { service } = services();
    const result = await service.bindSubmission(p, tx.innerTransaction.toXDR(), { signedAt });
    if (result.transactionHash !== row.transaction_hash) throw new Error();
    await service.assertReady(p, 'submit');
  });
}
export async function cancelClinicalSponsorship(actor: ClinicalActor, row: Row) {
  return safe(async () => {
    const { store, service } = services(), saved = await store.get(row.id);
    if (!saved) return; // A historical operation does not acquire new spending authority.
    const p = await principal(actor, row.id, row.action, row.expected, row.unsigned_xdr, saved.binding.sponsorAddress);
    await service.cancelUnsigned(p);
  });
}
/** Release only a journal that proves no broadcast began. Caller already verified
 * the saved signed envelope, a post-expiry NOT_FOUND and the absent contract nonce.
 * No signed/submitted/settled sponsorship journal can take this path. */
export async function cancelExpiredNeverSubmittedSponsorship(actor: ClinicalActor, row: Row, client: PoolClient) {
  return safe(async () => {
    if (row.state !== 'submitted' || !row.signed_xdr || !row.transaction_hash || Number(row.expires_at) + 60 > now()) return false;
    const { store, service } = services(client), saved = await store.get(row.id);
    if (!saved || saved.state !== 'reserved' || saved.transactionHash !== null || saved.signedInnerDigest !== null ||
        saved.signedAt !== null || saved.chargedStroops !== null || saved.outcome !== null || saved.ledger !== null) return false;
    const p = await principal(actor, row.id, row.action, row.expected, row.unsigned_xdr, saved.binding.sponsorAddress);
    const tx = TransactionBuilder.fromXDR(row.unsigned_xdr, Networks.TESTNET);
    if (!(tx instanceof Transaction) || bindingDigest(saved.binding) !== bindingDigest(p) ||
        saved.quote.unsignedHash !== createHash('sha256').update(row.unsigned_xdr, 'utf8').digest('hex') ||
        saved.quote.signingHash !== row.signing_hash || saved.quote.maxTime !== Number(row.expires_at) ||
        saved.quote.offeredFeeStroops !== clinicalWebFeeQuote(tx).sponsored.toString()) return false;
    // The service atomically rechecks reserved + no signed hash under bucket locks.
    await service.cancelUnsigned(p); return true;
  });
}

export async function reconcileClinicalSponsorship(actor: ClinicalActor, row: Row, receipt: Row) {
  return safe(async () => {
    const { store, service } = services(), saved = await store.get(row.id);
    if (!saved) return;
    const p = await principal(actor, row.id, row.action, row.expected, row.unsigned_xdr, saved.binding.sponsorAddress);
    if (saved.binding.actorId !== p.actorId || saved.binding.walletId !== p.walletId || saved.transactionHash !== row.transaction_hash) throw new Error();
    await service.reconcile(row.id, async hash => ({
      transactionHash: hash, status: receipt.status,
      ...(['SUCCESS','FAILED'].includes(receipt.status) ? { feeChargedStroops: receipt.resultXdr.feeCharged().toString(), ledger: receipt.ledger } : {}),
    }));
  });
}

/** Read only the original verified reservation. Expired quotes remain expired;
 * GET does not update a policy, reservation, envelope or timestamp. */
export async function clinicalSponsorshipQuoteView(actor: ClinicalActor, row: Row, client?: PoolClient) {
  return safe(async () => {
    if (row.state !== 'awaiting_signature' || row.signed_xdr || row.transaction_hash) return null;
    if (row.actor_user_id !== actor.userId || row.wallet_id !== actor.walletId || row.source_wallet !== actor.address ||
        row.contract_id !== CLINICAL_ID || row.network !== 'testnet') throw new Error();
    const { store } = services(client), saved = await store.get(row.id);
    if (!saved) return null;
    if (saved.state !== 'reserved' || saved.transactionHash !== null || saved.signedInnerDigest !== null) throw new Error();
    const tx = TransactionBuilder.fromXDR(row.unsigned_xdr, Networks.TESTNET);
    if (!(tx instanceof Transaction) || tx.signatures.length) throw new Error();
    assertClinicalUnsigned(tx, actor.address, row.action, row.expected);
    const p = await principal(actor, row.id, row.action, row.expected, row.unsigned_xdr, saved.binding.sponsorAddress);
    const q = saved.quote, fee = clinicalWebFeeQuote(tx), at = now();
    const { quoteId, ...quoteData } = q;
    if (quoteId !== quoteDigest(quoteData) || bindingDigest(saved.binding) !== bindingDigest(p) || q.binding !== bindingDigest(p) ||
        q.unsignedHash !== createHash('sha256').update(row.unsigned_xdr, 'utf8').digest('hex') ||
        q.signingHash !== tx.hash().toString('hex') || row.signing_hash !== q.signingHash ||
        q.maxTime !== Number(tx.timeBounds?.maxTime) || q.maxTime !== Number(row.expires_at) ||
        q.sponsorBaseFeeStroops !== CLINICAL_WEB_SPONSOR_BASE_FEE ||
        q.offeredFeeStroops !== fee.sponsored.toString() || q.resourceFeeStroops !== fee.resource.toString() ||
        !Number.isSafeInteger(q.preparedAt) || q.preparedAt > at || q.preparedAt < 1 ||
        q.maxTime <= q.preparedAt || q.maxTime > q.preparedAt + 600) throw new Error();
    const expiresAt = quoteExpiresAt(q);
    return Object.freeze({ maxFeeStroops: q.offeredFeeStroops, quotePreparedAt: q.preparedAt, quoteExpiresAt: expiresAt,
      ...(q.validUntil === undefined ? {} : { quoteValidUntil: q.validUntil }) });
  });
}
