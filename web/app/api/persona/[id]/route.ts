import { NextRequest, NextResponse } from 'next/server';
import { getPersonaById } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const persona = await getPersonaById(params.id);
  if (!persona) return NextResponse.json({ error: 'Persona not found' }, { status: 404 });
  return NextResponse.json(persona);
}
