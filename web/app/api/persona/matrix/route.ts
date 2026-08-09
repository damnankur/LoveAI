import { NextResponse } from 'next/server';
import { MATRIX, SCALE_OPTIONS, TRAIT_ORDER } from '@/lib/persona/matrix';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ questions: MATRIX, scale: SCALE_OPTIONS, traitOrder: TRAIT_ORDER });
}
