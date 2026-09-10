import {NextResponse} from 'next/server';
import {getDb} from '@/lib/db';
import {requireUser,unauthorized} from '@/lib/auth/privy-auth';
import {verifiedWallet,readPrivateDoctor,authorizationView,latestDoctorRequest} from '@/lib/doctor-authorizations';
import {doctorOnboardingView} from '@/lib/doctor-onboarding';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 const user=await requireUser(request);if(!user?.email)return unauthorized();
 try{
  const sql=getDb(),wallet=await verifiedWallet(sql,user.userId,user.email);
  const claimed=new URL(request.url).searchParams.get('wallet');
  if(claimed&&claimed!==wallet.address)return NextResponse.json({authorized:false,error:'wallet_owner_mismatch'}, {status:403});
  const [doctor]=await sql`SELECT id,name,email,specialty,status FROM doctors WHERE LOWER(email)=${user.email}`;
  const chain=await readPrivateDoctor(wallet.address);
  const onboarding=(await doctorOnboardingView(sql,user)).onboarding;
  return NextResponse.json({authorized:!!doctor&&chain.authorized,source:'private_registry',wallet:wallet.address,doctor:doctor??null,onboarding:onboarding?{state:onboarding.state,source:onboarding.source}:null,authorization:authorizationView(chain),pendingRequest:await latestDoctorRequest(sql,wallet.address)}, {headers:{'Cache-Control':'no-store'}});
 }catch{return NextResponse.json({authorized:false,source:'private_registry',error:'private_registry_unavailable'}, {status:503});}
}
