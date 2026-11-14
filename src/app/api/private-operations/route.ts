import { privateApi,privateBody,uuid } from '@/lib/private-api';
import { PrivateFlowError } from '@/lib/private-config';
import { preparePrivateOperation } from '@/lib/private-operations';
import { type PrivateAction } from '@/lib/stellar/private-chain';
import { assertPrivateRxLoopback, assertPrivateRxOperationIntent, currentPrivateRxScope, privateRxIssuanceScope, privateRxScopeConfigured } from '@/lib/digital-cabs-rx';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
export async function POST(request:Request){return privateApi(request,async actor=>{
  const body=await privateBody(request,['action','appointmentId','prescriptionId','confirmed']);
  if(!['consent','withdraw_consent','mint','activate','revoke'].includes(String(body.action))||body.confirmed!==true)throw new PrivateFlowError('explicit_confirmation_required',400);
  const patientAction=body.action==='consent'||body.action==='withdraw_consent';
  if(patientAction?(!Number.isSafeInteger(body.appointmentId)||Number(body.appointmentId)<1||body.prescriptionId!==undefined):(!uuid(body.prescriptionId)||body.appointmentId!==undefined))throw new PrivateFlowError('invalid_resource',400);
  const scope=privateRxIssuanceScope(currentPrivateRxScope()), action=body.action as PrivateAction;
  const resource=patientAction?{appointmentId:Number(body.appointmentId)}:{prescriptionId:String(body.prescriptionId)};
  if(scope) {
    assertPrivateRxLoopback(request);
    assertPrivateRxOperationIntent(scope,actor,action,resource);
    return preparePrivateOperation(actor,action,resource,scope);
  }
  return preparePrivateOperation(actor,action,resource);
},{strict:privateRxScopeConfigured()});}
