import { NextResponse,type NextRequest } from 'next/server';
import { isPrivatePortalPath } from '@/lib/private-routes';
export function proxy(request:NextRequest) {
  const local=!process.env.VERCEL&&['localhost','127.0.0.1'].includes(request.nextUrl.hostname)&&process.env.TRUSTLEAF_PRIVY_SIGNING_CHECK==='true';
  if(!isPrivatePortalPath(request.nextUrl.pathname,local))return NextResponse.json({error:'module_outside_current_delivery'},{status:410});
  return NextResponse.next();
}
export const config={matcher:['/((?!_next/static|_next/image|favicon.ico).*)']};
