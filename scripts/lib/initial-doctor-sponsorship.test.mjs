import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { Account, Address, Contract, Keypair, Networks, SorobanDataBuilder, TransactionBuilder, nativeToScVal, xdr } from '@stellar/stellar-sdk';
import { createInitialDoctorSponsorship } from './initial-doctor-sponsorship.mjs';
import { sha256 } from './sponsorship-domain.mjs';
import { PRIVATE_REGISTRY_ID } from './private-registry.mjs';

const NOW = 1800000000;
const syntheticKey = n => Keypair.fromRawEd25519Seed(Buffer.alloc(32, n));
const authority = syntheticKey(31), doctor = syntheticKey(32), payer = syntheticKey(33), patient = syntheticKey(34);
const env = {
  TRUSTLEAF_SPONSORSHIP_ENABLED: 'true',
  TRUSTLEAF_SPONSORSHIP_PATHS: '/api/admin/doctor-authorizations',
  TRUSTLEAF_SPONSORSHIP_SPONSOR_DAILY_LIMIT_STROOPS: '20000000',
  TRUSTLEAF_SPONSORSHIP_PATIENT_DAILY_LIMIT_STROOPS: '20000000',
  TRUSTLEAF_SPONSORSHIP_MAX_FEE_STROOPS: '10000000',
  TRUSTLEAF_SPONSORSHIP_EMERGENCY_RESERVE_STROOPS: '0',
  TRUSTLEAF_SPONSORSHIP_ENTRY_LIMIT_STROOPS: '10000000',
};

// Simulates only the guarded ledger queries used by this adapter. No DB or RPC.
class Ledger {
  rows = new Map();
  buckets = new Map();
  open = false;
  saved = null;
  async query(sql, args = []) {
    const [key, id, day] = args;
    if (sql === 'BEGIN') {
      assert.equal(this.open, false);
      this.open = true;
      this.saved = structuredClone([this.rows, this.buckets]);
    } else if (sql === 'COMMIT' || sql === 'ROLLBACK') {
      assert.equal(this.open, true);
      if (sql === 'ROLLBACK') [this.rows, this.buckets] = this.saved;
      this.open = false;
    } else if (/^(SAVEPOINT|RELEASE SAVEPOINT|ROLLBACK TO SAVEPOINT) initial_authorization_sponsorship$/.test(sql)) {
      assert.equal(this.open, true);
    } else if (sql.startsWith('SELECT request_id')) {
      return { rows: this.rows.has(key) ? [structuredClone(this.rows.get(key))] : [] };
    } else if (sql.startsWith('INSERT INTO sponsorship_daily_buckets')) {
      const bucketId = [key, id, day].join('/');
      if (!this.buckets.has(bucketId)) this.buckets.set(bucketId, {
        bucket_key: id, utc_day: day, limit_stroops: args[3], reserved_stroops: '0', spent_stroops: '0',
      });
    } else if (sql.startsWith('SELECT bucket_key')) {
      return { rows: [structuredClone(this.buckets.get([key, id, day].join('/')))] };
    } else if (sql.startsWith('UPDATE sponsorship_daily_buckets')) {
      const bucket = this.buckets.get([key, id, day].join('/'));
      Object.assign(bucket, { reserved_stroops: args[3], spent_stroops: args[4] });
    } else if (sql.startsWith('INSERT INTO sponsorship_reservations')) {
      assert.equal(this.rows.has(key), false);
      this.rows.set(key, { request_id: key, network: id, utc_day: day, state: args[3],
        transaction_hash: args[4], payload: JSON.parse(args[5]) });
    } else if (sql.startsWith('UPDATE sponsorship_reservations')) {
      Object.assign(this.rows.get(key), { state: id, transaction_hash: day, payload: JSON.parse(args[3]) });
    } else {
      assert.match(sql, /^SELECT pg_advisory_xact_lock/);
    }
    return { rows: [] };
  }
}

