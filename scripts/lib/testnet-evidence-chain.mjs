import {Account, Address, BASE_FEE, Contract, Keypair, Networks, TransactionBuilder, nativeToScVal, rpc, scValToNative} from '@stellar/stellar-sdk';

export const address = value => new Address(value).toScVal();
export const bytes = value => nativeToScVal(Buffer.from(value,'hex'));
export const u64 = value => nativeToScVal(BigInt(value),{type:'u64'});

/** Synthetic runner only. Persist signed envelope/hash before sending; unknown
 * outcomes are reconciled using the same hash, never assigned a new sequence.
 */
export function testnetEvidenceChain({source,relayer,sign,transactions,save}) {
  const server=new rpc.Server('https://soroban-testnet.stellar.org');
  async function simulate(id,method,args=[]) {
    const tx=new TransactionBuilder(new Account(source,'0'),{fee:BASE_FEE,networkPassphrase:Networks.TESTNET})
      .addOperation(new Contract(id).call(method,...args)).setTimeout(60).build();
    return server.simulateTransaction(tx);
  }
  return {
    server,simulate,
    read:async(id,method,args=[])=>{
      const result=await simulate(id,method,args);
      if(!rpc.Api.isSimulationSuccess(result)||!result.result)throw Error('testnet_read_failed:'+method);
      return scValToNative(result.result.retval);
    },
    send:async(name,id,method,args,actor)=>{
      let tx=transactions[name];
      if(!tx) {
        const unsigned=new TransactionBuilder(await server.getAccount(actor),{fee:BASE_FEE,networkPassphrase:Networks.TESTNET})
          .addOperation(new Contract(id).call(method,...args)).setTimeout(180).build();
        const prepared=await server.prepareTransaction(unsigned);
        const signed=TransactionBuilder.fromXDR(await sign(actor,prepared.toXDR()),Networks.TESTNET);
        if(!signed.hash().equals(prepared.hash()) || !signed.signatures.some(s=>Keypair.fromPublicKey(actor).verify(signed.hash(),s.signature())))throw Error('invalid_test_signature');
        const outer=TransactionBuilder.buildFeeBumpTransaction(relayer,'2000000',signed,Networks.TESTNET);outer.sign(relayer);
        tx=transactions[name]={hash:outer.hash().toString('hex'),xdr:outer.toXDR(),actor,contractId:id,method,status:'prepared'};save();
        const result=await server.sendTransaction(outer);
        if(result.status==='ERROR')throw Error('submission_rejected_saved_hash');
      }
      if(tx.contractId!==id||tx.method!==method||tx.actor!==actor)throw Error('transaction_context_changed');
      for(let i=0;i<30;i++) {
        const result=await server.getTransaction(tx.hash);
        if(result.status==='SUCCESS'){
          tx.status='SUCCESS';tx.ledger=result.ledger;
          const value=scValToNative(result.returnValue);
          tx.value=typeof value==='bigint'?String(value):value;save();return value;
        }
        if(result.status==='FAILED')throw Error('confirmed_transaction_failure');
        await new Promise(r=>setTimeout(r,1000));
      }
      throw Error('transaction_pending_reconcile_same_hash');
    },
  };
}
