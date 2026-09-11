import { describe, it, expect, vi } from 'vitest';
import { Keypair } from '@stellar/stellar-sdk';
import type { Sql } from '@/lib/db';
import { resolveStellarWallet, type WalletProvider } from '@/lib/stellar/privy-wallet-binding';
function setup(count = 0) {
  let saved: {wallet_id:string|null;address:string|null}|undefined;
  const wallets = Array.from({length:count}, (_,i)=>({type:'wallet',chainType:'stellar',id:`w${i}`,address:Keypair.random().publicKey()}));
  const sql = (async (strings:TemplateStringsArray,...args:unknown[])=>{
    const query = strings.join('?');
    if(query.startsWith('SELECT')) return saved ? [{...saved}] : [];
    if(args.length===2) { if(saved) return []; saved={wallet_id:null,address:null}; return [{user_id:args[1]}]; }
    if(saved?.wallet_id && saved.wallet_id!==args[2]) return [];
    saved={wallet_id:args[2] as string,address:args[3] as string}; return [{...saved}];
  }) as Sql;
  const create = vi.fn(async ()=> { const w={type:'wallet',chainType:'stellar',id:'new',address:Keypair.random().publicKey()};wallets.push(w);return w; });
  const provider:WalletProvider={getUser:async()=>({linkedAccounts:wallets}),walletApi:{createWallet:create,getWallet:async({id})=>wallets.find(w=>w.id===id)!}};
  return {sql,provider,create,wallets,run:(create=false)=>resolveStellarWallet(sql,provider,'app','user',create)};
}
 describe('persistent Stellar wallet association',()=>{
  it('reuses one existing wallet on every login',async()=>{const s=setup(1);expect(await s.run()).toEqual(await s.run());expect(s.create).not.toHaveBeenCalled();});
  it('does not create on GET-style lookup',async()=>{const s=setup();await expect(s.run()).rejects.toThrow('wallet_creation_required');expect(s.create).not.toHaveBeenCalled();});
  it('blocks ambiguous legacy identities',async()=>{const s=setup(4);await expect(s.run(true)).rejects.toThrow('wallet_binding_ambiguous');expect(s.create).not.toHaveBeenCalled();});
  it('creates at most once with simultaneous requests',async()=>{const s=setup();await Promise.allSettled([s.run(true),s.run(true),s.run(true)]);expect(s.create).toHaveBeenCalledTimes(1);expect((await s.run()).walletId).toBe('new');});
  it('never retries uncertain provider creation',async()=>{const s=setup();s.create.mockRejectedValue(new Error('timeout'));await expect(s.run(true)).rejects.toThrow('timeout');await expect(s.run(true)).rejects.toThrow('wallet_creation_pending');expect(s.create).toHaveBeenCalledTimes(1);});
  it('recovers a lost response from the linked wallet',async()=>{const s=setup();s.create.mockImplementation(async()=>{s.wallets.push({type:'wallet',chainType:'stellar',id:'lost',address:Keypair.random().publicKey()});throw new Error('timeout');});await expect(s.run(true)).rejects.toThrow();expect((await s.run(true)).walletId).toBe('lost');expect(s.create).toHaveBeenCalledTimes(1);});
  it('blocks removal and replacement of a saved wallet',async()=>{const s=setup(1);await s.run();s.wallets[0]={...s.wallets[0],id:'changed'};await expect(s.run(true)).rejects.toThrow('wallet_binding_changed');});
  it('blocks extra Stellar wallets even with a saved binding without replacing or recreating it',async()=>{
    const s=setup(1),first=await s.run();
    s.wallets.push({type:'wallet',chainType:'stellar',id:'extra',address:Keypair.random().publicKey()});
    await expect(s.run(true)).rejects.toThrow('wallet_binding_ambiguous');
    expect(s.create).not.toHaveBeenCalled();
    s.wallets.pop();
    expect(await s.run()).toEqual(first);
  });
 });
