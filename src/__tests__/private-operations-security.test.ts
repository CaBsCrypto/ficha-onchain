import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { Account, Address, Contract, Keypair, Networks, Transaction, TransactionBuilder, nativeToScVal, scValToNative, xdr } from '@stellar/stellar-sdk';
import { PRIVATE_ADMIN, PRIVY_APP, REGISTRY_PRIVATE, RX_PRIVATE } from '@/lib/private-config';
import { assertUnsignedOperation, privateInvocation, sponsorOwnerSignature, type ExpectedOperation, type PrivateAction } from '@/lib/stellar/private-chain';
import { assertSavedEnvelope, confirmPrivateOperation, preparePrivateOperation, reconcilePrivateOperation } from '@/lib/private-operations';
import { assertBookingReady, readPrivateConsultation, readPrivateDocument, storageContext } from '@/lib/private-prescriptions';
import { encryptPrescription, prescriptionCommitment } from '../../scripts/lib/private-prescription.mjs';
import { privateBody } from '@/lib/private-api';
import { isPrivatePortalPath } from '@/lib/private-routes';

const mocks=vi.hoisted(()=>({connection:vi.fn(),wallet:vi.fn(),doctor:vi.fn(),chain:vi.fn()}));
vi.mock('@/lib/db',()=>({getDb:vi.fn(()=>({})),getDbConnection:mocks.connection,sqlForConnection:vi.fn(()=>({}))}));
vi.mock('@/lib/doctor-authorizations',()=>({verifiedWallet:mocks.wallet,readPrivateDoctor:mocks.doctor,
  DoctorAuthorizationError:class extends Error{status=409;}}));
vi.mock('@/lib/stellar/private-chain',async()=>({...await vi.importActual<typeof import('@/lib/stellar/private-chain')>('@/lib/stellar/private-chain'),createPrivateChain:mocks.chain}));

const doctor=Keypair.random(),patient=Keypair.random(),payer=Keypair.random(),stranger=Keypair.random();
const actors={doctor:{userId:'did:privy:doctor',email:'doctor@example.test'},patient:{userId:'did:privy:patient',email:'patient@example.test'}};
const operationId='00000000-0000-4000-8000-000000000001';
const prescriptionId='00000000-0000-4000-8000-000000000002';
const until=()=>Math.floor(Date.now()/1000)+600;
function expected():ExpectedOperation{return {doctor:doctor.publicKey(),patient:patient.publicKey(),issuanceId:'12'.repeat(32),validUntil:until()};}
function unsigned(action:PrivateAction,e:ExpectedOperation,source=action==='consent'||action==='withdraw_consent'?patient.publicKey():doctor.publicKey()) {
  return new TransactionBuilder(new Account(source,'1'),{fee:'100',networkPassphrase:Networks.TESTNET})
    .addOperation(privateInvocation(action,e)).setTimeout(180).build();
}
function saved(action:PrivateAction='consent',signed=false) {
  const e=expected();if(!['consent','withdraw_consent'].includes(action))Object.assign(e,{commitment:'34'.repeat(32),expiresAt:until()+1000,...(action==='mint'?{}:{rxId:'9'})});
  const key=['consent','withdraw_consent'].includes(action)?patient:doctor,actor=key===patient?actors.patient:actors.doctor;
  const tx=unsigned(action,e),signature=key.sign(tx.hash()).toString('hex');
  const row:Record<string,any>={id:operationId,actor_user_id:actor.userId,actor_email:actor.email,wallet_id:key===patient?'patient-wallet':'doctor-wallet',
    source_wallet:key.publicKey(),action,appointment_id:1,prescription_id:key===doctor?prescriptionId:null,
    contract_id:RX_PRIVATE,method:{consent:'authorize_prescriber',withdraw_consent:'revoke_consent',mint:'mint_prescription',activate:'activate',revoke:'revoke'}[action],
    expected:e,state:'awaiting_signature',unsigned_xdr:tx.toXDR(),signing_hash:tx.hash().toString('hex'),expires_at:Number(tx.timeBounds!.maxTime)};
  if(signed){const s=sponsorOwnerSignature(row.unsigned_xdr,row.source_wallet,signature,action,e);Object.assign(row,{state:'submitted',signed_xdr:s.xdr,transaction_hash:s.hash});}
  return {row,actor,signature,tx};
}

