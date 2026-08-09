import { Router } from 'express';
import { MATRIX, SCALE_OPTIONS, TRAIT_ORDER } from '../persona/matrix';
import { computeProfile, buildPersonaText, personaArchetype, RawResponses } from '../persona/profile';
import { buildVector } from '../persona/vector';
import { savePersona, getPersonaById } from '../vector/store';
import { pool } from '../db';
import { config } from '../config';
import { optionalAuth } from '../services/auth';

const router = Router();

// The 34-question matrix (single source of truth for the client).
router.get('/matrix', (_req, res) => {
  res.json({ questions: MATRIX, scale: SCALE_OPTIONS, traitOrder: TRAIT_ORDER });
});

// Submit an evaluation -> compute persona + vector, persist, return result.
// Attaches the evaluation to the authenticated user when a session is present.
router.post('/evaluate', optionalAuth, async (req: any, res) => {
  try {
    const { responses, email = null, displayName = null } = req.body as {
      responses: RawResponses;
      email?: string | null;
      displayName?: string | null;
    };
    if (!responses || typeof responses !== 'object') {
      return res.status(400).json({ error: 'responses object is required' });
    }
    const answered = MATRIX.filter((q) => responses[q.id] !== undefined);
    if (answered.length < MATRIX.length) {
      return res
        .status(400)
        .json({ error: `Please answer all ${MATRIX.length} questions (${answered.length}/${MATRIX.length} answered).` });
    }

    const profile = computeProfile(responses);
    const vector = buildVector(profile, config.vectorDim, config.personaProjectionSeed);
    const personaText = buildPersonaText(profile);
    const archetype = personaArchetype(profile);

    let userId: string | null = req.user?.id ?? null;
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
    });

    res.status(201).json({
      evaluationId,
      archetype,
      profile: profile,
      personaText,
      vectorDim: vector.length,
      vectorPreview: vector.slice(0, 8),
    });
  } catch (err: any) {
    console.error('[persona] evaluate error:', err);
    res.status(500).json({ error: err?.message || 'Evaluation failed' });
  }
});

router.get('/:id', async (req, res) => {
  const persona = await getPersonaById(req.params.id);
  if (!persona) return res.status(404).json({ error: 'Persona not found' });
  res.json(persona);
});

export default router;
