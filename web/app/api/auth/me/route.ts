import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { pool } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  return NextResponse.json({ user });
}

export async function PATCH(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const name =
    typeof body?.displayName === 'string' ? body.displayName.trim().slice(0, 80) : '';
  if (!name) return NextResponse.json({ error: 'A name is required' }, { status: 400 });

  const { rows } = await pool.query(
    `UPDATE users SET display_name = $1 WHERE id = $2 RETURNING id, email, display_name`,
    [name, user.id]
  );
  if (!rows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  return NextResponse.json({
    user: {
      id: rows[0].id as string,
      email: rows[0].email as string,
      displayName: (rows[0].display_name as string | null) ?? null,
    },
  });
}
