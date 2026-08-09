import { pool, isPgvectorAvailable } from './db';
import { cosineSimilarity } from './persona/vector';

export interface StoredPersona {
  id: string;
  profile: string;
  dimensions: Record<string, number>;
  similarity?: number;
}

export interface SavePersonaInput {
  userId: string | null;
  responses: Record<string, number>;
  dimensions: Record<string, number>;
  profile: string;
  vector: number[];
}

export async function savePersona(input: SavePersonaInput): Promise<string> {
  const pgv = await isPgvectorAvailable();
  if (pgv) {
    const { rows } = await pool.query(
      `INSERT INTO persona_evaluations (user_id, responses, dimensions, profile, persona_vector, persona_vector_json)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [input.userId, input.responses, input.dimensions, input.profile,
       `[${input.vector.join(',')}]`, JSON.stringify(input.vector)]
    );
    return rows[0].id;
  }
  const { rows } = await pool.query(
    `INSERT INTO persona_evaluations (user_id, responses, dimensions, profile, persona_vector_json)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [input.userId, input.responses, input.dimensions, input.profile, JSON.stringify(input.vector)]
  );
  return rows[0].id;
}

export async function findSimilarPersonas(
  vector: number[],
  limit = 5,
  minSimilarity = 0.0,
  excludeId?: string
): Promise<StoredPersona[]> {
  const pgv = await isPgvectorAvailable();
  if (pgv) {
    const { rows } = await pool.query(
      `SELECT id, profile, dimensions,
              1 - (persona_vector <=> $1::vector) AS similarity
       FROM persona_evaluations
       WHERE persona_vector IS NOT NULL AND ($2::uuid IS NULL OR id <> $2::uuid)
       ORDER BY persona_vector <=> $1::vector
       LIMIT $3`,
      [`[${vector.join(',')}]`, excludeId ?? null, limit]
    );
    return rows
      .filter((r) => r.similarity >= minSimilarity)
      .map((r) => ({
        id: r.id,
        profile: r.profile,
        dimensions: r.dimensions,
        similarity: Number(r.similarity),
      }));
  }

  const { rows } = await pool.query(
    `SELECT id, profile, dimensions, persona_vector_json FROM persona_evaluations
     WHERE persona_vector_json IS NOT NULL`
  );
  const scored = rows
    .filter((r) => excludeId === undefined || r.id !== excludeId)
    .map((r) => ({
      id: r.id,
      profile: r.profile,
      dimensions: r.dimensions,
      similarity: cosineSimilarity(vector, r.persona_vector_json as number[]),
    }))
    .filter((r) => r.similarity >= minSimilarity)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
  return scored;
}

export async function getPersonaById(id: string): Promise<StoredPersona | null> {
  const { rows } = await pool.query(
    `SELECT id, profile, dimensions FROM persona_evaluations WHERE id = $1`,
    [id]
  );
  if (!rows.length) return null;
  return { id: rows[0].id, profile: rows[0].profile, dimensions: rows[0].dimensions };
}