beforeEach(()=>{
  vi.clearAllMocks();
  const env={NEXT_PUBLIC_STELLAR_NETWORK:'testnet',NEXT_PUBLIC_SOROBAN_RPC_URL:'https://soroban-testnet.stellar.org',TRUSTLEAF_ENV:'local',TRUSTLEAF_DB_HOST:'ep-lingering-water-ahzh89z5-pooler.c-3.us-east-1.aws.neon.tech',
    DATABASE_URL:'postgresql://test:test@ep-lingering-water-ahzh89z5-pooler.c-3.us-east-1.aws.neon.tech/test',PRIVY_APP_ID:PRIVY_APP,NEXT_PUBLIC_PRIVY_APP_ID:PRIVY_APP,
    DOCTOR_REGISTRY_PRIVATE_CONTRACT_ID:REGISTRY_PRIVATE,PRESCRIPTION_PRIVATE_CONTRACT_ID:RX_PRIVATE,DOCTOR_REGISTRY_ADMIN_PUBLIC_KEY:PRIVATE_ADMIN,
    BOOKING_AUTHORITY_PUBLIC_KEY:PRIVATE_ADMIN,RELAYER_SECRET:payer.secret(),TRUSTLEAF_PRIVATE_WRITES_ENABLED:'true',VERCEL_ENV:''};
  for(const [key,value]of Object.entries(env))vi.stubEnv(key,value);
  vi.stubGlobal('fetch',vi.fn().mockRejectedValue(Error('Unexpected network call in offline test')));
  mocks.wallet.mockImplementation(async(_:unknown,id:string,email:string)=>{
    if(id===actors.doctor.userId&&email===actors.doctor.email)return {address:doctor.publicKey(),walletId:'doctor-wallet'};
    if(id===actors.patient.userId&&email===actors.patient.email)return {address:patient.publicKey(),walletId:'patient-wallet'};
    return {address:stranger.publicKey(),walletId:'stranger-wallet'};
  });
  mocks.doctor.mockResolvedValue({authorized:true});
});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});

