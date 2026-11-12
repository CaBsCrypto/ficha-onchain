import { NextResponse } from 'next/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/** Raw XDR has no verified patient, scope or persistent reservation. */
export async function POST(_request: Request) {
  return NextResponse.json({ error: 'sponsorship_path_disabled' }, { status: 503 });
}
