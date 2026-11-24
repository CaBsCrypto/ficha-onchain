import {
  Address, BASE_FEE, Contract, Keypair, Networks, StrKey, Transaction, TransactionBuilder, rpc, xdr,
} from '@stellar/stellar-sdk';
import { getDb, getDbConnection, sqlForConnection, type Sql } from '@/lib/db';
import { assertClinicalLinksPilot, getClinicalLinksPilotPartnerOrigin } from './config';

const RPC_URL = 'https://soroban-testnet.stellar.org';
const HEX_32 = /^[0-9a-f]{64}$/;
const MAX_ATTEMPTS = 5;
const TIMEOUT_SECONDS = 120;
const MAX_FEE = BigInt(1_000_000);

type AnchorStatus = 'idle' | 'busy' | 'pending' | 'confirmed' | 'unavailable';
type AnchorDeployment = { contract: string; publisher: string; wasmHash: string };
type AnchorRpc = Pick<rpc.Server, 'getNetwork' | 'getLedgerEntries' | 'getAccount' |
  'prepareTransaction' | 'getTransaction' | 'sendTransaction'>;
type AnchorJob = {
  commitment: string;
  attempts: number;
  transaction_hash: string | null;
  transaction_xdr: string | null;
};

const unavailable = () => new Error('clinical_link_anchor_unavailable');

function deployment(): AnchorDeployment {
  const contract = process.env.TRUSTLEAF_CLINICAL_LINK_ANCHOR_CONTRACT ?? '';
  const publisher = process.env.TRUSTLEAF_CLINICAL_LINK_ANCHOR_PUBLISHER ?? '';
  const wasmHash = process.env.TRUSTLEAF_CLINICAL_LINK_ANCHOR_WASM_SHA256 ?? '';
  if (process.env.NEXT_PUBLIC_STELLAR_NETWORK !== 'testnet' || !StrKey.isValidContract(contract) ||
      !StrKey.isValidEd25519PublicKey(publisher) || !HEX_32.test(wasmHash)) throw unavailable();
  return { contract, publisher, wasmHash };
}

function commitmentScVal(commitment: string) {
  if (!HEX_32.test(commitment) || /^0+$/.test(commitment)) throw unavailable();
  return xdr.ScVal.scvBytes(Buffer.from(commitment, 'hex'));
}

function uniqueData(entries: rpc.Api.LedgerEntryResult[], key: xdr.LedgerKey, ledger: number) {
  const matches = entries.filter(entry => entry.key.toXDR().equals(key.toXDR()));
  if (!matches.length) return null;
  const [entry] = matches;
  if (matches.length !== 1 || !Number.isSafeInteger(entry.liveUntilLedgerSeq) ||
      entry.liveUntilLedgerSeq! < ledger || entry.val.switch().name !== 'contractData') throw unavailable();
  const data = entry.val.contractData();
  const expected = key.contractData();
  if (!data.contract().toXDR().equals(expected.contract().toXDR()) ||
      !data.key().toXDR().equals(expected.key().toXDR()) || data.durability().name !== 'persistent') throw unavailable();
  return data.val();
}

