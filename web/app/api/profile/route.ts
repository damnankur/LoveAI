import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { pool } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    const { rows } = await pool.query(
      `SELECT id, responses, dimensions, profile, persona_type, completed_at
       FROM persona_evaluations
       WHERE user_id = $1
       ORDER BY completed_at DESC
       LIMIT 1`,
      [user.id]
    );

    return NextResponse.json({
      user: { id: user.id, email: user.email, displayName: user.displayName },
      evaluation: rows.length
        ? {
            id: rows[0].id,
            responses: rows[0].responses,
            dimensions: rows[0].dimensions,
            profile: rows[0].profile,
            personaType: rows[0].persona_type ?? null,
            completedAt: rows[0].completed_at,
          }
        : null,
    });
  } catch (err: any) {
    console.error('[profile] error:', err?.message);
    return NextResponse.json({ error: err?.message || 'Failed to load profile' }, { status: 500 });
  }
}
