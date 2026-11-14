import type { RehearsalPolicy } from './clinical-rehearsal-policy.mjs';
/** Schema14 approval/time checked before RPC and before using the pinned full receipt. */
export function resolveRehearsalReceipt(policy:RehearsalPolicy,hash:string,options:{receipt:(hash:string)=>Promise<unknown>;now?:number}):Promise<unknown>;