export function createClinicalLinkAnchorChain(deployed: AnchorDeployment, server: AnchorRpc) {
  const contract = new Contract(deployed.contract);
  const address = new Address(deployed.contract).toScAddress();
  const publisher = new Address(deployed.publisher).toScVal();
  const ledgerKey = (key: xdr.ScVal) => xdr.LedgerKey.contractData(new xdr.LedgerKeyContractData({
    contract: address, key, durability: xdr.ContractDataDurability.persistent(),
  }));
  const instanceKey = ledgerKey(xdr.ScVal.scvLedgerKeyContractInstance());

  async function inspect(commitment?: string) {
    if ((await server.getNetwork()).passphrase !== Networks.TESTNET) throw unavailable();
    const dataKey = commitment === undefined ? null : ledgerKey(commitmentScVal(commitment));
    const keys = dataKey ? [instanceKey, dataKey] : [instanceKey];
    const { entries, latestLedger } = await server.getLedgerEntries(...keys);
    if (!Number.isSafeInteger(latestLedger) || latestLedger < 1 || entries.length > keys.length) throw unavailable();
    const value = uniqueData(entries, instanceKey, latestLedger);
    if (value?.switch().name !== 'scvContractInstance') throw unavailable();
    const instance = value.instance();
    const executable = instance.executable();
    const publisherKey = xdr.ScVal.scvSymbol('publisher').toXDR();
    const publisherValue = instance.storage()?.find(entry => entry.key().toXDR().equals(publisherKey))?.val();
    if (executable.switch().name !== 'contractExecutableWasm' ||
        executable.wasmHash().toString('hex') !== deployed.wasmHash ||
        !publisherValue?.toXDR().equals(publisher.toXDR())) throw unavailable();
    const data = dataKey && uniqueData(entries, dataKey, latestLedger);
    return data?.switch().name === 'scvBool' && data.b() === true;
  }

  function anchorOperation(commitment: string) {
    return contract.call('anchor', commitmentScVal(commitment));
  }

  function assertTransaction(tx: Transaction, commitment: string) {
    const envelope = tx.toEnvelope().v1().tx();
    const [operation] = envelope.operations();
    if (tx.source !== deployed.publisher || tx.operations.length !== 1 || !tx.timeBounds ||
        tx.timeBounds.minTime !== '0' || !/^\d+$/.test(tx.timeBounds.maxTime) ||
        Number(tx.timeBounds.maxTime) <= 0 || BigInt(tx.fee) > MAX_FEE || operation.sourceAccount() ||
        operation.body().switch().name !== 'invokeHostFunction' || envelope.ext().switch() !== 1) throw unavailable();
    const dataExtension = envelope.ext().sorobanData().ext();
    if (dataExtension.switch() !== 0 && (dataExtension.switch() !== 1 ||
        dataExtension.resourceExt().archivedSorobanEntries().length > 0)) throw unavailable();
    const invocation = operation.body().invokeHostFunctionOp();
    const expected = anchorOperation(commitment).body().invokeHostFunctionOp().hostFunction();
    if (!invocation.hostFunction().toXDR().equals(expected.toXDR()) || invocation.auth().length > 1) throw unavailable();
    for (const authorization of invocation.auth()) {
      const root = authorization.rootInvocation();
      const fn = root.function();
      if (authorization.credentials().switch().name !== 'sorobanCredentialsSourceAccount' || root.subInvocations().length ||
          fn.switch().name !== 'sorobanAuthorizedFunctionTypeContractFn' ||
          !fn.contractFn().toXDR().equals(expected.invokeContract().toXDR())) throw unavailable();
    }
  }

  return {
    contains: (commitment: string) => inspect(commitment),

    async prepare(commitment: string, signer: Keypair) {
      await inspect();
      if (signer.publicKey() !== deployed.publisher) throw unavailable();
      const account = await server.getAccount(deployed.publisher);
      const unsigned = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
        .addOperation(anchorOperation(commitment)).setTimeout(TIMEOUT_SECONDS).build();
      const prepared = await server.prepareTransaction(unsigned);
      assertTransaction(prepared, commitment);
      if (prepared.signatures.length || prepared.sequence !== unsigned.sequence ||
          prepared.timeBounds!.maxTime !== unsigned.timeBounds!.maxTime) throw unavailable();
      prepared.sign(signer);
      return { txHash: prepared.hash().toString('hex'), txXdr: prepared.toXDR() };
    },

    async reconcile(job: AnchorJob, maySubmit: () => Promise<boolean>) {
      const tx = TransactionBuilder.fromXDR(job.transaction_xdr!, Networks.TESTNET);
      if (!(tx instanceof Transaction) || !job.transaction_hash || tx.hash().toString('hex') !== job.transaction_hash) throw unavailable();
      assertTransaction(tx, job.commitment);
      if (tx.signatures.length !== 1 || !Keypair.fromPublicKey(deployed.publisher).verify(tx.hash(), tx.signatures[0].signature())) throw unavailable();
      if ((await server.getNetwork()).passphrase !== Networks.TESTNET) throw unavailable();
      const receipt = await server.getTransaction(job.transaction_hash);
      if (receipt.status !== rpc.Api.GetTransactionStatus.NOT_FOUND) {
        if (receipt.txHash !== job.transaction_hash || !receipt.envelopeXdr.toXDR().equals(tx.toEnvelope().toXDR())) throw unavailable();
        if (receipt.status === rpc.Api.GetTransactionStatus.FAILED) return 'retry';
        if (!await inspect(job.commitment)) throw unavailable();
        return 'confirmed';
      }
      const ledgerTime = Number(receipt.latestLedgerCloseTime);
      if (!Number.isSafeInteger(ledgerTime) || ledgerTime < 1) throw unavailable();
      const deadline = Number(tx.timeBounds!.maxTime);
      if (ledgerTime > deadline) return 'retry';
      if (Date.now() / 1000 < deadline) {
        await inspect();
        if (await maySubmit()) await server.sendTransaction(tx);
      }
      return 'pending';
    },
  };
}

