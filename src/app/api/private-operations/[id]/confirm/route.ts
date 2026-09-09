import { privateApi,privateBody,uuid } from '@/lib/private-api';
import { PrivateFlowError } from '@/lib/private-config';
import { confirmPrivateOperation } from '@/lib/private-operations';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){return privateApi(request,async actor=>{
  const {id}=await params,body=await privateBody(request,['signature']);
  if(!uuid(id)||typeof body.signature!=='string'||! /^(?:0x)?[a-f0-9]{128}$/i.test(body.signature))throw new PrivateFlowError('invalid_signature',400);
  return confirmPrivateOperation(actor,id,body.signature);
});}
