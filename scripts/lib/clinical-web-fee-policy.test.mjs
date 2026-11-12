import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Account, Contract, Keypair, Networks, SorobanDataBuilder, TransactionBuilder, xdr } from '@stellar/stellar-sdk';
import { clinicalWebFeeQuote, assertClinicalWebSponsoredFee, assertClinicalWebRelayerBudget, checkClinicalWebRelayerBudget,
  CLINICAL_WEB_MAX_RESOURCE_FEE, CLINICAL_WEB_MAX_SPONSORED_FEE } from './clinical-web-fee-policy.mjs';

const actor = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 44)).publicKey();
const contract = 'CCI3KHWKIVGURS2LAI5VJ5C7EHL6O76MHNCWCVDZWWRIEBXHSLLG4L4U';
function transaction(resource = '353053728', inclusion = '100', network = Networks.TESTNET) {
  return new TransactionBuilder(new Account(actor, '10'), {fee:inclusion,networkPassphrase:network})
    .addOperation(new Contract(contract).call('interface_version')).setTimeout(180)
    .setSorobanData(new SorobanDataBuilder().setResourceFee(resource).build()).build();
}
test('realistic Soroban resource fee is included once in the SDK sponsorship quote', () => {
  const inner = transaction();
  assert.equal(inner.fee,'353053828');
  assert.deepEqual(clinicalWebFeeQuote(inner),{resource:353053728n,inclusion:100n,sponsored:357053728n});
  const outer = TransactionBuilder.buildFeeBumpTransaction(actor,'2000000',inner,Networks.TESTNET);
  assert.doesNotThrow(() => assertClinicalWebSponsoredFee(outer));
  assert.equal(inner.signatures.length,0); assert.equal(outer.signatures.length,0);
});
test('exact resource/outer maximum is accepted; one stroop beyond is rejected', () => {
  assert.equal(clinicalWebFeeQuote(transaction(CLINICAL_WEB_MAX_RESOURCE_FEE.toString())).sponsored,CLINICAL_WEB_MAX_SPONSORED_FEE);
  assert.throws(() => clinicalWebFeeQuote(transaction((CLINICAL_WEB_MAX_RESOURCE_FEE+1n).toString())), /clinical_fee_budget_exceeded/);
});
test('negative resources, inconsistent inclusion, excessive inclusion and another network fail before signature', () => {
  for (const [resource,inclusion,network] of [['-1','100',Networks.TESTNET],['100','99',Networks.TESTNET],
    ['100','2000001',Networks.TESTNET],['100','100',Networks.PUBLIC]]) {
    const inner=transaction(resource,inclusion,network);
    assert.throws(() => clinicalWebFeeQuote(inner), /clinical_fee_budget_exceeded/);
    assert.equal(inner.signatures.length,0);
  }
  const envelope=transaction().toEnvelope(); envelope.v1().tx().fee(100);
  assert.throws(() => clinicalWebFeeQuote(TransactionBuilder.fromXDR(envelope,Networks.TESTNET)), /clinical_fee_budget_exceeded/);
});
test('a different sponsored total is rejected even below the maximum', () => {
  const outer=TransactionBuilder.buildFeeBumpTransaction(actor,'2000001',transaction(),Networks.TESTNET);
  assert.throws(() => assertClinicalWebSponsoredFee(outer), /clinical_fee_budget_exceeded/);
});
function account(balance='4010000000', {selling='0',subentries=0,sponsoring=0,sponsored=0}={}) {
  return new xdr.AccountEntry({accountId:Keypair.fromPublicKey(actor).xdrPublicKey(),balance:xdr.Int64.fromString(balance),
    seqNum:xdr.SequenceNumber.fromString('10'),numSubEntries:subentries,inflationDest:null,flags:0,homeDomain:'',thresholds:Buffer.alloc(4),signers:[],
    ext:new xdr.AccountEntryExt(1,new xdr.AccountEntryExtensionV1({liabilities:new xdr.Liabilities({buying:xdr.Int64.fromString('0'),selling:xdr.Int64.fromString(selling)}),
      ext:new xdr.AccountEntryExtensionV1Ext(2,new xdr.AccountEntryExtensionV2({numSponsored:sponsored,numSponsoring:sponsoring,signerSponsoringIDs:[],ext:new xdr.AccountEntryExtensionV2Ext(0)}))}))});
}
test('relayer budget covers eight maxima after current reserve and liabilities', () => {
  assert.doesNotThrow(() => assertClinicalWebRelayerBudget(account(),5000000));
  assert.throws(() => assertClinicalWebRelayerBudget(account('4009999999'),5000000),/rehearsal_relayer_unfunded/);
  assert.throws(() => assertClinicalWebRelayerBudget(account('4010000000',{selling:'1'}),5000000),/rehearsal_relayer_unfunded/);
  assert.throws(() => assertClinicalWebRelayerBudget(account(),10000000),/rehearsal_relayer_unfunded/);
});
test('sponsored entries and sponsoring liabilities affect the available reserve; invalid counts fail closed', () => {
  assert.doesNotThrow(() => assertClinicalWebRelayerBudget(account('4005000000',{subentries:1,sponsored:2}),5000000));
  assert.throws(() => assertClinicalWebRelayerBudget(account('4010000000',{sponsoring:1}),5000000),/rehearsal_relayer_unfunded/);
  assert.throws(() => assertClinicalWebRelayerBudget(account('4010000000',{sponsored:3}),5000000),/rehearsal_relayer_unfunded/);
  assert.throws(() => assertClinicalWebRelayerBudget(account('4010000000',{selling:'-1'}),5000000),/rehearsal_relayer_unfunded/);
});
test('RPC budget reads the selected payer and reserve from the same ledger; missing or mismatched evidence fails closed', async () => {
  for (const scenario of ['valid','missing-account','wrong-account','missing-header','wrong-ledger','insufficient']) {
    let headerReads=0;
    const selectedAccount=account(scenario==='insufficient'?'4009999999':'4010000000');
    if (scenario==='wrong-account') selectedAccount.accountId(Keypair.fromRawEd25519Seed(Buffer.alloc(32,45)).xdrPublicKey());
    const server={
      getLedgerEntries:async key=>({latestLedger:100,entries:scenario==='missing-account'?[]:[{key,
        val:xdr.LedgerEntryData.account(selectedAccount)}]}),
      _getLedgers:async request=>{
        headerReads++; assert.deepEqual(request,{startLedger:100,pagination:{limit:1},xdrFormat:'json'});
        return {ledgers:scenario==='missing-header'?[]:[{sequence:100,hash:'a'.repeat(64),headerJson:{hash:'a'.repeat(64),header:{ledger_seq:scenario==='wrong-ledger'?99:100,base_reserve:5000000}}}]};
      },
    };
    if (scenario==='valid') await assert.doesNotReject(()=>checkClinicalWebRelayerBudget(server,actor));
    else await assert.rejects(()=>checkClinicalWebRelayerBudget(server,actor), /rehearsal_relayer_unfunded/);
    assert.equal(headerReads,['missing-account','wrong-account'].includes(scenario)?0:1);
  }
});