function connect() {
  assertClinicalLinksPilot();
  const configured = deployment();
  return { configured, chain: createClinicalLinkAnchorChain(configured, new rpc.Server(RPC_URL, { timeout: 6_000 })) };
}

export async function readClinicalLinkAnchor(commitment: string): Promise<'verified' | 'unavailable'> {
  try {
    return await connect().chain.contains(commitment) ? 'verified' : 'unavailable';
  } catch {
    return 'unavailable';
  }
}

const activeGrant = "b.status = 'active' AND b.expires_at > clock_timestamp() AND p.active AND p.origin = $1";
const jobJoins = `JOIN clinical_partner_links l ON l.link_ref = a.link_ref
  JOIN clinical_partner_bindings b USING (binding_id, partner_id)
  JOIN clinical_link_partners p ON p.partner_id = l.partner_id`;

async function nextJob(sql: Sql, origin: string) {
  const [job] = await sql.query<AnchorJob>(`SELECT a.commitment, a.attempts, a.transaction_hash, a.transaction_xdr
    FROM clinical_link_anchors a ${jobJoins}
    WHERE a.state = 'pending' AND (a.transaction_xdr IS NOT NULL OR (a.available_at <= NOW() AND ${activeGrant}))
    ORDER BY (a.transaction_xdr IS NOT NULL) DESC, a.available_at, a.commitment LIMIT 1`, [origin]);
  return job;
}

async function retry(sql: Sql, job: AnchorJob): Promise<AnchorStatus> {
  const terminal = job.attempts >= MAX_ATTEMPTS;
  await sql.query(`UPDATE clinical_link_anchors SET state = $2, transaction_xdr = NULL, transaction_hash = NULL,
    available_at = NOW() + INTERVAL '1 minute' WHERE commitment = $1 AND state = 'pending'`,
  [job.commitment, terminal ? 'unavailable' : 'pending']);
  return terminal ? 'unavailable' : 'pending';
}

export async function runClinicalLinkAnchor(): Promise<AnchorStatus> {
  const { configured, chain } = connect();
  const origin = getClinicalLinksPilotPartnerOrigin();
  const signer = Keypair.fromSecret(process.env.TRUSTLEAF_CLINICAL_LINK_ANCHOR_SECRET ?? '');
  if (signer.publicKey() !== configured.publisher) throw unavailable();
  const durable = getDb();
  const connection = await getDbConnection();
  const locked = sqlForConnection(connection);
  let discard = false;
  try {
    await locked.query('BEGIN');
    // Transaction-scoped lock also works through the Neon transaction pooler.
    const [lock] = await locked.query<{ acquired: boolean }>(
      "SELECT pg_try_advisory_xact_lock(hashtextextended('clinical-link-anchor:' || $1::text, 0)) AS acquired",
      [configured.publisher]);
    if (!lock.acquired) return 'busy';
    let job = await nextJob(locked, origin);
    if (!job) return 'idle';

    if (!job.transaction_xdr) {
      try {
        const prepared = await chain.prepare(job.commitment, signer);
        // Commit the exact envelope before network submission, on a separate connection.
        [job] = await durable.query<AnchorJob>(`UPDATE clinical_link_anchors SET transaction_xdr = $2,
          transaction_hash = $3, attempts = attempts + 1 WHERE commitment = $1 AND state = 'pending'
          RETURNING commitment, attempts, transaction_hash, transaction_xdr`, [job.commitment, prepared.txXdr, prepared.txHash]);
      } catch {
        if (!job) throw unavailable();
        await durable.query(`UPDATE clinical_link_anchors SET available_at = NOW() + INTERVAL '1 minute'
          WHERE commitment = $1 AND state = 'pending' AND transaction_xdr IS NULL`, [job.commitment]);
        return 'unavailable';
      }
    }

    const outcome = await chain.reconcile(job, async () => {
      const rows = await locked.query(`SELECT b.binding_id FROM clinical_link_anchors a ${jobJoins}
        WHERE a.commitment = $2 AND ${activeGrant} FOR SHARE OF b, p`, [origin, job.commitment]);
      return rows.length === 1;
    });
    if (outcome === 'retry') return await retry(durable, job);
    if (outcome === 'confirmed') {
      await durable.query(`UPDATE clinical_link_anchors SET state = 'confirmed', transaction_xdr = NULL,
        confirmed_at = NOW() WHERE commitment = $1 AND state = 'pending'`, [job.commitment]);
    }
    return outcome;
  } finally {
    try { await locked.query('ROLLBACK'); } catch { discard = true; }
    connection.release(discard);
  }
}
