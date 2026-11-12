import { privateApi,privateBody } from '@/lib/private-api';
import { PrivateFlowError } from '@/lib/private-config';
import { listPrivatePrescriptions,preparePrescription } from '@/lib/private-prescriptions';
import { assertPrivateRxActor, assertPrivateRxDocument, assertPrivateRxLoopback, currentPrivateRxScope, privateRxIssuanceScope, privateRxScopeConfigured } from '@/lib/digital-cabs-rx';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
export async function GET(request:Request){return privateApi(request,async actor=>{
  const role=new URL(request.url).searchParams.get('role');
  if(role!=='doctor'&&role!=='patient')throw new PrivateFlowError('invalid_role',400);
  return listPrivatePrescriptions(actor,role);
});}
export async function POST(request:Request){return privateApi(request,async actor=>{
  const body=await privateBody(request,['appointmentId','document','validDays']);
  if(!Number.isSafeInteger(body.appointmentId)||Number(body.appointmentId)<1||(body.validDays!==undefined&&body.validDays!==30))throw new PrivateFlowError('invalid_prescription',400);
  const scope=privateRxIssuanceScope(currentPrivateRxScope());
  if(scope) {
    assertPrivateRxLoopback(request);
    if(body.appointmentId!==scope.appointmentId)throw new PrivateFlowError('private_rx_scope_rejected',403);
    assertPrivateRxActor(scope,actor,undefined,'doctor'); assertPrivateRxDocument(scope,body.document);
    return preparePrescription(actor,scope.appointmentId,body.document,scope);
  }
  return preparePrescription(actor,Number(body.appointmentId),body.document);
},{strict:privateRxScopeConfigured()});}
