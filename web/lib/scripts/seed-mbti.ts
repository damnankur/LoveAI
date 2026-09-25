import { readFileSync, existsSync } from 'fs';
import { Client } from 'pg';
import { MBTI_TYPES } from '../persona/mbti';
import { buildVector } from '../persona/vector';
import { buildPersonaText } from '../persona/profile';
import { config } from '../config';

// Load .env.local the same way apply-sql.ts does.
const p = '.env.local';
if (existsSync(p)) {
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m || line.trimStart().startsWith('#')) continue;
    process.env[m[1]] = m[2].replace(/^"|"$/g, '');
  }
}

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL missing');

function buildProfileText(label: string, description: string, dims: Record<string, number>): string {
  return [
    `${label} — ${description}`,
    'The user completed a 34-question psychological matrix (17 dimensions). Their persona profile:',
    ...buildPersonaText(dims as any).split('\n').slice(1),
  ].join('\n');
}

async function main() {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    // Idempotent upsert: delete any prior rows that match known MBTI labels,
    // then insert fresh.  Because persona_type values are unique strings
    // ("INTJ - The Architect", etc.), one DELETE per label guarantees no dupes
    // even across repeated runs.
    for (const t of MBTI_TYPES) {
      await client.query(
        `DELETE FROM persona_evaluations WHERE user_id IS NULL AND persona_type = $1`,
        [t.label]
      );
      const vector = buildVector(t.profile, config.vectorDim, config.personaProjectionSeed);
      const profileText = buildProfileText(t.label, t.description, t.profile);
      const { rows } = await client.query(
        `INSERT INTO persona_evaluations (user_id, responses, dimensions, profile, persona_type, persona_vector, persona_vector_json)
         VALUES (NULL, $1::jsonb, $2::jsonb, $3, $4, $5::vector, $6::jsonb) RETURNING id`,
        [
          {},
          JSON.stringify(t.profile),
          profileText,
          t.label,
          `[${vector.join(',')}]`,
          JSON.stringify(vector),
        ]
      );
      console.log(`inserted ${t.label} -> ${rows[0].id}`);
    }
    console.log(`Done. Inserted ${MBTI_TYPES.length} MBTI personas.`);
  } finally {
    await client.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
