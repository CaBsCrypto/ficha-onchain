import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Keypair } from '@stellar/stellar-sdk';
const mocks=vi.hoisted(()=>({send:vi.fn(),receipt:vi.fn(),account:vi.fn(),prepare:vi.fn(),ledger:vi.fn(),fetch:vi.fn()}));
vi.mock('@/lib/stellar/client',()=>({server:{sendTransaction:mocks.send,getTransaction:mocks.receipt,getAccount:mocks.account,prepareTransaction:mocks.prepare}}));
import { feeBumpAndSend,sendAndConfirm,deployClinicalRecord } from '@/lib/stellar/server';
import { createPrivateChain,sponsorOwnerSignature } from '@/lib/stellar/private-chain';
import { POST as relay } from '@/app/api/relay/route';
import { POST as fundedProbe } from '@/app/api/privy/signing-check/route';
beforeEach(()=>{
 vi.clearAllMocks();vi.stubEnv('RELAYER_SECRET','invalid-secret-must-never-be-parsed');
 vi.stubEnv('TRUSTLEAF_PRIVATE_WRITES_ENABLED','true');vi.stubEnv('TRUSTLEAF_SPONSORSHIP_ENABLED','true');
 vi.stubEnv('TRUSTLEAF_PRIVY_SIGNING_CHECK','true');vi.stubGlobal('fetch',mocks.fetch);
});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
it('legacy fee bump, raw send and deployment deny before secret parsing or network',async()=>{
 await expect(feeBumpAndSend('invalid-envelope')).rejects.toThrow('sponsorship_path_disabled');
 await expect(sendAndConfirm({} as any)).rejects.toThrow('sponsorship_path_disabled');
 await expect(deployClinicalRecord({ownerAddress:'invalid',deployerSecret:'invalid'})).rejects.toThrow('sponsorship_path_disabled');
 expect(mocks.send).not.toHaveBeenCalled();expect(mocks.account).not.toHaveBeenCalled();expect(mocks.prepare).not.toHaveBeenCalled();
});
it('private preparation denies before missing-account lookup or Friendbot and submit denies before parse/send',async()=>{
 const chain=createPrivateChain({getAccount:mocks.account,prepareTransaction:mocks.prepare,sendTransaction:mocks.send} as any);
 await expect(chain.prepare('invalid','consent',{} as any)).rejects.toThrow('sponsorship_path_disabled');
 await expect(chain.submit('invalid-envelope')).rejects.toThrow('sponsorship_path_disabled');
 expect(()=>sponsorOwnerSignature('invalid','invalid','invalid','consent',{} as any)).toThrow('sponsorship_path_disabled');
 expect(mocks.account).not.toHaveBeenCalled();expect(mocks.fetch).not.toHaveBeenCalled();expect(mocks.send).not.toHaveBeenCalled();
});
it('private receipt and persistent consent reads remain usable with the real closed gate',async()=>{
 const patient=Keypair.fromRawEd25519Seed(Buffer.alloc(32,82)).publicKey(),doctor=Keypair.fromRawEd25519Seed(Buffer.alloc(32,83)).publicKey();
 mocks.receipt.mockResolvedValue({status:'NOT_FOUND'});mocks.ledger.mockResolvedValue({entries:[]});
 const chain=createPrivateChain({getTransaction:mocks.receipt,getLedgerEntries:mocks.ledger} as any);
 expect(await chain.receipt('same-saved-hash')).toEqual({status:'NOT_FOUND'});
 expect(await chain.consent({patient,doctor,issuanceId:'ab'.repeat(32),validUntil:1})).toBeNull();
 expect(mocks.receipt).toHaveBeenCalledWith('same-saved-hash');expect(mocks.ledger).toHaveBeenCalledOnce();
});
it('raw relay and legacy funded probe return503 without parsing input, auth, secrets or calling a provider',async()=>{
 for(const [handler,url] of [[relay,'relay'],[fundedProbe,'privy/signing-check']] as const){
   const response=await handler(new Request('http://127.0.0.1:3016/api/'+url,{method:'POST',body:'not-json'}));
   expect(response.status).toBe(503);expect(await response.json()).toEqual({error:'sponsorship_path_disabled'});
 }
 expect(mocks.fetch).not.toHaveBeenCalled();expect(mocks.send).not.toHaveBeenCalled();expect(mocks.account).not.toHaveBeenCalled();
});