describe('real Stellar envelope boundaries',()=>{
  it('owner signs the exact Testnet transaction; only configured relay pays the outer envelope',()=>{
    const f=saved('consent',true);expect(()=>assertSavedEnvelope(f.row)).not.toThrow();
    const outer=TransactionBuilder.fromXDR(f.row.signed_xdr,Networks.TESTNET);
    expect(outer).not.toBeInstanceOf(Transaction);
    if(outer instanceof Transaction)throw Error();
    expect(outer.feeSource).toBe(payer.publicKey());expect(outer.innerTransaction.source).toBe(patient.publicKey());
    expect(patient.verify(outer.innerTransaction.hash(),outer.innerTransaction.signatures[0].signature())).toBe(true);
    const mainnet=TransactionBuilder.fromXDR(f.row.unsigned_xdr,Networks.PUBLIC);
    expect(()=>sponsorOwnerSignature(f.row.unsigned_xdr,f.row.source_wallet,patient.sign(mainnet.hash()).toString('hex'),'consent',f.row.expected)).toThrow('owner_signature_invalid');
  });

  it('rejects changed method, recipient, commitment, source, contract and signed hash',()=>{
    const f=saved('mint',true);
    for(const patch of [{contract_id:REGISTRY_PRIVATE},{method:'block'},{signing_hash:'ff'.repeat(32)},
      {expected:{...f.row.expected,patient:stranger.publicKey()}},{expected:{...f.row.expected,commitment:'ab'.repeat(32)}},
      {source_wallet:stranger.publicKey()},{transaction_hash:'00'.repeat(32)}])expect(()=>assertSavedEnvelope({...f.row,...patch})).toThrow();
    expect(()=>sponsorOwnerSignature(f.row.unsigned_xdr,doctor.publicKey(),patient.sign(f.tx.hash()).toString('hex'),'mint',f.row.expected)).toThrow('owner_signature_invalid');
  });

  it('rejects operation source override and non-source Soroban authorization',()=>{
    const e=expected(),op=privateInvocation('consent',e);
    op.sourceAccount(xdr.MuxedAccount.keyTypeEd25519(stranger.rawPublicKey()));
    const tx=new TransactionBuilder(new Account(patient.publicKey(),'1'),{fee:'100',networkPassphrase:Networks.TESTNET}).addOperation(op).setTimeout(180).build();
    expect(()=>assertUnsignedOperation(tx,patient.publicKey(),'consent',e)).toThrow('prepared_operation_invalid');
    const authOp=privateInvocation('consent',e);
    const auth=new xdr.SorobanAuthorizationEntry({credentials:xdr.SorobanCredentials.sorobanCredentialsAddress(new xdr.SorobanAddressCredentials({
      address:new Address(stranger.publicKey()).toScAddress(),nonce:xdr.Int64.fromString('1'),signatureExpirationLedger:123,signature:xdr.ScVal.scvVoid()})),
      rootInvocation:new xdr.SorobanAuthorizedInvocation({function:xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(authOp.body().invokeHostFunctionOp().hostFunction().invokeContract()),subInvocations:[]})});
    authOp.body().invokeHostFunctionOp().auth([auth]);
    const tx2=new TransactionBuilder(new Account(patient.publicKey(),'1'),{fee:'100',networkPassphrase:Networks.TESTNET}).addOperation(authOp).setTimeout(180).build();
    expect(()=>assertUnsignedOperation(tx2,patient.publicKey(),'consent',e)).toThrow('prepared_operation_invalid');
  });

  it('rejects a valid signature from a payer other than TrustLeaf in saved state',()=>{
    const f=saved('consent'),inner=TransactionBuilder.fromXDR(f.row.unsigned_xdr,Networks.TESTNET) as Transaction;
    inner.sign(patient);const outer=TransactionBuilder.buildFeeBumpTransaction(stranger,'2000000',inner,Networks.TESTNET);outer.sign(stranger);
    expect(()=>assertSavedEnvelope({...f.row,signed_xdr:outer.toXDR(),transaction_hash:outer.hash().toString('hex')})).toThrow('saved_operation_invalid');
  });
});

describe('chain reads',()=>{
  it('uses the exact persistent consent key; distinguishes absence from RPC or wrong-key results',async()=>{
    const real=await vi.importActual<typeof import('@/lib/stellar/private-chain')>('@/lib/stellar/private-chain');
    const e=expected();let captured:xdr.LedgerKey|undefined;
    const ledger=vi.fn(async(key:xdr.LedgerKey)=>{captured=key;return {entries:[]};});
    const chain=real.createPrivateChain({getLedgerEntries:ledger} as any);
    expect(await chain.consent(e)).toBeNull();
    const k=captured!.contractData();expect(Address.fromScAddress(k.contract()).toString()).toBe(RX_PRIVATE);
    expect(k.durability().name).toBe('persistent');
    const parts=k.key().vec()!;expect(parts[0].sym().toString()).toBe('Consent');
    expect(scValToNative(parts[1])).toBe(e.patient);expect(scValToNative(parts[2])).toBe(e.doctor);expect(Buffer.from(scValToNative(parts[3])).toString('hex')).toBe(e.issuanceId);
    ledger.mockRejectedValueOnce(Error('rpc_down'));await expect(chain.consent(e)).rejects.toThrow('rpc_down');
    ledger.mockResolvedValueOnce({entries:[{key:xdr.LedgerKey.contractData(new xdr.LedgerKeyContractData({contract:new Address(REGISTRY_PRIVATE).toScAddress(),key:k.key(),durability:k.durability()}))}]} as any);
    await expect(chain.consent(e)).rejects.toThrow('consent_unavailable');
  });

  it('never treats generic RPC failure as a missing booking or prescription',async()=>{
    const real=await vi.importActual<typeof import('@/lib/stellar/private-chain')>('@/lib/stellar/private-chain');
    const server={getAccount:vi.fn(async()=>new Account(PRIVATE_ADMIN,'1')),simulateTransaction:vi.fn(async()=>({error:'RPC unavailable #3'}))};
    const chain=real.createPrivateChain(server as any);
    await expect(chain.booking(expected().issuanceId)).rejects.toThrow('private_chain_unavailable');
    server.simulateTransaction.mockResolvedValue({error:'HostError: Error(Contract, #3)\nEvent log'});
    expect(await chain.booking(expected().issuanceId)).toBeNull();
    server.simulateTransaction.mockRejectedValue(Error('rpc_down'));
    await expect(chain.prescription('9')).rejects.toThrow('rpc_down');
  });
});