function fixture() {
  const ledger = new Ledger();
  let active = true;
  const job = { id: '00000000-0000-4000-8000-000000000001', dossier_id: '00000000-0000-4000-8000-000000000002',
    action: 'authorize', method: 'authorize_doctor', expected_version: 0, target_version: 1, network: 'testnet',
    contract_id: PRIVATE_REGISTRY_ID, requested_by: 'did:privy:test_admin', wallet: doctor.publicKey(),
    commitment: '01'.repeat(32), valid_until: NOW + 30 * 86400, transaction_hash: null, prepared_xdr: null };
  const operation = new Contract(job.contract_id).call(job.method, new Address(job.wallet).toScVal(),
    nativeToScVal(Buffer.from(job.commitment, 'hex')), nativeToScVal(BigInt(job.valid_until), { type: 'u64' }));
  const unsigned = new TransactionBuilder(new Account(authority.publicKey(), '100'), { fee: '100', networkPassphrase: Networks.TESTNET })
    .addOperation(operation).setTimebounds(0, NOW + 180).setSorobanData(new SorobanDataBuilder().setResourceFee('45757').build()).build();
  const bindingFor = candidate => {
    assert.equal(candidate.id, job.id);
    assert.equal(candidate.wallet, job.wallet);
    return { requestId: job.id, network: 'testnet', sourceAddress: authority.publicKey(), sponsorAddress: payer.publicKey(),
      patientAddress: patient.publicKey(), actorId: job.requested_by, walletId: 'registry-admin:' + authority.publicKey(),
      contractId: job.contract_id, action: job.method, encounterId: job.dossier_id, intent: 'standard',
      operationFingerprint: sha256(operation.body().invokeHostFunctionOp().hostFunction().toXDR('base64')) };
  };
  const create = (overrides = {}) => createInitialDoctorSponsorship({ client: ledger, env, now: () => NOW,
    bindingFor, assertOpen: () => assert.ok(active, 'window closed'), maxFeeStroops: '10000000', ...overrides });
  return { job, unsigned, ledger, create, close: () => { active = false; }, record: () => ledger.rows.get(job.id)?.payload };
}

function receipt(outer, status, paid = '1500') {
  const success = status === 'SUCCESS', returnValue = xdr.ScVal.scvVoid(), events = [];
  const successHash = createHash('sha256').update(new xdr.InvokeHostFunctionSuccessPreImage({ returnValue, events }).toXDR()).digest();
  const operation = success ? xdr.OperationResult.opInner(xdr.OperationResultTr.invokeHostFunction(
    xdr.InvokeHostFunctionResult.invokeHostFunctionSuccess(successHash))) : xdr.OperationResult.opBadAuth();
  const result = new xdr.InnerTransactionResult({ feeCharged: xdr.Int64.fromString('100'),
    result: success ? xdr.InnerTransactionResultResult.txSuccess([operation]) : xdr.InnerTransactionResultResult.txFailed([operation]),
    ext: new xdr.InnerTransactionResultExt(0) });
  const pair = new xdr.InnerTransactionResultPair({ transactionHash: outer.innerTransaction.hash(), result });
  return { status, feeBump: true, ledger: 42, envelopeXdr: outer.toEnvelope(), returnValue,
    resultXdr: new xdr.TransactionResult({ feeCharged: xdr.Int64.fromString(paid),
      result: success ? xdr.TransactionResultResult.txFeeBumpInnerSuccess(pair) : xdr.TransactionResultResult.txFeeBumpInnerFailed(pair),
      ext: new xdr.TransactionResultExt(0) }),
    resultMetaXdr: new xdr.TransactionMeta(4, new xdr.TransactionMetaV4({ ext: new xdr.ExtensionPoint(0),
      txChangesBefore: [], txChangesAfter: [], operations: [new xdr.OperationMetaV2({ ext: new xdr.ExtensionPoint(0), changes: [], events })],
      sorobanMeta: success ? new xdr.SorobanTransactionMetaV2({ ext: new xdr.SorobanTransactionMetaExt(0), returnValue }) : null,
      events: [], diagnosticEvents: [] })) };
}

