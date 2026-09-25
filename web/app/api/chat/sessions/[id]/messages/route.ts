import { NextRequest, NextResponse } from 'next/server';
import { getSession, saveMessage, getMessages } from '@/lib/repositories';
import { getPersonaById, findSimilarPersonas } from '@/lib/store';
import { buildVector } from '@/lib/persona/vector';
import { Profile } from '@/lib/persona/profile';
import { generateReply } from '@/lib/llm';
import { config } from '@/lib/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RAG_LIMIT = Number(process.env.RAG_LIMIT) || 5;
const RAG_MIN_SIMILARITY = Number(process.env.RAG_MIN_SIMILARITY) || 0.7;

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(params.id);
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  return NextResponse.json({ messages: await getMessages(params.id) });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getSession(params.id);
    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });

    const body = await req.json().catch(() => ({}));
    const text = String(body?.message || '').trim();
    if (!text) return NextResponse.json({ error: 'message is required' }, { status: 400 });

    const persona = await getPersonaById(session.persona_evaluation_id);
    if (!persona) return NextResponse.json({ error: 'Persona evaluation not found' }, { status: 404 });

    const profile = persona.dimensions as unknown as Profile;
    const vector = buildVector(profile, config.vectorDim, config.personaProjectionSeed);

    const history = (await getMessages(session.id, 20))
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    const similarPersonas = await findSimilarPersonas(
      vector,
      RAG_LIMIT,
      RAG_MIN_SIMILARITY,
      session.persona_evaluation_id
    );

    await saveMessage(session.id, 'user', text);

    const reply = await generateReply({
      personaText: persona.profile,
      profile,
      similarPersonas,
      history,
      userMessage: text,
    });

    await saveMessage(session.id, 'assistant', reply);

    return NextResponse.json({
      reply,
      similarPersonas: similarPersonas.map((p) => ({
        id: p.id,
        personaType: p.personaType ?? null,
        similarity: Number((p.similarity ?? 0).toFixed(3)),
      })),
      ragUsed: similarPersonas.length > 0,
    });
  } catch (err: any) {
    console.error('[chat] message error:', err);
    return NextResponse.json({ error: err?.message || 'Failed to generate reply' }, { status: 500 });
  }
}
