import { NextRequest, NextResponse } from 'next/server';
import { createSession, saveMessage } from '@/lib/repositories';
import { getPersonaById } from '@/lib/store';
import { pool } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function resolveUserId(email: string | null, displayName: string | null): Promise<string | null> {
  if (!email) return null;
  const { rows } = await pool.query(
    `INSERT INTO users (email, display_name) VALUES ($1, $2)
     ON CONFLICT (email) DO UPDATE SET display_name = COALESCE(users.display_name, EXCLUDED.display_name)
     RETURNING id`,
    [email, displayName]
  );
  return rows[0].id;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { evaluationId, email = null, displayName = null } = body as {
      evaluationId: string;
      email?: string | null;
      displayName?: string | null;
    };
    if (!evaluationId) {
      return NextResponse.json({ error: 'evaluationId is required' }, { status: 400 });
    }
    const persona = await getPersonaById(evaluationId);
    if (!persona) return NextResponse.json({ error: 'Persona evaluation not found' }, { status: 404 });

    const userId = await resolveUserId(email, displayName);
    const sessionId = await createSession(userId, evaluationId);
    await saveMessage(sessionId, 'system', `Session started for persona ${evaluationId}`);

    return NextResponse.json({ sessionId, evaluationId }, { status: 201 });
  } catch (err: any) {
    console.error('[chat] create session error:', err);
    return NextResponse.json({ error: err?.message || 'Failed to create session' }, { status: 500 });
  }
}
