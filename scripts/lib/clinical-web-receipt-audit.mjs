import { createHash } from 'node:crypto';
import { Account, Address, BASE_FEE, Contract, FeeBumpTransaction, Keypair, Networks, StrKey,
  TransactionBuilder, nativeToScVal, rpc, scValToNative, xdr } from '@stellar/stellar-sdk';
import { createClinicalContractAuditor } from './clinical-contract-audit.mjs';
import { PRIVATE_REGISTRY_ID } from './private-registry.mjs';

export const WEB_CLINICAL_CONTRACT = 'CCI3KHWKIVGURS2LAI5VJ5C7EHL6O76MHNCWCVDZWWRIEBXHSLLG4L4U';
const CLINICAL_WASM = '29e5510efc758f66bebc44c156fe13fb288a2ef339159467dd787bf4231e1ce0';
const REGISTRY_WASM = 'b31de89cfd704aa917afd2b9056b97a38242d91f2452846a208962f7de358e02';
const ADMIN = 'GBK4WWTIWXWTYNXDFOYPV2ZZKTBAJKG7NHZOSLLX7ZDLCXBXE7T7VVAO';
const HEX = /^[a-f0-9]{64}$/;
const fail = () => Error('rehearsal_receipt_invalid');
const sha = data => createHash('sha256').update(data).digest();
const address = value => { if (!StrKey.isValidEd25519PublicKey(value)) throw fail(); return new Address(value).toScVal(); };
const bytes = value => { if (!HEX.test(value) || /^0+$/.test(value)) throw fail(); return nativeToScVal(Buffer.from(value, 'hex')); };
const hex = value => { if (!(value instanceof Uint8Array) || value.length !== 32 || value.every(v => v === 0)) throw fail(); return Buffer.from(value).toString('hex'); };
const integer = (value, min = 0) => { if (!['number','bigint'].includes(typeof value) || !Number.isSafeInteger(Number(value)) || Number(value) < min) throw fail(); return Number(value); };
const exact = (value, keys) => { if (!value || typeof value !== 'object' || Object.keys(value).length !== keys.length || keys.some(k => !Object.hasOwn(value,k))) throw fail(); };
const struct = object => xdr.ScVal.scvMap(Object.keys(object).sort().map(k => new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol(k), val: object[k] })));
const u64 = value => nativeToScVal(BigInt(integer(value)), { type: 'u64' });
export function webClinicalHistoryId(patient) {
  return sha(xdr.ScVal.scvVec([xdr.ScVal.scvSymbol('hist_id'), nativeToScVal(sha(Networks.TESTNET)),
    new Address(WEB_CLINICAL_CONTRACT).toScVal(), address(patient)]).toXDR()).toString('hex');
}
function entryId(history, patient, operation) {
  return sha(xdr.ScVal.scvVec([xdr.ScVal.scvSymbol('entry_id'), nativeToScVal(sha(Networks.TESTNET)),
    new Address(WEB_CLINICAL_CONTRACT).toScVal(), bytes(history), address(patient), bytes(operation)]).toXDR()).toString('hex');
}
function signature(transaction, publicKey) {
  const key = Keypair.fromPublicKey(publicKey), sig = transaction.signatures;
  if (sig.length !== 1 || !sig[0].hint().equals(key.signatureHint()) || !key.verify(transaction.hash(), sig[0].signature())) throw fail();
}
function successfulResult(receipt, inner) {
  const outer = receipt.resultXdr?.result();
  if (outer?.switch().name !== 'txFeeBumpInnerSuccess') throw fail();
  const pair = outer.innerResultPair(), result = pair.result().result();
  if (!pair.transactionHash().equals(inner.hash()) || result.switch().name !== 'txSuccess' || result.results().length !== 1) throw fail();
  const operation = result.results()[0];
  if (operation.switch().name !== 'opInner' || operation.tr().switch().name !== 'invokeHostFunction' ||
      operation.tr().invokeHostFunctionResult().switch().name !== 'invokeHostFunctionSuccess') throw fail();
  const meta = receipt.resultMetaXdr;
  if (![3,4].includes(meta?.switch())) throw fail();
  const value = meta.value(), soroban = value.sorobanMeta();
  if (!soroban || !soroban.returnValue().toXDR().equals(receipt.returnValue.toXDR())) throw fail();
  const events = meta.switch() === 3 ? soroban.events() : value.operations()[0]?.events();
  if (!Array.isArray(events)) throw fail();
  const preimage = new xdr.InvokeHostFunctionSuccessPreImage({returnValue:receipt.returnValue,events});
  if (!operation.tr().invokeHostFunctionResult().success().equals(sha(preimage.toXDR()))) throw fail();
}
function invocation(transaction, patient, action, historyId, doctor, payload) {
  const body = transaction.toEnvelope().v1().tx(), op = transaction.operations[0];
  if (transaction.source !== patient || transaction.networkPassphrase !== Networks.TESTNET || transaction.operations.length !== 1 ||
      op.type !== 'invokeHostFunction' || op.source !== undefined || op.func.switch().name !== 'hostFunctionTypeInvokeContract' ||
      body.memo().switch().name !== 'memoNone' || body.cond().switch().name !== 'precondTime' || Number(transaction.timeBounds?.minTime) !== 0 ||
      !Number.isSafeInteger(Number(transaction.timeBounds?.maxTime)) || Number(transaction.timeBounds.maxTime) < 1 ||
      BigInt(transaction.sequence) < 1n || BigInt(transaction.fee) < BigInt(BASE_FEE) || BigInt(transaction.fee) > 100000000n) throw fail();
  const call = op.func.invokeContract(), args = call.args();
  if (!call.contractAddress().toXDR().equals(new Address(WEB_CLINICAL_CONTRACT).toScAddress().toXDR()) || call.functionName().toString() !== action || (op.auth?.length ?? 0) > 1) throw fail();
  for (const auth of op.auth ?? []) {
    const root = auth.rootInvocation();
    if (auth.credentials().switch().name !== 'sorobanCredentialsSourceAccount' || root.subInvocations().length ||
        root.function().switch().name !== 'sorobanAuthorizedFunctionTypeContractFn' || !root.function().contractFn().toXDR().equals(call.toXDR())) throw fail();
  }
  let operationId, commitment, selectedEntry, version, expected;
  if (action === 'create_history') {
    if (args.length !== 3) throw fail();
    operationId = hex(scValToNative(args[2]));
    expected = [address(patient), bytes(historyId), bytes(operationId)];
  } else {
    if (args.length !== 1) throw fail();
    const value = scValToNative(args[0]); operationId = hex(value?.operation_id);
    if (action === 'append_version') {
      exact(value, ['history_id','entry_id','author','commitment','expected_version','expected_grant_revision','operation_id']);
      version = integer(payload.expectedVersion ?? 0); if (version > 0xfffffffe) throw fail();
      commitment = hex(value.commitment); selectedEntry = payload.entryId ?? entryId(historyId,patient,operationId);
      expected = [struct({ history_id: bytes(historyId), entry_id: bytes(selectedEntry), author: address(patient), commitment: bytes(commitment),
        expected_version: nativeToScVal(version,{type:'u32'}), expected_grant_revision:u64(0), operation_id:bytes(operationId) })];
    } else if (action === 'set_permissions') {
      exact(value,['history_id','doctor','can_read','can_append','expected_revision','operation_id']);
      if (typeof payload.canRead !== 'boolean' || typeof payload.canAppend !== 'boolean' || payload.doctorId !== doctor.id) throw fail();
      expected = [struct({ history_id:bytes(historyId),doctor:address(doctor.address),can_read:nativeToScVal(payload.canRead),
        can_append:nativeToScVal(payload.canAppend),expected_revision:u64(payload.expectedRevision),operation_id:bytes(operationId) })];
    } else throw fail();
  }
  if (!new Contract(WEB_CLINICAL_CONTRACT).call(action,...expected).body().invokeHostFunctionOp().hostFunction().toXDR().equals(op.func.toXDR())) throw fail();
  return { operationId, commitment, entryId:selectedEntry, version:version === undefined ? undefined : version+1, args:expected };
}
const equalNative = (a,b) => {
  if (a instanceof Uint8Array || b instanceof Uint8Array) return a instanceof Uint8Array && b instanceof Uint8Array && Buffer.from(a).equals(Buffer.from(b));
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length===b.length && a.every((v,i)=>equalNative(v,b[i]));
  if (a && b && typeof a==='object' && typeof b==='object') return Object.keys(a).length===Object.keys(b).length && Object.keys(a).every(k=>Object.hasOwn(b,k)&&equalNative(a[k],b[k]));
  return a===b;
};

