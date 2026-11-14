import { privateApi,uuid } from '@/lib/private-api';
import { PrivateFlowError } from '@/lib/private-config';
import { reconcilePrivateOperation } from '@/lib/private-operations';
import { assertHostedPrivateRxStatusHost, privateRxScopeConfigured } from '@/lib/digital-cabs-rx';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){return privateApi(request,async actor=>{
  const {id}=await params;if(!uuid(id))throw new PrivateFlowError('invalid_resource',400);
  assertHostedPrivateRxStatusHost(request);
  return reconcilePrivateOperation(actor,id);
},{strict:privateRxScopeConfigured()});}
