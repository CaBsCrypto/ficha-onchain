import {beforeEach,expect,it,vi} from 'vitest';
import type {Sql} from '@/lib/db';
const m=vi.hoisted(()=>({local:vi.fn(),chain:vi.fn()}));
vi.mock('@/lib/doctor-onboarding',()=>({isDoctorLocallyApproved:m.local}));
vi.mock('@/lib/doctor-authorizations',()=>({readPrivateDoctor:m.chain}));
import {isApprovedDoctor} from '@/lib/doctor-access';
const sql={} as Sql,owner={userId:'doctor',email:'Doctor@Example.Test',walletId:'wallet',address:'stellar-address'};
beforeEach(()=>{vi.resetAllMocks();m.local.mockResolvedValue(true);m.chain.mockResolvedValue({authorized:true});});
it('requires a confirmed local review even when the chain would authorize the wallet',async()=>{
 m.local.mockResolvedValue(false);
 expect(await isApprovedDoctor(sql,1,owner)).toBe(false);
 expect(m.chain).not.toHaveBeenCalled();
});
it('requires current chain authorization after local approval',async()=>{
 m.chain.mockResolvedValue({authorized:false});
 expect(await isApprovedDoctor(sql,1,owner)).toBe(false);
});
it('uses the same verified identity and normalized email for local approval',async()=>{
 expect(await isApprovedDoctor(sql,1,owner)).toBe(true);
 expect(m.local).toHaveBeenCalledWith(sql,1,{...owner,email:'doctor@example.test'});
 expect(m.chain).toHaveBeenCalledWith(owner.address);
});
it('propagates unavailable dependencies instead of authorizing or hiding the failure',async()=>{
 m.local.mockRejectedValue(new Error('database unavailable'));
 await expect(isApprovedDoctor(sql,1,owner)).rejects.toThrow('database unavailable');
 expect(m.chain).not.toHaveBeenCalled();
 m.local.mockResolvedValue(true);m.chain.mockRejectedValue(new Error('RPC unavailable'));
 await expect(isApprovedDoctor(sql,1,owner)).rejects.toThrow('RPC unavailable');
});
