import { afterEach, expect, it, vi } from 'vitest';
import { syntheticPdf } from '../../scripts/fixtures/clinical-files.mjs';
import { createHash } from 'node:crypto';
import { Account, Address, FeeBumpTransaction, Keypair, Networks, SorobanDataBuilder, Transaction, TransactionBuilder, nativeToScVal, scValToNative, xdr } from '@stellar/stellar-sdk';
import { CLINICAL_CONTRACT, CLINICAL_WASM } from '@/lib/clinical/chain';
import { PRIVATE_ADMIN, PRIVY_APP, REGISTRY_PRIVATE, RX_PRIVATE } from '@/lib/private-config';
import type { ClinicalOperation, ClinicalPrepareRequest, ClinicalSnapshot } from '@/types/clinical';
import { resolveClinicalActor } from '@/lib/clinical/identity';
import { clinicalKeyring } from '@/lib/clinical/keys';
import { createClinicalChainReader } from '../../scripts/lib/clinical-chain-read.mjs';
import { clinicalNeonStore } from '../../scripts/lib/clinical-neon-store.mjs';
import { readClinicalVersion } from '../../scripts/lib/clinical-read.mjs';

const adapters = vi.hoisted(() => ({ sql: null as any, client: null as any, rpc: null as any, privy: null as any }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({ getDb: () => adapters.sql, getDbConnection: async () => adapters.client }));
vi.mock('@privy-io/server-auth', () => ({ PrivyClient: class { constructor() { return adapters.privy; } } }));
vi.mock('@privy-io/server-auth/wallet-api', () => ({ generateAuthorizationSignature: () => 'local-simulated-owner-authorization' }));
vi.mock('@stellar/stellar-sdk', async original => {
  const actual = await original<typeof import('@stellar/stellar-sdk')>();
  return { ...actual, rpc: { ...actual.rpc, Server: class { constructor() { return adapters.rpc; } } } };
});
import { POST as prepare } from '@/app/api/private-clinical-operations/route';
import { CLINICAL_PREPARE_CAPABILITY_HEADER, CLINICAL_PREPARE_CAPABILITY_VERSION } from '@/lib/clinical/client-contract';
import { POST as sign } from '@/app/api/private-clinical-operations/[id]/sign/route';
import { POST as retry } from '@/app/api/private-clinical-operations/[id]/retry/route';
import { GET as inspect } from '@/app/api/private-clinical-operations/[id]/route';
import { GET as history } from '@/app/api/private-clinical-history/route';
import { GET as document } from '@/app/api/private-clinical-history/document/route';

// One stateful local integration. SQL, Privy and RPC are simulated adapters;
// routes, identity binding, operations, XDR/signature validation, cipher/store,
// both chain readers and history/document services execute their real code.
// No HTTP provider, actual database, deployed signer or Stellar transaction.
const patient = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 71));
const doctor = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 72));
const other = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 73));
const payer = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 74));
const secondDoctor = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 75));
const expiredDoctor = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 76));
// P1, D1, P2, D2 and D3 are isolated synthetic identities, never real account aliases.
const people = [patient, doctor, other, secondDoctor, expiredDoctor].map((key, i) => ({ key, id: `did:privy:flow_${i}`, email: `flow-${i}@example.test`, walletId: `local-wallet-${i}`, token: `local-token-${i}` }));
const clone = <T>(value: T): T => structuredClone(value);
const hex = (value: Uint8Array) => Buffer.from(value).toString('hex');
const bytes = (value: string) => Buffer.from(value, 'hex');

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function fixture() {
  const db = { histories: [] as any[], operations: [] as any[], versions: [] as any[], bindings: [] as any[] };
  const chain = { histories: new Map<string, any>(), versions: new Map<string, any>(), heads: new Map<string, any>(), grants: new Map<string, any>(), proofs: new Map<string, any>(), receipts: new Map<string, any>() };
  const counts = { signatures: 0, sends: 0, releases: 0, ledger: 100, sequence: 100 };
  const flags = { receiptVisible: true, loseSendReply: false };
  let transaction: typeof db | null = null;
  const savepoints = new Map<string, typeof db>();
  const versionKey = (h: string, e: string, v: number) => `${h}:${e}:${v}`;
  const query = async (text: string, values: any[] = []): Promise<{ rows: any[] }> => {
    const q = text.replace(/\s+/g, ' ').trim();
    if (q === 'BEGIN') { transaction = clone(db); return { rows: [] }; }
    if (q === 'COMMIT') { transaction = null; return { rows: [] }; }
    if (q === 'ROLLBACK') { if (transaction) Object.assign(db, transaction); transaction = null; return { rows: [] }; }
    if (q.startsWith('SAVEPOINT ')) { savepoints.set(q.slice(10), clone(db)); return { rows: [] }; }
    if (q.startsWith('ROLLBACK TO SAVEPOINT ')) { Object.assign(db, clone(savepoints.get(q.slice(22))!)); return { rows: [] }; }
    if (q.startsWith('RELEASE SAVEPOINT ')) { savepoints.delete(q.slice(18)); return { rows: [] }; }
    if (q.includes('pg_advisory_xact_lock')) return { rows: [] };
    if (q.startsWith('SELECT to_regclass')) return { rows: [{ relation: values[0] }] };
    if (q.includes('FROM privy_stellar_wallet_bindings')) return { rows: clone(db.bindings.filter(b => b.app_id === values[0] && b.user_id === values[1])) };
    if (q.startsWith('INSERT INTO privy_stellar_wallet_bindings')) {
      const saved = db.bindings.find(b => b.user_id === values[1]);
      if (saved && (saved.wallet_id !== values[2] || saved.address !== values[3])) return { rows: [] };
      if (!saved) db.bindings.push({ app_id: values[0], user_id: values[1], wallet_id: values[2], address: values[3] });
      return { rows: [{ wallet_id: values[2], address: values[3] }] };
    }
    if (q.includes('FROM doctors')) {const doctors=[1,3,4].map((index,i)=>({id:7+i,name:'Local synthetic doctor '+i,email:people[index].email,status:'active'}));return {rows:values.length?doctors.filter(d=>d.id===values[0]||d.email===values[0]):doctors};}
    if (q.includes('FROM clinical_web_histories')) {
      return { rows: clone(db.histories.filter(h => q.includes('history_id=$1') ? h.history_id === values[0] : h.owner_user_id === values[0] && h.contract_id === values[1])) };
    }
    if (q.startsWith('INSERT INTO clinical_web_histories')) {
      if (!db.histories.some(h => h.history_id === values[0])) db.histories.push({ history_id: values[0], owner_user_id: values[1], wallet_id: values[2], patient_wallet: values[3], contract_id: values[4], network: 'testnet', transaction_hash: values[5] });
      return { rows: [] };
    }
    if (q.startsWith('SELECT 1 FROM') && q.includes('state IN')) {
      return { rows: q.includes('FROM clinical_web_operations') ? db.operations.filter(o => o.source_wallet === values[0] && ['awaiting_signature', 'submitted'].includes(o.state)) : [] };
    }
    if (q.startsWith('SELECT * FROM clinical_web_operations')) {
      const rows = db.operations.filter(o => q.includes('transaction_hash=$1') ? o.transaction_hash === values[0] && o.contract_id === values[1] && o.state === 'confirmed'
        : q.includes('actor_user_id=$1') ? o.actor_user_id === values[0] && o.wallet_id === values[1] && o.source_wallet === values[2] && o.contract_id === values[3]
          : o.id === values[0] && (values.length === 1 || o.actor_user_id === values[1] && o.contract_id === values[2]));
      return { rows: clone(rows) };
    }
    if (q.startsWith('INSERT INTO clinical_web_operations')) {
      const row = { id: values[0], actor_user_id: values[1], wallet_id: values[2], source_wallet: values[3], action: values[4], contract_id: values[5], network: 'testnet', method: values[6], expected: JSON.parse(values[7]), prepared_envelope: values[8] ? JSON.parse(values[8]) : null, state: 'awaiting_signature', unsigned_xdr: values[9], signing_hash: values[10], expires_at: values[11], request_fingerprint: values[12], signed_xdr: null, transaction_hash: null, error_code: null };
      db.operations.push(row); return { rows: [clone(row)] };
    }
    if (q.startsWith('UPDATE clinical_web_operations')) {
      const row = db.operations.find(o => o.id === values[0]);
      if (q.includes('expires_at<=')) return { rows: [] }; // No elapsed unsigned fixture in this scenario.
      if (!row) return { rows: [] };
      if (q.includes("state='submitted'")) Object.assign(row, { signed_xdr: values[1], transaction_hash: values[2], state: 'submitted' });
      if (q.includes("state='confirmed'")) Object.assign(row, { state: 'confirmed', error_code: null });
      return { rows: [clone(row)] };
    }
    if (q.startsWith('SELECT entry_id,version,transaction_hash,operation_id,commitment')) return { rows: clone(db.versions.filter(v => v.history_id === values[0] && v.contract_id === values[1] && v.state === 'confirmed')) };
    if (q.startsWith('SELECT context,envelope,commitment,operation_id,state,transaction_hash')) return { rows: clone(db.versions.filter(v => v.contract_id === values[0] && v.history_id === values[1] && v.entry_id === values[2] && v.version === values[3])) };
    if (q.startsWith('INSERT INTO clinical_private_versions')) {
      const [contract_id, history_id, entry_id, version] = values;
      if (!db.versions.some(v => v.contract_id === contract_id && v.history_id === history_id && v.entry_id === entry_id && v.version === version)) db.versions.push({ contract_id, history_id, entry_id, version, context: JSON.parse(values[4]), commitment: values[5], envelope: JSON.parse(values[6]), operation_id: values[7], state: 'prepared', transaction_hash: null });
      return { rows: [] };
    }
    if (q.startsWith('UPDATE clinical_private_versions')) {
      const row = db.versions.find(v => v.contract_id === values[0] && v.history_id === values[1] && v.entry_id === values[2] && v.version === values[3]);
      Object.assign(row!, { state: 'confirmed', transaction_hash: values[4] }); return { rows: [] };
    }
    throw Error('unhandled_local_sql: ' + q);
  };
  const sql = Object.assign(async (strings: TemplateStringsArray, ...values: any[]) => (await query(strings.join('?'), values)).rows,
    { query: async (text: string, values?: any[]) => (await query(text, values)).rows });
  adapters.sql = sql;
  adapters.client = { query, release: () => { counts.releases++; } };
  const wallet = (person: typeof people[number]) => ({ id: person.walletId, address: person.key.publicKey(), chainType: 'stellar', type: 'wallet', ownerId: person.id });
  const providerUser = (person: typeof people[number]) => ({ id: person.id, email: { address: person.email }, linkedAccounts: [{ type: 'email', address: person.email }, wallet(person)] });
  adapters.privy = {
    getUser: async (id: string) => providerUser(people.find(p => p.id === id)!),
    getUserByEmail: async (email: string) => providerUser(people.find(p => p.email === email)!),
    verifyAuthToken: async (token: string) => ({ userId: people.find(p => p.token === token)!.id }),
    walletApi: {
      getWallet: async ({ id }: { id: string }) => wallet(people.find(p => p.walletId === id)!),
      createWallet: () => { throw Error('unexpected_wallet_creation'); },
      generateUserSigner: () => { throw Error('unexpected_server_signature'); },
    },
  };
  vi.stubGlobal('fetch', vi.fn(async () => { throw Error('unexpected_provider_request'); }));

  function outcome(tx: FeeBumpTransaction) {
    const call = (tx.innerTransaction as Transaction).operations[0];
    if (call.type !== 'invokeHostFunction') throw Error('unexpected_local_operation');
    const invocation = call.func.invokeContract(), method = invocation.functionName().toString(), args = invocation.args();
    const source = tx.innerTransaction.source;
    expect(Address.fromScAddress(invocation.contractAddress()).toString()).toBe(CLINICAL_CONTRACT);
    let opId: string, digest: Buffer, result: any, kind: string;
    if (method === 'create_history') {
      const [owner, h, op] = args.map(scValToNative); expect(owner).toBe(source);
      opId = hex(op); result = { history_id: h, patient: owner, created_at: BigInt(++counts.ledger) }; kind = 'History';
      chain.histories.set(hex(h), result);
      digest = createHash('sha256').update(xdr.ScVal.scvVec([xdr.ScVal.scvSymbol('create'), new Address(CLINICAL_CONTRACT).toScVal(), ...args]).toXDR()).digest();
    } else {
      const input = scValToNative(args[0]), h = hex(input.history_id), known = chain.histories.get(h);
      opId = hex(input.operation_id);
      digest = createHash('sha256').update(xdr.ScVal.scvVec([xdr.ScVal.scvSymbol(method === 'append_version' ? 'append' : 'grant'), new Address(CLINICAL_CONTRACT).toScVal(), args[0]]).toXDR()).digest();
      if (method === 'append_version') {
        const e = hex(input.entry_id), prior = chain.heads.get(`${h}:${e}`);
        if (source !== known.patient) {
          expect(source).toBe(doctor.publicKey());
          const grant = chain.grants.get(`${h}:${source}`);
          expect(grant?.can_append).toBe(true); expect(Number(grant.revision)).toBe(Number(input.expected_grant_revision));
        }
        if (prior) expect(prior.author).toBe(source);
        expect(prior?.head_version ?? 0).toBe(input.expected_version); expect(input.author).toBe(source);
        result = { author: source, commitment: input.commitment, previous_commitment: prior ? chain.versions.get(versionKey(h, e, prior.head_version)).commitment : null, version: input.expected_version + 1, created_at: BigInt(++counts.ledger) }; kind = 'Version';
        chain.versions.set(versionKey(h, e, result.version), result); chain.heads.set(`${h}:${e}`, { author: source, head_version: result.version });
      } else if (method === 'set_permissions') {
        expect(known.patient).toBe(source);
        const g = chain.grants.get(`${h}:${input.doctor}`); expect(Number(g?.revision ?? 0)).toBe(Number(input.expected_revision));
        result = { can_read: input.can_read, can_append: input.can_append, revision: BigInt(Number(input.expected_revision) + 1) }; kind = 'Permissions';
        chain.grants.set(`${h}:${input.doctor}`, result); counts.ledger++;
      } else throw Error('unexpected_local_method');
    }
    chain.proofs.set(`${source}:${opId}`, { digest, outcome: [kind, result] });
  }
  adapters.rpc = {
    getNetwork: async () => ({ passphrase: Networks.TESTNET }),
    getAccount: async (source: string) => new Account(source, String(counts.sequence++)),
    getLedgerEntries: async (key: xdr.LedgerKey) => {
      const contract = Address.fromScAddress(key.contractData().contract()).toString();
      return { latestLedger: counts.ledger, entries: [{ key, liveUntilLedgerSeq: 100_000, val: xdr.LedgerEntryData.contractData(new xdr.ContractDataEntry({ ext: new xdr.ExtensionPoint(0), contract: new Address(contract).toScAddress(), key: xdr.ScVal.scvLedgerKeyContractInstance(), durability: xdr.ContractDataDurability.persistent(), val: xdr.ScVal.scvContractInstance(new xdr.ScContractInstance({ storage: [], executable: xdr.ContractExecutable.contractExecutableWasm(bytes(contract === CLINICAL_CONTRACT ? CLINICAL_WASM : 'b31de89cfd704aa917afd2b9056b97a38242d91f2452846a208962f7de358e02')) })) })) }] };
    },
    prepareTransaction: async (tx: Transaction) => tx,
    simulateTransaction: async (tx: Transaction) => {
      const op = tx.operations[0]; if (op.type !== 'invokeHostFunction') throw Error('unexpected_read');
      const invocation = op.func.invokeContract(), method = invocation.functionName().toString(), args = invocation.args().map(scValToNative);
      const h = args[0] instanceof Uint8Array ? hex(args[0]) : '';
      let value: any;
      if (method === 'interface_version') value = 1;
      else if (method === 'get_registry') value = REGISTRY_PRIVATE;
      else if (method === 'get_admin') value = PRIVATE_ADMIN;
      else if (method === 'is_authorized') value = [doctor.publicKey(), secondDoctor.publicKey()].includes(args[0]);
      else if (method === 'get_history_for_patient') value = [...chain.histories.values()].find(history => history.patient === args[0]);
      else if (method === 'get_history') value = chain.histories.get(h);
      else if (method === 'get_entry') value = chain.heads.get(`${h}:${hex(args[1])}`);
      else if (method === 'get_grant') value = chain.grants.get(`${h}:${args[1]}`);
      else if (method === 'can_read') value = chain.histories.get(h)?.patient === args[1] || !!chain.grants.get(`${h}:${args[1]}`)?.can_read;
      else if (method === 'get_version') value = chain.versions.get(versionKey(h, hex(args[1]), args[2]));
      else if (method === 'get_operation') value = chain.proofs.get(`${args[0]}:${hex(args[1])}`);
      else throw Error('unexpected_local_read: ' + method);
      return value === undefined ? { latestLedger: counts.ledger, error: 'HostError: Error(Contract, #1)' } : { latestLedger: counts.ledger, transactionData: new SorobanDataBuilder(), result: { auth: [], retval: nativeToScVal(value, { type: method === 'interface_version' ? 'u32' : undefined }) } };
    },
    sendTransaction: async (tx: FeeBumpTransaction) => {
      counts.sends++;
      const hash = tx.hash().toString('hex');
      // Simulate losing the reply before this fake provider accepts the envelope.
      if (flags.loseSendReply) { flags.loseSendReply = false; throw Error('simulated_lost_rpc_reply'); }
      if (!chain.receipts.has(hash)) { outcome(tx); chain.receipts.set(hash, { status: 'SUCCESS', ledger: counts.ledger, envelopeXdr: tx.toEnvelope() }); }
      return { status: 'PENDING', hash };
    },
    getTransaction: async (hash: string) => flags.receiptVisible && chain.receipts.has(hash) ? chain.receipts.get(hash) : { status: 'NOT_FOUND' },
  };
  const host = 'ep-local-isolated-test.c-3.us-east-1.aws.neon.tech';
  const env: Record<string, string> = { DATABASE_URL: `postgresql://synthetic:placeholder@${host}/local_fixture`, TRUSTLEAF_DATABASE_URL: `postgresql://synthetic:placeholder@${host}/local_fixture`, TRUSTLEAF_ENV: 'test', TRUSTLEAF_DB_HOST: host, VERCEL_ENV: '', PRIVY_APP_ID: PRIVY_APP, NEXT_PUBLIC_PRIVY_APP_ID: PRIVY_APP, PRIVY_APP_SECRET: 'local-fixture-only', DOCTOR_REGISTRY_PRIVATE_CONTRACT_ID: REGISTRY_PRIVATE, PRESCRIPTION_PRIVATE_CONTRACT_ID: RX_PRIVATE, DOCTOR_REGISTRY_ADMIN_PUBLIC_KEY: PRIVATE_ADMIN, BOOKING_AUTHORITY_PUBLIC_KEY: PRIVATE_ADMIN, NEXT_PUBLIC_STELLAR_NETWORK: 'testnet', NEXT_PUBLIC_SOROBAN_RPC_URL: 'https://soroban-testnet.stellar.org', TRUSTLEAF_CLINICAL_WEB_ENABLED: 'true', CLINICAL_HISTORY_PRIVATE_CONTRACT_ID: CLINICAL_CONTRACT, TRUSTLEAF_PRIVATE_WRITES_ENABLED: 'true', RELAYER_SECRET: payer.secret(), TRUSTLEAF_CLINICAL_KEYRING: JSON.stringify({ 'local-flow': 'd'.repeat(64) }), TRUSTLEAF_CLINICAL_ACTIVE_KEY_ID: 'local-flow' };
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  return { db, chain, counts, flags };
}