/** Public RPC + signed envelope + independently read chain state. The blinded
 * commitment is generated by the application; authenticated document readback
 * performs its plaintext integrity check. Never claim this is a plaintext hash. */
export function createClinicalWebAuditor({ server = new rpc.Server('https://soroban-testnet.stellar.org'), relayer, now = () => Date.now() }) {
  address(relayer); let ledger = 0;
  async function read(method,args) {
    const tx = new TransactionBuilder(new Account(ADMIN,'0'),{fee:BASE_FEE,networkPassphrase:Networks.TESTNET})
      .addOperation(new Contract(WEB_CLINICAL_CONTRACT).call(method,...args)).setTimeout(60).build();
    const value = await server.simulateTransaction(tx);
    if (!rpc.Api.isSimulationSuccess(value) || rpc.Api.isSimulationRestore(value) || !value.result || value.result.auth?.length !== 0 || integer(value.latestLedger,1) < ledger) throw fail();
    ledger = value.latestLedger; return scValToNative(value.result.retval);
  }
  return {
    async preflight({patient,doctor}) {
      address(patient); address(doctor.address); if (patient===doctor.address || patient===relayer) throw Error('rehearsal_actor_invalid');
      const auditor = createClinicalContractAuditor({server,readerAddress:ADMIN});
      await auditor.network();
      const deployments = [];
      deployments.push(await auditor.auditDeployment({name:'clinical-history-private',contractId:WEB_CLINICAL_CONTRACT,expectedWasmHash:CLINICAL_WASM,
        interfaceVersion:1,configuration:{get_registry:PRIVATE_REGISTRY_ID}}));
      deployments.push(await auditor.auditDeployment({name:'doctor-registry-private',contractId:PRIVATE_REGISTRY_ID,expectedWasmHash:REGISTRY_WASM,
        interfaceVersion:1,configuration:{get_admin:ADMIN}}));
      const authorization = await auditor.doctor(doctor.address,Math.floor(now()/1000));
      if (!authorization.authorized || authorization.remainingSeconds < 900) throw Error('rehearsal_doctor_unavailable');
      const account = await server.getAccount(patient); if (account.accountId() !== patient) throw Error('rehearsal_patient_unfunded');
      const key = xdr.LedgerKey.account(new xdr.LedgerKeyAccount({accountId:Keypair.fromPublicKey(relayer).xdrPublicKey()}));
      const payer = await server.getLedgerEntries(key), entry = payer.entries?.[0];
      if (payer.entries?.length!==1 || !entry.key.toXDR().equals(key.toXDR()) || entry.val.switch().name !== 'account' ||
          BigInt(entry.val.account().balance().toString()) < 20000000n) throw Error('rehearsal_relayer_unfunded');
      return {network:'testnet',deployments,doctorAuthorized:true,patientAccountExists:true,relayerBalanceChecked:true,
        contractId:WEB_CLINICAL_CONTRACT,registryId:PRIVATE_REGISTRY_ID,wasmHash:CLINICAL_WASM,registryWasmHash:REGISTRY_WASM,
        interfaceVersion:1,networkVerified:true,deploymentVerified:true,wasmVerified:true,configurationVerified:true,interfaceVerified:true,
        checkedAt:new Date(now()).toISOString(),newTransactions:0};
    },
    async operation(operation,{action,patient,doctor,payload,snapshot}) {
      try {
        if (operation.state !== 'confirmed' || operation.action !== action || !HEX.test(operation.transactionHash)) throw fail();
        if ((await server.getNetwork()).passphrase !== Networks.TESTNET) throw fail();
        const receipt = await server.getTransaction(operation.transactionHash);
        if (receipt.status !== 'SUCCESS' || receipt.feeBump !== true || integer(receipt.ledger,1) < 1 || !receipt.envelopeXdr || !receipt.returnValue) throw fail();
        const outer = TransactionBuilder.fromXDR(receipt.envelopeXdr,Networks.TESTNET);
        if (!(outer instanceof FeeBumpTransaction) || outer.hash().toString('hex') !== operation.transactionHash || outer.feeSource !== relayer ||
            BigInt(outer.fee) > 100000000n || BigInt(outer.fee) <= BigInt(outer.innerTransaction.fee)) throw fail();
        signature(outer,relayer); signature(outer.innerTransaction,patient);
        successfulResult(receipt,outer.innerTransaction);
        const historyId = webClinicalHistoryId(patient);
        if (snapshot?.history && (snapshot.history.id !== historyId || snapshot.history.patient !== patient)) throw fail();
        const parsed = invocation(outer.innerTransaction,patient,action,historyId,doctor,payload);
        const result = scValToNative(receipt.returnValue);
        let chainResult;
        if (action==='create_history') {
          exact(result,['history_id','patient','created_at']);
          if (hex(result.history_id)!==historyId || result.patient!==patient) throw fail(); integer(result.created_at,1);
          chainResult = await read('get_history',[bytes(historyId)]);
        } else if (action==='append_version') {
          exact(result,['author','commitment','previous_commitment','version','created_at']);
          if (result.author!==patient || hex(result.commitment)!==parsed.commitment || result.version!==parsed.version) throw fail(); integer(result.created_at,1);
          const previous = parsed.version===1 ? null : (await read('get_version',[bytes(historyId),bytes(parsed.entryId),nativeToScVal(parsed.version-1,{type:'u32'})])).commitment;
          if (!equalNative(result.previous_commitment,previous)) throw fail();
          chainResult = await read('get_version',[bytes(historyId),bytes(parsed.entryId),nativeToScVal(parsed.version,{type:'u32'})]);
        } else {
          exact(result,['can_read','can_append','revision']);
          if (result.can_read!==payload.canRead || result.can_append!==payload.canAppend || result.revision!==BigInt(payload.expectedRevision+1)) throw fail();
          // Older grant receipts remain valid after later revisions: compare
          // their durable recorded outcome, not today's superseding grant.
          chainResult = result;
        }
        if (!equalNative(chainResult,result)) throw fail();
        const tag = action==='create_history' ? 'create' : action==='append_version' ? 'append' : 'grant';
        const tuple = action==='create_history' ? [xdr.ScVal.scvSymbol(tag),new Address(WEB_CLINICAL_CONTRACT).toScVal(),...parsed.args]
          : [xdr.ScVal.scvSymbol(tag),new Address(WEB_CLINICAL_CONTRACT).toScVal(),parsed.args[0]];
        const proof = await read('get_operation',[address(patient),bytes(parsed.operationId)]);
        exact(proof,['digest','outcome']);
        const kind = action==='create_history' ? 'History' : action==='append_version' ? 'Version' : 'Permissions';
        if (hex(proof.digest)!==sha(xdr.ScVal.scvVec(tuple).toXDR()).toString('hex') || !equalNative(proof.outcome,[kind,result])) throw fail();
        return {hash:operation.transactionHash,ledger:receipt.ledger,historyId,operationId:parsed.operationId,
          ...(parsed.entryId ? {entryId:parsed.entryId,version:parsed.version,commitment:parsed.commitment} : {}),
          contractId:WEB_CLINICAL_CONTRACT,method:action,signatureVerified:true,argumentsVerified:true,chainProofVerified:true,
          explorer:`https://stellar.expert/explorer/testnet/tx/${operation.transactionHash}`};
      } catch { throw fail(); }
    },
  };
}
