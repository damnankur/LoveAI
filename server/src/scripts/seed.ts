// Seeds the DB with varied synthetic personas so RAG retrieval has neighbors
// to return during local development. Run: npm run seed
import { pool, applySchema } from '../db';
import { TRAIT_ORDER, TraitId } from '../persona/matrix';
import { Profile, buildPersonaText } from '../persona/profile';
import { buildVector } from '../persona/vector';
import { savePersona } from '../vector/store';
import { config } from '../config';

type TraitOverrides = Partial<Record<TraitId, number>>;

// 8 archetypes spread across the 17-dim space. Unspecified dims default to 0.5.
const SEED_PERSONAS: { name: string; traits: TraitOverrides }[] = [
  { name: 'warm_extrovert', traits: { extraversion: 0.85, agreeableness: 0.8, empathy: 0.9, social_skills: 0.85, openness: 0.7, neuroticism: 0.3, assertiveness: 0.7 } },
  { name: 'reserved_thinker', traits: { extraversion: 0.2, agreeableness: 0.55, conscientiousness: 0.85, openness: 0.8, neuroticism: 0.5, verbal_preference: 0.8, active_listening: 0.75, life_goals: 0.8 } },
  { name: 'ambitious_driver', traits: { extraversion: 0.6, conscientiousness: 0.9, assertiveness: 0.9, extrinsic_motivation: 0.85, life_goals: 0.2, conflict_style: 0.7, neuroticism: 0.4 } },
  { name: 'compassionate_listener', traits: { empathy: 0.95, agreeableness: 0.9, active_listening: 0.9, self_regulation: 0.8, social_skills: 0.6, conflict_style: 0.85, neuroticism: 0.35 } },
  { name: 'adventurous_spirit', traits: { openness: 0.9, life_goals: 0.9, extraversion: 0.75, neuroticism: 0.25, intrinsic_motivation: 0.85, conscientiousness: 0.4 } },
  { name: 'composed_professional', traits: { self_regulation: 0.9, conscientiousness: 0.8, neuroticism: 0.2, core_values: 0.85, conflict_style: 0.8, agreeableness: 0.65, assertiveness: 0.6 } },
  { name: 'introspective_creative', traits: { openness: 0.85, self_awareness: 0.9, extraversion: 0.25, verbal_preference: 0.75, intrinsic_motivation: 0.9, neuroticism: 0.55, social_skills: 0.3 } },
  { name: 'direct_pragmatist', traits: { assertiveness: 0.85, conscientiousness: 0.75, openness: 0.3, empathy: 0.4, extrinsic_motivation: 0.6, agreeableness: 0.45, life_goals: 0.4 } },
];

function makeProfile(overrides: TraitOverrides): Profile {
  const profile = {} as Profile;
  for (const t of TRAIT_ORDER) profile[t] = overrides[t] ?? 0.5;
  return profile;
}

async function seed() {
  await applySchema();
  let inserted = 0;
  for (const p of SEED_PERSONAS) {
    const profile = makeProfile(p.traits);
    const personaText = buildPersonaText(profile);
    const vector = buildVector(profile, config.vectorDim, config.personaProjectionSeed);
    const id = await savePersona({
      userId: null,
      responses: {},
      dimensions: profile as unknown as Record<string, number>,
      profile: personaText,
      vector,
    });
    console.log(`[seed] ${p.name.padEnd(24)} -> ${id}`);
    inserted++;
  }
  console.log(`[seed] inserted ${inserted} personas.`);
  await pool.end();
}

seed().catch(async (err) => {
  console.error('[seed] failed:', err);
  await pool.end();
  process.exit(1);
});
