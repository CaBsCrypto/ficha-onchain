import { NextResponse } from 'next/server';
import { requireUser, unauthorized, type AuthedUser } from '@/lib/auth/privy-auth';
import { isSameOrigin } from '@/lib/auth/same-origin';
import { assertPrivateEnvironment, PrivateFlowError } from '@/lib/private-config';
import { DoctorAuthorizationError } from '@/lib/doctor-authorizations';
import { WalletBindingError } from '@/lib/stellar/privy-wallet-binding';

export async function privateApi(request:Request,work:(actor:AuthedUser)=>Promise<unknown>) {
  const actor=await requireUser(request);
  if(!actor?.email)return unauthorized();
  if(request.method!=='GET'&&!isSameOrigin(request))return NextResponse.json({error:'forbidden'},{status:403});
  try {
    assertPrivateEnvironment();
    return NextResponse.json(await work(actor),{headers:{'Cache-Control':'no-store'}});
  }catch(error) {
    const known=error instanceof PrivateFlowError||error instanceof DoctorAuthorizationError;
    return NextResponse.json({error:known||error instanceof WalletBindingError?error.message:'private_service_unavailable'},
      {status:known?error.status:error instanceof WalletBindingError?409:503,headers:{'Cache-Control':'no-store'}});
  }
}
export async function privateBody(request:Request,keys:string[]) {
  let body:unknown;
  try{body=await request.json();}catch{throw new PrivateFlowError('invalid_json',400);}
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!keys.includes(k)))throw new PrivateFlowError('invalid_request',400);
  return body as Record<string,unknown>;
}
export function uuid(value:unknown):value is string {return typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);}
