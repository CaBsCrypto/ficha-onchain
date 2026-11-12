import { beforeEach, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({connection:vi.fn(),sql:vi.fn(),query:vi.fn(),release:vi.fn(),environment:vi.fn(),writes:vi.fn()}));
vi.mock('@/lib/db',()=>({getDbConnection:m.connection,sqlForConnection:()=>m.sql}));
vi.mock('@/lib/doctor-authorizations',()=>({verifiedWallet:vi.fn(),resolveDoctor:vi.fn()}));
vi.mock('@/lib/private-config',()=>({assertPrivateEnvironment:m.environment,assertPrivateWrites:m.writes,PRIVY_APP:'synthetic',
  PrivateFlowError:class extends Error{constructor(message:string,public status=409){super(message);}}}));
import {onboardingTransaction} from '@/lib/doctor-onboarding';
beforeEach(()=>{vi.resetAllMocks();m.connection.mockResolvedValue({query:m.query,release:m.release});m.query.mockResolvedValue({rows:[]});});
it('keeps the ordinary write switch before connecting when no approved scope callback is supplied',async()=>{
  m.writes.mockImplementation(()=>{throw Error('private_writes_paused');});const work=vi.fn();
  await expect(onboardingTransaction('doctor@example.test',work)).rejects.toThrow('private_writes_paused');
  expect(m.connection).not.toHaveBeenCalled();expect(m.query).not.toHaveBeenCalled();expect(work).not.toHaveBeenCalled();
});
it('rejects an unapproved scope before connecting or issuing SQL',async()=>{
  const gate=vi.fn(async()=>{throw Error('clinical_rehearsal_approval_required');}),work=vi.fn();
  await expect(onboardingTransaction('doctor@example.test',work,{rehearsalWriteScope:gate})).rejects.toThrow('clinical_rehearsal_approval_required');
  expect(m.environment).toHaveBeenCalledOnce();expect(m.connection).not.toHaveBeenCalled();expect(work).not.toHaveBeenCalled();
});
it('rechecks the approved scope before BEGIN and after acquiring the normalized-email lock',async()=>{
  const gate=vi.fn(async(_client?:unknown)=>{}),work=vi.fn(async()=>({prepared:true}));
  expect(await onboardingTransaction(' DOCTOR@example.test ',work,{rehearsalWriteScope:gate})).toEqual({prepared:true});
  expect(gate).toHaveBeenCalledTimes(4);expect(m.writes).not.toHaveBeenCalled();
  const client=await m.connection.mock.results[0].value;expect(gate.mock.calls.map(args=>args[0])).toEqual([undefined,undefined,client,client]);
  expect(gate.mock.invocationCallOrder[2]).toBeGreaterThan(m.query.mock.invocationCallOrder[0]);expect(gate.mock.invocationCallOrder[2]).toBeLessThan(m.query.mock.invocationCallOrder[1]);
  expect(m.query.mock.calls[0]).toEqual(['BEGIN']);
  expect(m.query.mock.calls[1]).toEqual(['SELECT pg_advisory_xact_lock(hashtext($1))',['doctor-onboarding:doctor@example.test']]);
  expect(work).toHaveBeenCalledWith(m.sql);expect(m.query.mock.calls.at(-1)).toEqual(['COMMIT']);expect(m.release).toHaveBeenCalledOnce();
});
it('rolls back without preparing a request when the scope expires while waiting for the lock',async()=>{
  let calls=0;const gate=vi.fn(async()=>{if(++calls===4)throw Error('clinical_rehearsal_expired');}),work=vi.fn();
  await expect(onboardingTransaction('doctor@example.test',work,{rehearsalWriteScope:gate})).rejects.toThrow('clinical_rehearsal_expired');
  expect(work).not.toHaveBeenCalled();expect(m.query.mock.calls.at(-1)).toEqual(['ROLLBACK']);expect(m.release).toHaveBeenCalledOnce();
});

it('can reject a closed run inside BEGIN before email or doctor row locks and before enqueue',async()=>{
  const gate=vi.fn(async(client?:unknown)=>{if(client)throw Error('clinical_rehearsal_order_conflict');}),work=vi.fn();
  await expect(onboardingTransaction('doctor@example.test',work,{rehearsalWriteScope:gate})).rejects.toThrow('clinical_rehearsal_order_conflict');
  expect(m.query.mock.calls).toEqual([['BEGIN'],['ROLLBACK']]);expect(work).not.toHaveBeenCalled();expect(m.release).toHaveBeenCalledOnce();
});