function database(f:ReturnType<typeof saved>) {
  const row=f.row,events:string[]=[];
  const e=row.expected as ExpectedOperation;
  const appointment:any={id:1,doctor_email:actors.doctor.email,patient_email:actors.patient.email,doctor_user_id:actors.doctor.userId,patient_user_id:actors.patient.userId,
    doctor_wallet:doctor.publicKey(),patient_wallet:patient.publicKey(),doctor_wallet_id:'doctor-wallet',patient_wallet_id:'patient-wallet',
    status:'in_progress',started_at:new Date(),started_by:actors.doctor.userId,attendance_at:new Date(),attendance_user_id:actors.patient.userId,patient_name:'Synthetic'};
  const booking:any={appointment_id:1,network:'testnet',contract_id:RX_PRIVATE,doctor_user_id:actors.doctor.userId,patient_requested_by:actors.patient.userId,
    doctor_email:actors.doctor.email,patient_email:actors.patient.email,doctor_wallet_id:'doctor-wallet',patient_wallet_id:'patient-wallet',
    doctor_wallet:doctor.publicKey(),patient_wallet:patient.publicKey(),issuance_id:e.issuanceId,valid_until:e.validUntil,state:'confirmed',attestation_hash:'aa'.repeat(32)};
  const prescription:any=['consent','withdraw_consent'].includes(row.action)?null:{id:prescriptionId,appointment_id:1,commitment:e.commitment,expires_at:e.expiresAt,
    doctor_wallet:doctor.publicKey(),patient_wallet:patient.publicKey(),rx_id:e.rxId??null,state:row.state==='submitted'?'submitted':'prepared'};
  let activeConnections=0,maxConnections=0,afterCommit:(()=>void)|undefined;
  const chain={verifyDeployment:vi.fn(async()=>{}),booking:vi.fn(async()=>({doctor:e.doctor,patient:e.patient,validUntil:e.validUntil,status:'Active'})),
    consent:vi.fn(async()=>row.action==='mint'?e.validUntil:null),receipt:vi.fn(async()=>({status:'NOT_FOUND'} as any)),
    prescription:vi.fn(async()=>({id:'9',doctor:e.doctor,patient:e.patient,commitment:e.commitment,expiresAt:e.expiresAt,schemaVersion:1,status:'Registered'})),
    submit:vi.fn(async(_envelope:string):Promise<string>=>{events.push('submit');throw Error('lost_response');}),prepare:vi.fn(async()=>f.tx)};
  mocks.chain.mockReturnValue(chain);
  mocks.connection.mockImplementation(async()=>{
    activeConnections++;maxConnections=Math.max(maxConnections,activeConnections);
    return {release:()=>{events.push('release');activeConnections--;},query:async(sql:string,values:any[]=[])=>{
      events.push(sql.startsWith('UPDATE private_operations SET signed_xdr')?'persist':sql);
      if(sql==='COMMIT'){afterCommit?.();return {rows:[],rowCount:0};}
      if(sql.startsWith('SELECT a.*'))return {rows:[appointment],rowCount:1};
      if(sql.startsWith('SELECT * FROM prescription_booking_requests'))return {rows:[booking],rowCount:1};
      if(sql.startsWith('SELECT * FROM private_prescriptions'))return {rows:prescription?[prescription]:[],rowCount:prescription?1:0};
      if(sql.startsWith('SELECT appointment_id FROM private_prescriptions'))return {rows:[{appointment_id:1}],rowCount:1};
      if(sql.startsWith('SELECT * FROM private_operations'))return {rows:values.length>1&&sql.includes('actor_user_id')&&values[1]!==row.actor_user_id?[]:[row],rowCount:1};
      if(sql.startsWith('UPDATE private_operations SET signed_xdr'))Object.assign(row,{signed_xdr:values[1],transaction_hash:values[2],state:'submitted'});
      else if(sql.startsWith("UPDATE private_operations SET state='confirmed'"))Object.assign(row,{state:'confirmed',error_code:null});
      else if(sql.startsWith("UPDATE private_operations SET state='failed'"))Object.assign(row,{state:'failed'});
      else if(sql.startsWith('UPDATE private_operations SET error_code'))row.error_code=values[1];
      else if(sql.startsWith("UPDATE private_prescriptions SET state='submitted'"))prescription.state='submitted';
      else if(sql.startsWith("UPDATE private_prescriptions SET state='confirmed'")){prescription.state='confirmed';prescription.rx_id=values[1];}
      else if(sql.startsWith("UPDATE prescription_booking_requests SET state='consumed'")) {
        if(!sql.includes('AND transaction_hash IS NULL')||!booking.transaction_hash)booking.state='consumed';
      }
      return {rows:[row],rowCount:1};
    }};
  });
  return {row,events,appointment,booking,prescription,chain,get maxConnections(){return maxConnections;},onCommit(fn:()=>void){afterCommit=fn;}};
}

