import { pool, isPgvectorAvailable } from './db';
import { cosineSimilarity } from './persona/vector';

export interface StoredPersona {
  id: string;
  profile: string;
  dimensions: Record<string, number>;
  personaType?: string | null;
  similarity?: number;
}

export interface SavePersonaInput {
  userId: string | null;
  responses: Record<string, number>;
  dimensions: Record<string, number>;
  profile: string;
  vector: number[];
  personaType?: string | null;
}

export async function savePersona(input: SavePersonaInput): Promise<string> {
  const pgv = await isPgvectorAvailable();
  if (pgv) {
    const { rows } = await pool.query(
      `INSERT INTO persona_evaluations (user_id, responses, dimensions, profile, persona_type, persona_vector, persona_vector_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [input.userId, input.responses, input.dimensions, input.profile, input.personaType ?? null,
       `[${input.vector.join(',')}]`, JSON.stringify(input.vector)]
    );
    return rows[0].id;
  }
  const { rows } = await pool.query(
    `INSERT INTO persona_evaluations (user_id, responses, dimensions, profile, persona_type, persona_vector_json)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [input.userId, input.responses, input.dimensions, input.profile, input.personaType ?? null, JSON.stringify(input.vector)]
  );
  return rows[0].id;
}

/**
 * Find personas whose 768-dim embedding is closest to the given query vector.
 *
 * Uses pgvector `<=>` (cosine distance) when available, falls back to pure-JS
 * cosine similarity otherwise.  Results are deduplicated by persona_type label
 * so the caller never sees two nearly-identical archetypes in the RAG block.
 *
 * @param vector       Query vector (L2-normalised, 768-D).
 * @param limit        Max results after dedup & thresholding  (default 5).
 * @param minSimilarity  Minimum cosine similarity to include (default 0.7).
 * @param excludeId    UUID to skip (usually the user's own evaluation).
 */
export async function findSimilarPersonas(
  vector: number[],
  limit = 5,
  minSimilarity = 0.7,
  excludeId?: string
): Promise<StoredPersona[]> {
  // Fetch a bit more than we need so post-filtering (dedup + threshold) still leaves enough.
  const fetchLimit = Math.max(limit * 2, 10);

  if (await isPgvectorAvailable()) {
    // ---- Fast path: pgvector HNSW index does the heavy lifting ----
    const { rows } = await pool.query(
      `SELECT id, profile, dimensions, persona_type, persona_vector_json,
              1 - (persona_vector <=> $1::vector) AS similarity
       FROM persona_evaluations
       WHERE persona_vector IS NOT NULL
         AND ($2::uuid IS NULL OR id <> $2::uuid)
       ORDER BY persona_vector <=> $1::vector
       LIMIT $3`,
      [`[${vector.join(',')}]`, excludeId ?? null, fetchLimit]
    );

    return postFilterAndDedupe(rows.map((r) => ({
      id: r.id,
      profile: r.profile,
      dimensions: r.dimensions,
      personaType: r.persona_type ?? null,
      similarity: Number(r.similarity),
    })), limit, minSimilarity);
  }

  // ---- Graceful degradation: no pgvector extension ----
  // Fetch all candidates (JSONB is always present if a vector was saved).
  const { rows } = await pool.query(
    `SELECT id, profile, dimensions, persona_type, persona_vector_json
     FROM persona_evaluations
     WHERE persona_vector_json IS NOT NULL`
  );

  const scored = rows
    .filter((r) => !excludeId || r.id !== excludeId)
    .filter((r): r is typeof r & { persona_vector_json: number[] } => Array.isArray(r.persona_vector_json))
    .map((r) => ({
      id: r.id,
      profile: r.profile,
      dimensions: r.dimensions,
      personaType: r.persona_type ?? null,
      similarity: cosineSimilarity(vector, r.persona_vector_json),
    }))
    .filter((r) => r.similarity >= minSimilarity)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, fetchLimit);

  return postFilterAndDedupe(scored, limit, minSimilarity);
}

/**
 * Post-process: apply similarity threshold → dedupe by persona_type (keep best per type).
 */
function postFilterAndDedupe(
  candidates: StoredPersona[],
  limit: number,
  minSimilarity: number
): StoredPersona[] {
  // 1. Enforce minimum similarity (never return weak matches); drop any rows
  //    missing a score (defensive guard).
  const filtered = candidates
    .filter((r) => r.similarity !== undefined && r.similarity >= minSimilarity);

  // 2. Deduplicate: group by persona_type label, keep highest-similarity per group.
  //    This prevents two near-identical MBTI/archetype personas from both appearing.
  const bestPerType = new Map<string, StoredPersona>();
  for (const p of filtered) {
    const key = p.personaType ?? '__untyped__';
    const existing = bestPerType.get(key);
    if (!existing || (p.similarity ?? -1) > (existing.similarity ?? -1)) {
      bestPerType.set(key, p);
    }
  }

  // 3. Sort descending by similarity and cap at limit.
  return [...bestPerType.values()]
    .sort((a, b) => (b.similarity ?? -1) - (a.similarity ?? -1))
    .slice(0, limit);
}

export async function getPersonaById(id: string): Promise<StoredPersona | null> {
  const { rows } = await pool.query(
    `SELECT id, profile, dimensions, persona_type FROM persona_evaluations WHERE id = $1`,
    [id]
  );
  if (!rows.length) return null;
  return {
    id: rows[0].id,
    profile: rows[0].profile,
    dimensions: rows[0].dimensions,
    personaType: rows[0].persona_type ?? null,
  };
}