test('rejects other actions, disabled paths and a quote over the specific cap before reserving', async () => {
  const f = fixture();
  await assert.rejects(f.create().reserve({ ...f.job, action: 'renew' }, f.unsigned), /initial_doctor_sponsorship_rejected/);
  await assert.rejects(f.create({ env: { ...env, TRUSTLEAF_SPONSORSHIP_PATHS: '/api/private-clinical-operations' } })
    .reserve(f.job, f.unsigned), /sponsorship_path_disabled/);
  await assert.rejects(f.create({ maxFeeStroops: '4045756' }).reserve(f.job, f.unsigned), /initial_doctor_sponsorship_rejected/);
  assert.equal(f.ledger.rows.size, 0);
});

test('releases an owned unsigned reservation when a closed window prevents invoking the signer', async () => {
  const f = fixture(), adapter = f.create();
  await adapter.reserve(f.job, f.unsigned);
  f.close();
  await assert.rejects(adapter.beforeSign(f.job), /window closed/);
  await adapter.cancelBeforeSigning(f.job);
  assert.equal(f.record().state, 'released');
  assert.ok([...f.ledger.buckets.values()].every(bucket => bucket.reserved_stroops === '0'));
});

test('retains an uncertain signer reservation and rejects a second reservation after restart', async () => {
  const f = fixture(), adapter = f.create();
  const quotes = await Promise.allSettled([adapter.reserve(f.job, f.unsigned), adapter.reserve(f.job, f.unsigned)]);
  assert.equal(quotes.filter(item => item.status === 'fulfilled').length, 1);
  await adapter.beforeSign(f.job);
  await adapter.cancelBeforeSigning(f.job);
  assert.equal(f.record().state, 'reserved');
  await assert.rejects(f.create().reserve(f.job, f.unsigned), /initial_doctor_sponsorship_rejected/);
  assert.equal(f.ledger.rows.size, 1);
});

for (const status of ['SUCCESS', 'FAILED']) {
  test('binds the exact signed envelope and settles a canonical ' + status + ' receipt once after expiry', async () => {
    const f = fixture(), adapter = f.create();
    await adapter.reserve(f.job, f.unsigned);
    await adapter.beforeSign(f.job);
    const inner = TransactionBuilder.fromXDR(f.unsigned.toXDR(), Networks.TESTNET);
    inner.sign(authority);
    const outer = TransactionBuilder.buildFeeBumpTransaction(payer, '2000000', inner, Networks.TESTNET);
    outer.sign(payer);
    const prepared = { xdr: outer.toXDR(), hash: outer.hash().toString('hex'), signedAt: NOW };
    await f.ledger.query('BEGIN');
    await adapter.persistPrepared(f.job, prepared);
    await f.ledger.query('COMMIT');
    const job = { ...f.job, prepared_xdr: prepared.xdr, transaction_hash: prepared.hash };
    await adapter.beforeSubmit(job);
    f.close();
    const recovery = f.create();
    await assert.rejects(recovery.beforeSubmit(job), /window closed/);
    await recovery.reconcile(job, { status: 'NOT_FOUND' });
    assert.equal(f.record().state, 'submitted');
    await assert.rejects(recovery.reconcile(job, { ...receipt(outer, status), hash: '01'.repeat(32) }), /initial_doctor_sponsorship_rejected/);
    await assert.rejects(recovery.reconcile(job, receipt(outer, status, '4045758')), /initial_doctor_sponsorship_rejected/);
    assert.equal(f.record().state, 'submitted');
    await recovery.reconcile(job, receipt(outer, status));
    await recovery.reconcile(job, receipt(outer, status));
    assert.equal(f.record().state, 'settled');
    assert.equal(f.record().outcome, status);
    assert.equal(f.record().chargedStroops, '1500');
    assert.ok([...f.ledger.buckets.values()].every(bucket => bucket.reserved_stroops === '0' && bucket.spent_stroops === '1500'));
  });
}
