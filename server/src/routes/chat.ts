import { Router } from 'express';
import { config } from '../config';
import { createSession, getSession, saveMessage, getMessages } from '../repositories';
import { getPersonaById } from '../vector/store';
import { buildVector } from '../persona/vector';
import { Profile } from '../persona/profile';
import { pool } from '../db';
import { findSimilarPersonas } from '../vector/store';
import { generateReply } from '../services/llm';

const router = Router();

const RAG_LIMIT = Number(process.env.RAG_LIMIT) || 5;
const RAG_MIN_SIMILARITY = Number(process.env.RAG_MIN_SIMILARITY) || 0.25;

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

// Start a chat session bound to a completed persona evaluation.
router.post('/sessions', async (req, res) => {
  try {
    const { evaluationId, email = null, displayName = null } = req.body as {
      evaluationId: string;
      email?: string | null;
      displayName?: string | null;
    };
    if (!evaluationId) {
      return res.status(400).json({ error: 'evaluationId is required' });
    }
    const persona = await getPersonaById(evaluationId);
    if (!persona) return res.status(404).json({ error: 'Persona evaluation not found' });

    const userId = await resolveUserId(email, displayName);
    const sessionId = await createSession(userId, evaluationId);
    await saveMessage(sessionId, 'system', `Session started for persona ${evaluationId}`);

    res.status(201).json({ sessionId, evaluationId });
  } catch (err: any) {
    console.error('[chat] create session error:', err);
    res.status(500).json({ error: err?.message || 'Failed to create session' });
  }
});

// Conversation history for a session.
router.get('/sessions/:id/messages', async (req, res) => {
  const session = await getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  res.json({ messages: await getMessages(req.params.id) });
});

// Send a user message: RAG-retrieve similar personas, generate a persona-aware reply.
router.post('/sessions/:id/messages', async (req, res) => {
  try {
    const session = await getSession(req.params.id);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const { message } = req.body as { message?: string };
    const text = (message || '').trim();
    if (!text) return res.status(400).json({ error: 'message is required' });

    const persona = await getPersonaById(session.persona_evaluation_id);
    if (!persona) return res.status(404).json({ error: 'Persona evaluation not found' });

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

    res.json({
      reply,
      similarPersonas: similarPersonas.map((p) => ({
        id: p.id,
        similarity: Number((p.similarity ?? 0).toFixed(3)),
      })),
      ragUsed: similarPersonas.length > 0,
    });
  } catch (err: any) {
    console.error('[chat] message error:', err);
    res.status(500).json({ error: err?.message || 'Failed to generate reply' });
  }
});

export default router;
