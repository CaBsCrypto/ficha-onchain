import { privateApi,uuid } from '@/lib/private-api';
import { PrivateFlowError } from '@/lib/private-config';
import { readPrivateDocument } from '@/lib/private-prescriptions';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){return privateApi(request,async actor=>{
  const {id}=await params;if(!uuid(id))throw new PrivateFlowError('invalid_resource',400);
  return readPrivateDocument(actor,id);
});}