test('JSON reserve header avoids SDK14 decoding of newer SCP values; every binding still fails closed', async () => {
  for(const scenario of ['valid','missing-header','wrong-ledger','wrong-inner-ledger','wrong-hash','invalid-hash','missing-reserve','non-integer-reserve','zero-reserve','insufficient','raw-error']) {
    let rawReads=0,decodedReads=0;
    const ledger={hash:'a'.repeat(64),sequence:100,headerJson:{hash:'a'.repeat(64),header:{ledger_version:30,ledger_seq:100,base_reserve:5000000,scp_value:{ext:{signed_ms:{}}}}}};
    if(scenario==='wrong-ledger')ledger.sequence=99;
    if(scenario==='wrong-inner-ledger')ledger.headerJson.header.ledger_seq=99;
    if(scenario==='wrong-hash')ledger.headerJson.hash='b'.repeat(64);
    if(scenario==='invalid-hash')ledger.hash=ledger.headerJson.hash='not-a-hash';
    if(scenario==='missing-reserve')delete ledger.headerJson.header.base_reserve;
    if(scenario==='non-integer-reserve')ledger.headerJson.header.base_reserve='5000000';
    if(scenario==='zero-reserve')ledger.headerJson.header.base_reserve=0;
    const server={
      getLedgerEntries:async key=>({latestLedger:100,entries:[{key,val:xdr.LedgerEntryData.account(account(scenario==='insufficient'?'4009999999':'4010000000'))}]}),
      getLedgers:async()=>{decodedReads++;throw Error('XDR Read Error: unknown StellarValueType member for value 3');},
      _getLedgers:async request=>{rawReads++;assert.deepEqual(request,{startLedger:100,pagination:{limit:1},xdrFormat:'json'});if(scenario==='raw-error')throw Error('rpc_unavailable');return {ledgers:scenario==='missing-header'?[]:[ledger]};},
    };
    if(scenario==='valid')await assert.doesNotReject(()=>checkClinicalWebRelayerBudget(server,actor));
    else await assert.rejects(()=>checkClinicalWebRelayerBudget(server,actor),/rehearsal_relayer_unfunded/);
    assert.equal(decodedReads,0);assert.equal(rawReads,1);
  }
});
