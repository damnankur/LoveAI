import { NextRequest, NextResponse } from 'next/server';
import { MATRIX } from '@/lib/persona/matrix';
import { computeProfile, buildPersonaText, personaArchetype, RawResponses } from '@/lib/persona/profile';
import { buildVector } from '@/lib/persona/vector';
import { matchPersonaType } from '@/lib/persona/types';
import { savePersona } from '@/lib/store';
import { pool } from '@/lib/db';
import { config } from '@/lib/config';
import { getAuthUser } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { responses, email = null, displayName = null } = body as {
      responses: RawResponses;
      email?: string | null;
      displayName?: string | null;
    };
    if (!responses || typeof responses !== 'object') {
      return NextResponse.json({ error: 'responses object is required' }, { status: 400 });
    }
    const answered = MATRIX.filter((q) => responses[q.id] !== undefined);
    if (answered.length < MATRIX.length) {
      return NextResponse.json(
        { error: `Please answer all ${MATRIX.length} questions (${answered.length}/${MATRIX.length} answered).` },
        { status: 400 }
      );
    }

    const profile = computeProfile(responses);
    const vector = buildVector(profile, config.vectorDim, config.personaProjectionSeed);
    const personaText = buildPersonaText(profile);
    const archetype = personaArchetype(profile);
    const personaType = matchPersonaType(profile);

    const authUser = await getAuthUser(req);
    let userId: string | null = authUser?.id ?? null;
    if (!userId && email) {
      const { rows } = await pool.query(
        `INSERT INTO users (email, display_name) VALUES ($1, $2)
         ON CONFLICT (email) DO UPDATE SET display_name = COALESCE(users.display_name, EXCLUDED.display_name)
         RETURNING id`,
        [email, displayName]
      );
      userId = rows[0].id;
    }

    const evaluationId = await savePersona({
      userId,
      responses,
      dimensions: profile as unknown as Record<string, number>,
      profile: personaText,
      vector,
      personaType: personaType.label,
    });

    return NextResponse.json(
      {
        evaluationId,
        archetype,
        personaType: {
          key: personaType.key,
          label: personaType.label,
          tagline: personaType.tagline,
        },
        profile: profile,
        personaText,
        vectorDim: vector.length,
        vectorPreview: vector.slice(0, 8),
      },
      { status: 201 }
    );
  } catch (err: any) {
    console.error('[persona] evaluate error:', err);
    return NextResponse.json({ error: err?.message || 'Evaluation failed' }, { status: 500 });
  }
}