it('chains the actual clinical web services across creation, file/version reads, corrections, independent grants and isolated sessions', async () => {
  const f = fixture(); let requestNo = 0;
  const request = (path: string, method = 'GET', body?: unknown, person = people[0]) => new Request(`http://localhost${path}`, { method, headers: { Authorization: `Bearer ${person.token}`, Host: 'localhost', Origin: 'http://localhost', 'Content-Type': 'application/json', ...(path === '/api/private-clinical-operations' && method === 'POST' ? { [CLINICAL_PREPARE_CAPABILITY_HEADER]: CLINICAL_PREPARE_CAPABILITY_VERSION } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const context = (id: string) => ({ params: Promise.resolve({ id }) });
  async function json<T>(response: Response): Promise<T> { const body = await response.json(); expect(body, 'actual route response').not.toHaveProperty('error'); expect(response.status).toBe(200); expect(response.headers.get('Cache-Control')).toBe('no-store'); return body; }
  const snapshot = async (person = people[0]) => json<ClinicalSnapshot>(await history(request('/api/private-clinical-history', 'GET', undefined, person)));
  async function perform(input: Omit<ClinicalPrepareRequest, 'requestId'>, loseReply = false, person = people[0]) {
    const requestId = `0e336456-9c8c-4360-b797-${(++requestNo).toString().padStart(12, '0')}`, payload = { ...input, requestId };
    const prepared = await json<{ operation: ClinicalOperation }>(await prepare(request('/api/private-clinical-operations', 'POST', payload, person)));
    const duplicate = await json<{ operation: ClinicalOperation }>(await prepare(request('/api/private-clinical-operations', 'POST', payload, person)));
    expect(duplicate).toEqual(prepared); expect(prepared.operation.state).toBe('awaiting_signature');
    expect(f.db.operations.filter(o => o.id === requestId)).toHaveLength(1);
    f.flags.loseSendReply = loseReply;
    f.counts.signatures++;
    const signed = await json<{ operation: ClinicalOperation }>(await sign(request(`/api/private-clinical-operations/${requestId}/sign`, 'POST', { confirmed: true, signature: '0x' + person.key.sign(Buffer.from(prepared.operation.signing!.hash, 'hex')).toString('hex') }, person), context(requestId)));
    expect(signed.operation.state).toBe('submitted'); const before = clone(f.db.operations.find(o => o.id === requestId));
    if (loseReply) {
      f.flags.receiptVisible = false; const signatureCount = f.counts.signatures, sendCount = f.counts.sends;
      const pending = await json<{ operation: ClinicalOperation }>(await inspect(request(`/api/private-clinical-operations/${requestId}`, 'GET', undefined, person), context(requestId)));
      expect(pending.operation).toEqual(signed.operation); expect(f.counts.sends).toBe(sendCount);
      const replayed = await json<{ operation: ClinicalOperation }>(await retry(request(`/api/private-clinical-operations/${requestId}/retry`, 'POST', { confirmed: true }, person), context(requestId)));
      expect(replayed.operation).toEqual(signed.operation); expect(f.counts.signatures).toBe(signatureCount); expect(f.counts.sends).toBe(sendCount + 1);
      expect(f.db.operations.find(o => o.id === requestId).signed_xdr).toBe(before.signed_xdr); f.flags.receiptVisible = true;
    }
    const confirmed = await json<{ operation: ClinicalOperation }>(await inspect(request(`/api/private-clinical-operations/${requestId}`, 'GET', undefined, person), context(requestId)));
    expect(confirmed.operation.state).toBe('confirmed'); expect(confirmed.operation.transactionHash).toBe(signed.operation.transactionHash);
    const again = await json<{ operation: ClinicalOperation }>(await inspect(request(`/api/private-clinical-operations/${requestId}`, 'GET', undefined, person), context(requestId)));
    expect(again).toEqual(confirmed); return f.db.operations.find(o => o.id === requestId);
  }
  expect((await snapshot()).history).toBeNull();
  await perform({ action: 'create_history' });
  const created = await snapshot(); expect(created.history?.patient).toBe(patient.publicKey()); expect(created.entries).toEqual([]);
  const pdf = (version: number) => syntheticPdf('SYNTHETIC FILE VERSION ' + version);
  for (const invalid of [
    { fileName: 'broken.pdf', mediaType: 'application/pdf', base64: Buffer.from('%PDF-1.7\nNO OBJECTS\n%%EOF\n').toString('base64') },
    { fileName: 'broken.jpg', mediaType: 'image/jpeg', base64: Buffer.from('ffd8ffe000044a46ffd9','hex').toString('base64') },
    { fileName: 'wrong.png', mediaType: 'application/pdf', base64: pdf(1).toString('base64') },
  ]) {
    const before = JSON.stringify(f.db), signs = f.counts.signatures, sends = f.counts.sends;
    const denied = await prepare(request('/api/private-clinical-operations','POST',{requestId:'0e336456-9c8c-4360-b797-000000000097',action:'append_version',file:invalid}));
    expect(denied.status).toBe(400); expect(await denied.json()).toEqual({error:'clinical_file_invalid'});
    expect(JSON.stringify(f.db)).toBe(before); expect(f.counts.signatures).toBe(signs); expect(f.counts.sends).toBe(sends);
  }
  const first = await perform({ action: 'append_version', file: { fileName: 'synthetic.pdf', mediaType: 'application/pdf', base64: pdf(1).toString('base64') } }, true);
  const entryId = first.expected.entryId;
  async function download(version: number) { const response = await document(request(`/api/private-clinical-history/document?entryId=${entryId}&version=${version}`)); expect(response.status).toBe(200); expect(response.headers.get('Content-Type')).toBe('application/pdf'); expect(response.headers.get('Cache-Control')).toBe('no-store'); return Buffer.from(await response.arrayBuffer()); }
  expect(await download(1)).toEqual(pdf(1));
  await perform({ action: 'append_version', note: { title: 'LOCAL NOTE TITLE', text: 'PRIVATE SYNTHETIC NOTE', eventDate: null } });
  await perform({ action: 'append_version', entryId, expectedVersion: 1, file: { fileName: 'synthetic-correction.pdf', mediaType: 'application/pdf', base64: pdf(2).toString('base64') } });
  expect(await download(1)).toEqual(pdf(1)); expect(await download(2)).toEqual(pdf(2));
  const corrected = await snapshot(); const versions = corrected.entries.filter(e => e.entryId === entryId);
  expect(versions.map(e => [e.version, e.canCorrect])).toEqual([[2, true], [1, false]]);
  expect(corrected.entries.find(e => e.note)?.note?.text).toBe('PRIVATE SYNTHETIC NOTE');
  expect(versions[0].transactionHash).not.toBe(versions[1].transactionHash);
  const reader = createClinicalChainReader({ network: 'testnet', contractId: CLINICAL_CONTRACT, registryId: REGISTRY_PRIVATE, wasmHash: CLINICAL_WASM, readerAddress: PRIVATE_ADMIN });
  const store = clinicalNeonStore(adapters.client);
  // Keep the low-level reader and exercise the actual week-3 HTTP handlers too.
  const physicianRead = () => readClinicalVersion({ credential: people[1].token, historyId: created.history!.id, entryId, version: 1 }, {
    deployment: reader.deployment,
    authenticate: async (credential: string) => ({ ...(await adapters.privy.verifyAuthToken(credential)), sessionId: 'local-doctor-session' }),
    findBinding: async (identity: { userId: string }) => {
      const actor = await resolveClinicalActor({ userId: identity.userId, email: people[1].email });
      return { userId: actor.userId, bindingId: actor.walletId, wallet: actor.address, role: 'doctor', revokedAt: null, verifiedAt: new Date().toISOString() };
    },
    readAccess: reader.readAccess, readVersion: reader.readVersion,
    loadEnvelope: store.loadEnvelope, getKeyring: async () => clinicalKeyring().keyring,
  });
  await perform({ action: 'set_permissions', doctorId: 7, canRead: true, canAppend: false, expectedRevision: 0 });
  expect((await snapshot()).grants[0]).toMatchObject({ doctorId: 7, canRead: true, canAppend: false, revision: 1 });
  expect(Buffer.from((await physicianRead()).content)).toEqual(pdf(1));
  const selectedPath = `/api/private-clinical-history?historyId=${created.history!.id}`;
  const doctorSnapshot = async () => json<ClinicalSnapshot>(await history(request(selectedPath, 'GET', undefined, people[1])));
  const doctorReadOnly = await doctorSnapshot();
  expect(doctorReadOnly.context).toMatchObject({ role: 'doctor', canRead: true, canAppend: false, grantRevision: 1 });
  expect(doctorReadOnly.entries.every(e => e.source === 'patient' && !e.canCorrect)).toBe(true);
  const doctorDenied = await prepare(request('/api/private-clinical-operations', 'POST', { requestId: '0e336456-9c8c-4360-b797-000000000099', action: 'append_version', historyId: created.history!.id, note: { title: 'DENIED', text: 'read only', eventDate: null } }, people[1]));
  expect(doctorDenied.status).toBe(403);
  await perform({ action: 'set_permissions', doctorId: 7, canRead: true, canAppend: true, expectedRevision: 1 });
  const doctorNote = await perform({ action: 'append_version', historyId: created.history!.id,
    note: { title: 'PHYSICIAN NOTE', text: 'SYNTHETIC PHYSICIAN CONTRIBUTION', eventDate: null } }, true, people[1]);
  const doctorCorrected = await perform({ action: 'append_version', historyId: created.history!.id,
    entryId: doctorNote.expected.entryId, expectedVersion: 1,
    note: { title: 'PHYSICIAN CORRECTION', text: 'SYNTHETIC PHYSICIAN CORRECTION', eventDate: null } }, false, people[1]);
  const medicalView = await doctorSnapshot();
  expect(medicalView.entries.filter(e => e.entryId === doctorNote.expected.entryId).map(e => [e.source,e.version,e.canCorrect])).toEqual([['doctor',2,true],['doctor',1,false]]);
  const forbiddenCorrection = await prepare(request('/api/private-clinical-operations', 'POST', { requestId: '0e336456-9c8c-4360-b797-000000000098', action: 'append_version', historyId: created.history!.id, entryId, expectedVersion: 2,
    note: { title: 'DENIED', text: 'foreign correction', eventDate: null } }, people[1]));
  expect(forbiddenCorrection.status).toBe(409);
  // D2 is authorised with an isolated grant, but may not correct D1. D3 retains a stale grant but is not authorised.
  for (const person of [people[3],people[4]]) f.chain.grants.set(created.history!.id+':'+person.key.publicKey(),{can_read:true,can_append:true,revision:1n});
  const d2view=await json<ClinicalSnapshot>(await history(request(selectedPath,'GET',undefined,people[3])));
  expect(d2view.entries.filter(e=>e.entryId===doctorNote.expected.entryId).every(e=>!e.canCorrect)).toBe(true);
  for(const person of [people[2],people[3],people[4]]){
    const before={operations:f.db.operations.length,versions:f.db.versions.length,signatures:f.counts.signatures,sends:f.counts.sends};
    const denied=await prepare(request('/api/private-clinical-operations','POST',{requestId:'0e336456-9c8c-4360-b797-000000000096',action:'append_version',historyId:created.history!.id,entryId:doctorNote.expected.entryId,expectedVersion:2,note:{title:'DENIED',text:'FOREIGN AUTHOR CORRECTION',eventDate:null}},person));
    expect(denied.status).toBe(person===people[3]?409:404);
    expect({operations:f.db.operations.length,versions:f.db.versions.length,signatures:f.counts.signatures,sends:f.counts.sends}).toEqual(before);
    const privateOperation=await inspect(request('/api/private-clinical-operations/'+doctorNote.id,'GET',undefined,person),context(doctorNote.id));
    expect(privateOperation.status).toBe(404);expect(await privateOperation.text()).not.toContain('SYNTHETIC PHYSICIAN');
  }
  for(const person of [people[2],people[4]]){
    const denied=await history(request(selectedPath,'GET',undefined,person));expect(denied.status).toBe(404);expect(await denied.text()).not.toContain('PHYSICIAN');
  }
  for (const person of [people[3],people[4]]) f.chain.grants.delete(created.history!.id+':'+person.key.publicKey());
  const patientView = await snapshot();
  expect(patientView.entries.find(e => e.transactionHash === doctorCorrected.transaction_hash)).toMatchObject({ source: 'doctor', author: doctor.publicKey(), version: 2, canCorrect: false });
  await perform({ action: 'set_permissions', doctorId: 7, canRead: false, canAppend: true, expectedRevision: 2 });
  const appendOnly = await doctorSnapshot();
  expect(appendOnly.context).toMatchObject({ canRead: false, canAppend: true, grantRevision: 3 });
  expect(appendOnly.entries).toEqual([]);
  const blockedFile = await document(request(`/api/private-clinical-history/document?historyId=${created.history!.id}&entryId=${entryId}&version=1`, 'GET', undefined, people[1]));
  expect(blockedFile.status).toBe(404); expect(await blockedFile.text()).not.toContain('SYNTHETIC FILE');
  await perform({ action: 'append_version', historyId: created.history!.id,
    file: { fileName: 'physician.pdf', mediaType: 'application/pdf', base64: pdf(3).toString('base64') } }, false, people[1]);
  await perform({ action: 'set_permissions', doctorId: 7, canRead: false, canAppend: false, expectedRevision: 3 });
  expect((await snapshot()).grants[0]).toMatchObject({ canRead: false, canAppend: false, revision: 4 });
  const revokedSnapshot = await history(request(selectedPath, 'GET', undefined, people[1]));
  expect(revokedSnapshot.status).toBe(404); expect(await revokedSnapshot.text()).not.toContain('PHYSICIAN');
  await expect(physicianRead()).rejects.toThrow('clinical_version_unavailable');
  expect(await download(1)).toEqual(pdf(1));
  const foreign = await snapshot(people[2]); expect(foreign).toMatchObject({ history: null, entries: [], grants: [], operations: [] });
  const foreignRead = await document(request(`/api/private-clinical-history/document?entryId=${entryId}&version=1`, 'GET', undefined, people[2]));
  expect(foreignRead.status).toBe(404); expect(await foreignRead.text()).not.toContain('SYNTHETIC FILE');
  expect((await snapshot()).entries.filter(e => e.source === 'patient')).toEqual(corrected.entries); // Fresh route requests preserve the confirmed history.
  expect(f.db.operations).toHaveLength(11); expect(f.db.operations.every(o => o.state === 'confirmed')).toBe(true);
  expect(f.counts.signatures).toBe(11); expect(f.counts.sends).toBe(13); expect(f.chain.receipts.size).toBe(11);
  expect(f.db.versions).toHaveLength(6); expect(f.db.versions.every(v => v.state === 'confirmed')).toBe(true);
  const persisted = JSON.stringify(f.db);
  for (const privateText of ['PRIVATE SYNTHETIC NOTE', 'LOCAL NOTE TITLE', 'SYNTHETIC FILE VERSION', 'synthetic-correction.pdf', 'SYNTHETIC PHYSICIAN', 'PHYSICIAN NOTE', 'PHYSICIAN CORRECTION', 'physician.pdf']) expect(persisted).not.toContain(privateText);
  expect(f.counts.releases).toBeGreaterThan(0);
}, 15_000);

vi.mock('@/lib/clinical/sponsorship', () => ({ assertClinicalSponsorshipConfigured: vi.fn(), reserveClinicalSponsorship: vi.fn(), assertClinicalSponsorshipSign: vi.fn(), bindClinicalSponsorshipSubmission: vi.fn(), cancelClinicalSponsorship: vi.fn(), reconcileClinicalSponsorship: vi.fn() }));
