// Seeds the five fixed persona prototypes into persona_evaluations (user_id NULL).
// Run from web/:  npx tsx --env-file=.env.local scripts/seed-persona-types.ts
import { pool } from '../lib/db';
import { PERSONA_TYPES } from '../lib/persona/types';
import { buildVector } from '../lib/persona/vector';
import { config } from '../lib/config';

async function main() {
  const pgv = await pool
    .query("SELECT 1 FROM pg_type WHERE typname = 'vector'")
    .then((r) => r.rows.length > 0)
    .catch(() => false);

  const existing = await pool.query(
    `SELECT id FROM persona_evaluations WHERE user_id IS NULL AND persona_type IS NOT NULL`
  );
  if (existing.rows.length) {
    await pool.query(`DELETE FROM persona_evaluations WHERE id = ANY($1::uuid[])`, [
      existing.rows.map((r) => r.id),
    ]);
    console.log(`removed ${existing.rows.length} existing seed personas`);
  }

  for (const t of PERSONA_TYPES) {
    const vector = buildVector(t.profile, config.vectorDim, config.personaProjectionSeed);
    const profileText = `Persona type: ${t.label} — ${t.tagline}. ${t.description}`;
    if (pgv) {
      await pool.query(
        `INSERT INTO persona_evaluations
           (user_id, responses, dimensions, profile, persona_type, persona_vector, persona_vector_json)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          null,
          JSON.stringify({}),
          JSON.stringify(t.profile),
          profileText,
          t.label,
          `[${vector.join(',')}]`,
          JSON.stringify(vector),
        ]
      );
    } else {
      await pool.query(
        `INSERT INTO persona_evaluations
           (user_id, responses, dimensions, profile, persona_type, persona_vector_json)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [null, JSON.stringify({}), JSON.stringify(t.profile), profileText, t.label, JSON.stringify(vector)]
      );
    }
    console.log(`seeded ${t.label} (${vector.length}-dim)`);
  }

  const { rows } = await pool.query(
    `SELECT persona_type, count(*) FROM persona_evaluations WHERE user_id IS NULL GROUP BY persona_type ORDER BY 1`
  );
  console.log('seed rows:', rows);
  await pool.end();
}

main().catch((e) => {
  console.error('seed failed:', e);
  process.exit(1);
});
