import { NextResponse } from 'next/server';

export interface ErrBody {
  code: string;
  message: string;
  data?: Record<string, unknown>;
}

export function errorResponse(status: number, code: string, message: string, data?: Record<string, unknown>) {
  const body: ErrBody = { code, message, data };
  return NextResponse.json(body, { status });
}

export function readClientIp(req: Request): string {
  const h = req.headers;
  const xff = h.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return h.get('x-real-ip') || h.get('cf-connecting-ip') || '';
}
