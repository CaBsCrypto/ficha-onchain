import {NextResponse} from 'next/server';
import {getDb} from '@/lib/db';
import {requireUser,unauthorized} from '@/lib/auth/privy-auth';
import {verifiedWallet,readPrivateDoctor,authorizationView,latestDoctorRequest} from '@/lib/doctor-authorizations';
import {isDoctorLocallyApproved,onboardingForDoctor} from '@/lib/doctor-onboarding';
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
  const approved=doctor?await isDoctorLocallyApproved(sql,Number(doctor.id),{userId:user.userId,email:user.email,...wallet}):false;
  const onboarding=doctor?await onboardingForDoctor(sql,Number(doctor.id)):null;
  return NextResponse.json({authorized:approved&&chain.authorized,source:'private_registry',wallet:wallet.address,doctor:doctor??null,onboarding,authorization:authorizationView(chain),pendingRequest:await latestDoctorRequest(sql,wallet.address)}, {headers:{'Cache-Control':'no-store'}});
 }catch{return NextResponse.json({authorized:false,source:'private_registry',error:'private_registry_unavailable'}, {status:503});}
}