describe('persistent owner operations',()=>{
  it.each(['mint','activate','revoke'] as const)('rejects patient preparation of %s before chain preparation or persistence',async(action)=>{
    const d=database(saved(action));
    const connect=mocks.connection.getMockImplementation()!;
    mocks.connection.mockImplementation(async()=>{
      const client=await connect();
      const query=client.query;
      client.query=async(sql:string,values:any[]=[])=>{
        if(sql.startsWith('SELECT * FROM private_operations WHERE source_wallet'))return {rows:[],rowCount:0};
        return query(sql,values);
      };
      return client;
    });
    await expect(preparePrivateOperation(actors.patient,action,{prescriptionId})).rejects.toMatchObject({message:'forbidden',status:403});
    expect(d.events).toContain('ROLLBACK');expect(d.events).not.toContain('COMMIT');
    expect(d.events.some(sql=>sql.startsWith('INSERT INTO private_operations'))).toBe(false);
    expect(d.chain.prepare).not.toHaveBeenCalled();expect(d.chain.submit).not.toHaveBeenCalled();
    expect(d.chain.verifyDeployment).not.toHaveBeenCalled();
  });

  it('persists signed hash and commits before transmission; replay never creates another envelope or nested connection',async()=>{
    const f=saved(),d=database(f);
    const first=await confirmPrivateOperation(f.actor,operationId,f.signature);
    expect(first.operation.state).toBe('submitted');expect(d.events.indexOf('persist')).toBeLessThan(d.events.indexOf('submit'));
    expect(d.events.slice(d.events.indexOf('persist'),d.events.indexOf('submit'))).toContain('COMMIT');
    const envelope=d.row.signed_xdr,hash=d.row.transaction_hash;
    await confirmPrivateOperation(f.actor,operationId,f.signature);
    expect(d.row.signed_xdr).toBe(envelope);expect(d.row.transaction_hash).toBe(hash);
    expect(d.events.filter(x=>x==='persist')).toHaveLength(1);expect(d.maxConnections).toBe(1);
    expect(d.chain.submit.mock.calls.every(args=>args[0]===envelope)).toBe(true);
  });

  it('kill switch changing while commit finishes preserves signed attempt without broadcasting',async()=>{
    const f=saved(),d=database(f);d.onCommit(()=>vi.stubEnv('TRUSTLEAF_PRIVATE_WRITES_ENABLED','false'));
    await confirmPrivateOperation(f.actor,operationId,f.signature);
    expect(d.row.state).toBe('submitted');expect(d.row.signed_xdr).toBeTruthy();expect(d.chain.submit).not.toHaveBeenCalled();
  });

  it('RPC rejection or lost response is recoverable and preserves the same signed attempt',async()=>{
    const f=saved('consent',true),d=database(f),hash=d.row.transaction_hash,envelope=d.row.signed_xdr;
    d.chain.submit.mockResolvedValueOnce('ERROR');
    const result=await reconcilePrivateOperation(f.actor,operationId);
    expect(result.operation.state).toBe('submitted');expect(result.operation.errorCode).toBe('relay_submission_rejected');
    expect(d.row.transaction_hash).toBe(hash);expect(d.row.signed_xdr).toBe(envelope);
    const retry=await reconcilePrivateOperation(f.actor,operationId);
    expect(retry.operation.errorCode).toBe('relay_response_unavailable');expect(d.row.state).toBe('submitted');
  });

  it('booking start, participants and wallet IDs must match exact accredited snapshot',async()=>{
    const f=saved(),d=database(f);
    await expect(assertBookingReady(d.appointment,d.booking,d.chain as any)).resolves.toBeUndefined();
    for(const field of ['started_by','patient_user_id','doctor_user_id','patient_wallet_id','doctor_wallet_id','patient_wallet','doctor_wallet','patient_email','doctor_email']) {
      await expect(assertBookingReady({...d.appointment,[field]:'changed'},d.booking,d.chain as any)).rejects.toThrow('booking_not_ready');
    }
  });

  it('cancellation blocks rebroadcast of an uncertain mint; expired attempts also remain saved',async()=>{
    const f=saved('mint',true),d=database(f);d.booking.cancellation_requested_at=new Date();d.appointment.status='cancel_requested';
    await reconcilePrivateOperation(f.actor,operationId);expect(d.chain.submit).not.toHaveBeenCalled();expect(d.row.state).toBe('submitted');
    d.booking.cancellation_requested_at=null;d.appointment.status='in_progress';d.row.expires_at=1;
    await reconcilePrivateOperation(f.actor,operationId);expect(d.chain.submit).not.toHaveBeenCalled();expect(d.row.error_code).toBe('awaiting_receipt_reconciliation');
  });

  it('receipt reconciliation works with writes off, but verifies real mint recipient and commitment',async()=>{
    const f=saved('mint',true),d=database(f);vi.stubEnv('TRUSTLEAF_PRIVATE_WRITES_ENABLED','false');
    d.chain.receipt.mockResolvedValue({status:'SUCCESS',returnValue:nativeToScVal(9n,{type:'u64'})});
    d.chain.booking.mockResolvedValue({doctor:f.row.expected.doctor,patient:f.row.expected.patient,validUntil:f.row.expected.validUntil,status:'Consumed'});
    d.chain.prescription.mockResolvedValueOnce({...await d.chain.prescription(),patient:stranger.publicKey()});
    await expect(reconcilePrivateOperation(f.actor,operationId)).rejects.toThrow('receipt_mismatch');expect(d.row.state).toBe('submitted');
    await reconcilePrivateOperation(f.actor,operationId);expect(d.row.state).toBe('confirmed');expect(d.prescription.state).toBe('confirmed');
    expect(d.booking.state).toBe('consumed');expect(d.chain.submit).not.toHaveBeenCalled();
  });

  it('receipt cannot confirm another Rx ID or a consumed booking for different participants/expiry',async()=>{
    for(const change of ['rxId','schema','doctor','patient','expiry']) {
      const f=saved('mint',true),d=database(f);vi.stubEnv('TRUSTLEAF_PRIVATE_WRITES_ENABLED','false');
      d.chain.receipt.mockResolvedValue({status:'SUCCESS',returnValue:nativeToScVal(9n,{type:'u64'})});
      d.chain.booking.mockResolvedValue({doctor:change==='doctor'?stranger.publicKey():f.row.expected.doctor,
        patient:change==='patient'?stranger.publicKey():f.row.expected.patient,validUntil:f.row.expected.validUntil+(change==='expiry'?1:0),status:'Consumed'});
      if(change==='rxId'||change==='schema')d.chain.prescription.mockResolvedValue({...await d.chain.prescription(),id:change==='rxId'?'10':'9',schemaVersion:change==='schema'?2:1});
      await expect(reconcilePrivateOperation(f.actor,operationId)).rejects.toThrow('receipt_mismatch');expect(d.row.state).toBe('submitted');
    }
  });

  it('mint confirmation preserves a competing signed cancellation for authority receipt reconciliation',async()=>{
    const f=saved('mint',true),d=database(f);d.appointment.status='cancel_requested';
    Object.assign(d.booking,{state:'submitted',tx_kind:'revoke',transaction_hash:'bc'.repeat(32),prepared_xdr:'saved-authority-envelope',cancellation_requested_at:new Date()});
    d.chain.receipt.mockResolvedValue({status:'SUCCESS',returnValue:nativeToScVal(9n,{type:'u64'})});
    d.chain.booking.mockResolvedValue({doctor:f.row.expected.doctor,patient:f.row.expected.patient,validUntil:f.row.expected.validUntil,status:'Consumed'});
    const result=await reconcilePrivateOperation(f.actor,operationId);
    expect(result.operation.state).toBe('confirmed');expect(d.prescription.state).toBe('confirmed');
    expect(d.booking).toMatchObject({state:'submitted',tx_kind:'revoke',transaction_hash:'bc'.repeat(32),prepared_xdr:'saved-authority-envelope'});
    expect(d.chain.submit).not.toHaveBeenCalled();
  });

  it('wrong authenticated user or changed wallet cannot confirm another account operation',async()=>{
    const f=saved(),d=database(f);
    await expect(confirmPrivateOperation(actors.doctor,operationId,f.signature)).rejects.toThrow('operation_not_found');
    mocks.wallet.mockResolvedValue({address:stranger.publicKey(),walletId:'changed'});
    await expect(confirmPrivateOperation(f.actor,operationId,f.signature)).rejects.toThrow('operation_not_found');
    expect(d.chain.submit).not.toHaveBeenCalled();
  });

  it('another pending action owns the wallet sequence and blocks a new preparation',async()=>{
    const f=saved(),d=database(f);
    await expect(preparePrivateOperation(f.actor,'withdraw_consent',{appointmentId:1})).rejects.toThrow('another_operation_pending');
    expect(d.chain.prepare).not.toHaveBeenCalled();
  });

  it('email reuse cannot read a consultation belonging to another DID before accreditation',async()=>{
    const f=saved(),d=database(f);d.appointment.patient_user_id='did:privy:previous-user';
    await expect(readPrivateConsultation(f.actor,1)).rejects.toThrow('consultation_not_found');
  });
});

