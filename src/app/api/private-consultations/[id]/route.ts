import { privateApi } from '@/lib/private-api';
import { PrivateFlowError } from '@/lib/private-config';
import { readPrivateConsultation } from '@/lib/private-prescriptions';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){return privateApi(request,async actor=>{
  const {id}=await params;if(!/^[1-9][0-9]*$/.test(id)||!Number.isSafeInteger(Number(id)))throw new PrivateFlowError('invalid_resource',400);
  return readPrivateConsultation(actor,Number(id));
});}
