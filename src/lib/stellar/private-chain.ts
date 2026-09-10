import { Address, BASE_FEE, Contract, Keypair, Networks, Transaction, TransactionBuilder, nativeToScVal, rpc, scValToNative, xdr } from '@stellar/stellar-sdk';
import { PRIVATE_ADMIN, RX_PRIVATE, REGISTRY_PRIVATE, PrivateFlowError } from '@/lib/private-config';

export type PrivateAction = 'consent' | 'withdraw_consent' | 'mint' | 'activate' | 'revoke';
export interface ExpectedOperation {
  doctor: string; patient: string; issuanceId: string; validUntil: number;
  commitment?: string; expiresAt?: number; rxId?: string;
}
export const ACTION_METHODS: Record<PrivateAction,string> = {
  consent:'authorize_prescriber', withdraw_consent:'revoke_consent', mint:'mint_prescription', activate:'activate', revoke:'revoke',
};
export function privateInvocation(action: PrivateAction, e: ExpectedOperation) {
  const addr=(value:string)=>new Address(value).toScVal();
  const nonce=nativeToScVal(Buffer.from(e.issuanceId,'hex'));
  const u64=(value:number|string)=>nativeToScVal(BigInt(value),{type:'u64'});
  const args=action==='consent'?[addr(e.patient),addr(e.doctor),nonce,u64(e.validUntil)]
    :action==='withdraw_consent'?[addr(e.patient),addr(e.doctor),nonce]
    :action==='mint'?[addr(e.doctor),addr(e.patient),nonce,nativeToScVal(Buffer.from(e.commitment!,'hex')),u64(e.expiresAt!)]
    :action==='activate'?[addr(e.doctor),u64(e.rxId!)] :[u64(e.rxId!)];
  return new Contract(RX_PRIVATE).call(ACTION_METHODS[action],...args);
}
export function assertUnsignedOperation(tx: Transaction, source: string, action: PrivateAction, expected: ExpectedOperation) {
  const op=tx.operations[0];
  if(tx.source!==source || tx.signatures.length || tx.operations.length!==1 || op.type!=='invokeHostFunction' || (op.source!==undefined&&op.source!==source) ||
      !op.func.toXDR().equals(privateInvocation(action,expected).body().invokeHostFunctionOp().hostFunction().toXDR()) ||
      (op.auth??[]).some(entry=>entry.credentials().switch().name!=='sorobanCredentialsSourceAccount')) {
    throw new PrivateFlowError('prepared_operation_invalid');
  }
}
export function createPrivateChain(server=new rpc.Server('https://soroban-testnet.stellar.org')) {
  async function read(method:string,args:xdr.ScVal[]=[],missing=false):Promise<unknown> {
    const account=await server.getAccount(PRIVATE_ADMIN);
    const tx=new TransactionBuilder(account,{fee:BASE_FEE,networkPassphrase:Networks.TESTNET})
      .addOperation(new Contract(RX_PRIVATE).call(method,...args)).setTimeout(60).build();
    const sim=await server.simulateTransaction(tx);
    if(rpc.Api.isSimulationError(sim)) {
      if(missing && /^\s*(?:HostError:\s*)?Error\(Contract,\s*#3\)(?:\s|$)/.test(sim.error))return null;
      throw new PrivateFlowError('private_chain_unavailable',503);
    }
    if(!rpc.Api.isSimulationSuccess(sim)||!sim.result)throw new PrivateFlowError('private_chain_unavailable',503);
    return scValToNative(sim.result.retval);
  }
  return {
    server,
    async verifyDeployment() {
      const [version,registry,admin,authority]=await Promise.all([
        read('interface_version'),read('get_registry'),read('get_admin'),read('get_booking_authority'),
      ]);
      if(Number(version)!==2||registry!==REGISTRY_PRIVATE||admin!==PRIVATE_ADMIN||authority!==PRIVATE_ADMIN)throw new PrivateFlowError('private_contract_mismatch',503);
    },
    async booking(issuanceId:string) {
      const value=await read('get_booking',[nativeToScVal(Buffer.from(issuanceId,'hex'))],true) as Record<string,unknown>|null;
      if(!value)return null;
      const status=Array.isArray(value.status)?String(value.status[0]):String(value.status);
      if(!['Active','Revoked','Consumed'].includes(status)||typeof value.doctor!=='string'||typeof value.patient!=='string')throw new PrivateFlowError('private_chain_unavailable',503);
      return {doctor:value.doctor,patient:value.patient,validUntil:Number(value.valid_until),status};
    },
    async prescription(rxId:string) {
      const value=await read('get_prescription',[nativeToScVal(BigInt(rxId),{type:'u64'})],true) as Record<string,unknown>|null;
      if(!value)return null;
      const status=Array.isArray(value.status)?String(value.status[0]):String(value.status);
      if(!['Registered','Active','Revoked','Blocked'].includes(status))throw new PrivateFlowError('private_chain_unavailable',503);
      return {id:String(value.id),doctor:String(value.doctor),patient:String(value.patient),commitment:Buffer.from(value.commitment as Uint8Array).toString('hex'),
        schemaVersion:Number(value.schema_version),issuedAt:Number(value.issued_at),expiresAt:Number(value.expires_at),status};
    },
    async consent(e:ExpectedOperation) {
      const key=xdr.LedgerKey.contractData(new xdr.LedgerKeyContractData({contract:new Address(RX_PRIVATE).toScAddress(),
        key:xdr.ScVal.scvVec([xdr.ScVal.scvSymbol('Consent'),new Address(e.patient).toScVal(),new Address(e.doctor).toScVal(),nativeToScVal(Buffer.from(e.issuanceId,'hex'))]),
        durability:xdr.ContractDataDurability.persistent()}));
      const result=await server.getLedgerEntries(key);
      if(result.entries.length===0)return null;
      if(result.entries.length!==1||!result.entries[0].key.toXDR().equals(key.toXDR()))throw new PrivateFlowError('consent_unavailable',503);
      const until=Number(scValToNative(result.entries[0].val.contractData().val()));
      if(!Number.isSafeInteger(until)||until<=0)throw new PrivateFlowError('consent_unavailable',503);
      return until;
    },
    async prepare(source:string,action:PrivateAction,expected:ExpectedOperation) {
      let account;
      try { account=await server.getAccount(source); }
      catch(error) {
        if(!(error instanceof Error)||!/account.*not found/i.test(error.message))throw error;
        const response=await fetch(`https://friendbot.stellar.org/?addr=${encodeURIComponent(source)}`,{signal:AbortSignal.timeout(20_000)});
        if(!response.ok)throw new PrivateFlowError('test_account_provisioning_unavailable',503);
        account=await server.getAccount(source);
      }
      const unsigned=new TransactionBuilder(account,{fee:BASE_FEE,networkPassphrase:Networks.TESTNET})
        .addOperation(privateInvocation(action,expected)).setTimeout(180).build();
      const tx=await server.prepareTransaction(unsigned);
      assertUnsignedOperation(tx,source,action,expected);
      return tx;
    },
    async submit(envelope:string) {
      const sent=await server.sendTransaction(TransactionBuilder.fromXDR(envelope,Networks.TESTNET));
      return sent.status;
    },
    receipt:(hash:string)=>server.getTransaction(hash),
  };
}
export function sponsorOwnerSignature(unsignedXdr:string,source:string,signature:string,action:PrivateAction,expected:ExpectedOperation) {
  const tx=TransactionBuilder.fromXDR(unsignedXdr,Networks.TESTNET);
  if(!(tx instanceof Transaction))throw new PrivateFlowError('prepared_operation_invalid');
  assertUnsignedOperation(tx,source,action,expected);
  const hex=signature.replace(/^0x/,'');
  if(!/^[a-f0-9]{128}$/i.test(hex)||!Keypair.fromPublicKey(source).verify(tx.hash(),Buffer.from(hex,'hex')))throw new PrivateFlowError('owner_signature_invalid',403);
  if(!tx.timeBounds||Number(tx.timeBounds.maxTime)<=Date.now()/1000)throw new PrivateFlowError('signature_request_expired');
  tx.addSignature(source,Buffer.from(hex,'hex').toString('base64'));
  if(!process.env.RELAYER_SECRET)throw new PrivateFlowError('relayer_unavailable',503);
  const payer=Keypair.fromSecret(process.env.RELAYER_SECRET);
  const envelope=TransactionBuilder.buildFeeBumpTransaction(payer,'2000000',tx,Networks.TESTNET);
  envelope.sign(payer);
  return {xdr:envelope.toXDR(),hash:envelope.hash().toString('hex')};
}