describe('public API shape and retired routes',()=>{
  it('client cannot submit XDR, hashes, contract IDs or another wallet as operation parameters',async()=>{
    for(const extra of ['xdr','hash','contractId','wallet','patient','doctor'])await expect(privateBody(new Request('https://example.test/api/private-operations',{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'consent',appointmentId:1,confirmed:true,[extra]:'arbitrary'})}),
      ['action','appointmentId','prescriptionId','confirmed'])).rejects.toThrow('invalid_request');
  });
  it('old clinical and wallet write routes remain retired, independent of private-write flag',()=>{
    for(const route of ['/api/mint','/api/ficha/grant','/api/mcp','/api/prescriptions/activate','/pharmacy','/patient/dental','/api/consultations'])expect(isPrivatePortalPath(route)).toBe(false);
    expect(isPrivatePortalPath(`/api/private-operations/${operationId}/confirm`)).toBe(true);
    expect(isPrivatePortalPath('/privy-check')).toBe(false);expect(isPrivatePortalPath('/privy-check',true)).toBe(true);
  });
});

describe('actual private-document retrieval',()=>{
  function documentFixture(state='confirmed') {
    const payload={schemaVersion:1,network:'testnet',contractId:RX_PRIVATE,doctor:doctor.publicKey(),patient:patient.publicKey(),
      issuanceId:'12'.repeat(32),expiresAt:until()+1000,document:{medication:'SYNTHETIC ONLY',dosage:'TEST',instructions:'TEST'},blinding:'bc'.repeat(32)};
    const key='de'.repeat(32);vi.stubEnv('TRUSTLEAF_DATA_KEY',key);
    const row:any={id:prescriptionId,state,rx_id:state==='confirmed'?'9':null,doctor_wallet:payload.doctor,patient_wallet:payload.patient,
      doctor_user_id:actors.doctor.userId,patient_requested_by:actors.patient.userId,issuance_id:payload.issuanceId,expires_at:payload.expiresAt,
      contract_id:RX_PRIVATE,network:'testnet',commitment:prescriptionCommitment(payload),ciphertext:encryptPrescription(payload,key,storageContext(prescriptionId))};
    const chain={verifyDeployment:vi.fn(async()=>{}),prescription:vi.fn(async()=>({id:'9',patient:row.patient_wallet,doctor:row.doctor_wallet,
      commitment:row.commitment,expiresAt:row.expires_at,schemaVersion:1,status:'Revoked'}))};mocks.chain.mockReturnValue(chain);
    mocks.connection.mockResolvedValue({release:vi.fn(),query:vi.fn(async(sql:string,values:any[])=>{
      expect(sql).toContain('p.patient_wallet=$3 AND b.patient_requested_by=$4');expect(sql).toContain('p.doctor_wallet=$3 AND b.doctor_user_id=$4');
      const permitted=(row.state==='confirmed'&&values[2]===row.patient_wallet&&values[3]===row.patient_requested_by)||
        (values[2]===row.doctor_wallet&&values[3]===row.doctor_user_id);
      return {rows:permitted?[row]:[],rowCount:permitted?1:0};
    })});
    return {payload,row,chain};
  }
  it('patient and issuer can read revoked history, without exposing encryption envelope or blinding',async()=>{
    const f=documentFixture();
    for(const actor of [actors.patient,actors.doctor]) {
      const result=await readPrivateDocument(actor,prescriptionId);
      expect(result).toMatchObject({id:prescriptionId,rxId:'9',document:f.payload.document,
        verification:{network:'testnet',contract:RX_PRIVATE,rxId:'9',status:'Revoked',issuanceHash:null,revocationHash:null}});
      expect(JSON.stringify(result)).not.toContain(f.payload.blinding);expect(JSON.stringify(result)).not.toContain('dossier:v1');
    }
  });
  it('administrator or unrelated authenticated wallet cannot read clinical data',async()=>{
    const f=documentFixture();
    await expect(readPrivateDocument({userId:'did:privy:admin',email:'admin@example.test'},prescriptionId)).rejects.toThrow('private_prescription_unavailable');
    expect(f.chain.prescription).not.toHaveBeenCalled();
  });
  it('returns the same confirmed public receipts to patient and issuer, ignoring invalid hashes',async()=>{
    const f=documentFixture();
    f.row.transaction_hash='ab'.repeat(32);f.row.revocation_hash='cd'.repeat(32);
    for(const actor of [actors.patient,actors.doctor]) {
      const {verification}=await readPrivateDocument(actor,prescriptionId);
      expect(verification).toMatchObject({issuanceHash:f.row.transaction_hash,revocationHash:f.row.revocation_hash,status:'Revoked'});
      expect(Number.isFinite(Date.parse(verification.checkedAt))).toBe(true);
    }
    f.row.transaction_hash='javascript:bad';f.row.revocation_hash='not-a-hash';
    expect((await readPrivateDocument(actors.patient,prescriptionId)).verification).toMatchObject({issuanceHash:null,revocationHash:null});
  });
  it('patient cannot read an unsigned draft; issuer review does not assert an on-chain record',async()=>{
    const f=documentFixture('prepared');
    await expect(readPrivateDocument(actors.patient,prescriptionId)).rejects.toThrow('private_prescription_unavailable');
    const result=await readPrivateDocument(actors.doctor,prescriptionId);
    expect(result.document).toEqual(f.payload.document);expect(result.rxId).toBeNull();expect(f.chain.prescription).not.toHaveBeenCalled();
    expect(result.verification).toMatchObject({status:'Pending',rxId:null,issuanceHash:null,revocationHash:null});
  });
  it('wrong public commitment or altered ciphertext never returns the private document',async()=>{
    const f=documentFixture();f.chain.prescription.mockResolvedValueOnce({id:'9',patient:f.row.patient_wallet,doctor:f.row.doctor_wallet,
      commitment:'ff'.repeat(32),expiresAt:f.row.expires_at,schemaVersion:1,status:'Revoked'});
    await expect(readPrivateDocument(actors.patient,prescriptionId)).rejects.toThrow('prescription_integrity_unavailable');
    f.row.ciphertext=f.row.ciphertext.slice(0,-6)+'xxxxxx';
    await expect(readPrivateDocument(actors.patient,prescriptionId)).rejects.toThrow();
  });
});
