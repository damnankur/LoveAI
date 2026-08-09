import { NextRequest, NextResponse } from 'next/server';
import { bearerToken, deleteAuthSession } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const token = bearerToken(req);
  if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  await deleteAuthSession(token);
  return NextResponse.json({ ok: true });
}
