import { NextResponse } from 'next/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() {
  return NextResponse.json({
    ok: true,
    name: 'licenser-platform',
    version: '0.3.0',
    time: new Date().toISOString(),
  });
}
