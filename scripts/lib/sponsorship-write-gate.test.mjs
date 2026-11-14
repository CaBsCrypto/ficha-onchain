import test from 'node:test';
import assert from 'node:assert/strict';
import { Keypair } from '@stellar/stellar-sdk';
import { assertUnintegratedSponsorship } from './sponsorship-write-gate.mjs';
import { createChain as doctorChain } from '../worker-doctor-authorizations.mjs';
import { createChain as bookingChain } from '../worker-prescription-bookings.mjs';
test('unintegrated gate ignores unrelated flags and cannot be enabled by a path argument', () => {
  const saved = [process.env.TRUSTLEAF_PRIVATE_WRITES_ENABLED,process.env.TRUSTLEAF_SPONSORSHIP_ENABLED];
  try {
    process.env.TRUSTLEAF_PRIVATE_WRITES_ENABLED='true';process.env.TRUSTLEAF_SPONSORSHIP_ENABLED='true';
    assert.throws(()=>assertUnintegratedSponsorship(),/^Error: sponsorship_path_disabled$/);
    assert.throws(()=>assertUnintegratedSponsorship('/api/private-clinical-operations'),/^Error: sponsorship_path_disabled$/);
  } finally {
    for(const [i,key] of ['TRUSTLEAF_PRIVATE_WRITES_ENABLED','TRUSTLEAF_SPONSORSHIP_ENABLED'].entries()) {
      if(saved[i]===undefined)delete process.env[key];else process.env[key]=saved[i];
    }
  }
});
for (const [name,factory] of [['doctor',doctorChain],['booking',bookingChain]]) {
  test(name+' worker defaults deny preparation, signing and sending before RPC, while receipts remain readable',async()=>{
    const calls=[],authority=Keypair.fromRawEd25519Seed(Buffer.alloc(32,80)),relayer=Keypair.fromRawEd25519Seed(Buffer.alloc(32,81));
    const forbidden=async()=>{calls.push('forbidden');throw Error('Unexpected network/signature');};
    const chain=factory({authority:authority.publicKey(),relayer,provider:{},signXdr:forbidden,
      server:{getAccount:forbidden,prepareTransaction:forbidden,simulateTransaction:forbidden,sendTransaction:forbidden,
        getTransaction:async hash=>{calls.push('receipt:'+hash);return {status:'NOT_FOUND'};}}});
    await assert.rejects(chain.prepare({},'attest'),/^Error: sponsorship_path_disabled$/);
    await assert.rejects(chain.submit('invalid-envelope',{}),/^Error: sponsorship_path_disabled$/);
    assert.deepEqual(calls,[]);
    assert.deepEqual(await chain.receipt('same-saved-hash'),{status:'NOT_FOUND'});
    assert.deepEqual(calls,['receipt:same-saved-hash']);
  });
}
