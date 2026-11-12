import { NextResponse } from 'next/server';
export const runtime = 'nodejs';
/** The legacy funded probe is not integrated with persistent sponsorship. */
export async function POST(_request: Request) {
  return NextResponse.json({ error: 'sponsorship_path_disabled' }, { status: 503 });
}
