import { NextRequest, NextResponse } from 'next/server';
import { createAuthSession, upsertGoogleUser, verifyGoogleIdToken } from '@/lib/auth';
import { config } from '@/lib/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { idToken } = body as { idToken?: string };
    if (!idToken || typeof idToken !== 'string') {
      return NextResponse.json({ error: 'idToken is required' }, { status: 400 });
    }
    const profile = await verifyGoogleIdToken(idToken.trim(), config.googleClientId);
    const { user, created } = await upsertGoogleUser(profile);
    const token = await createAuthSession(user.id);
    return NextResponse.json({ token, user, created });
  } catch (err: any) {
    console.error('[auth] google login error:', err?.message);
    return NextResponse.json({ error: err?.message || 'Google authentication failed' }, { status: 401 });
  }
}
