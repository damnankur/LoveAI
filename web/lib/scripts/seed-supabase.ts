import { MATRIX } from '../persona/matrix';
import { computeProfile, buildPersonaText, RawResponses } from '../persona/profile';
import { buildVector } from '../persona/vector';
import { config } from '../config';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY required');

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Archetype {
  label: string;
  traits: Record<string, number>;
}

const ARCHETYPES: Archetype[] = [
  { label: 'curious-organised', traits: { openness: 5, conscientiousness: 5, extraversion: 3, agreeableness: 3, neuroticism: 2, self_awareness: 4, self_regulation: 4, empathy: 3, social_skills: 3, assertiveness: 3, active_listening: 4, verbal_preference: 3, conflict_style: 4, intrinsic_motivation: 5, extrinsic_motivation: 2, core_values: 4, life_goals: 4 } },
  { label: 'warm-empathic', traits: { openness: 4, conscientiousness: 3, extraversion: 4, agreeableness: 5, neuroticism: 3, self_awareness: 4, self_regulation: 3, empathy: 5, social_skills: 4, assertiveness: 2, active_listening: 5, verbal_preference: 2, conflict_style: 3, intrinsic_motivation: 4, extrinsic_motivation: 3, core_values: 5, life_goals: 3 } },
  { label: 'quiet-thinker', traits: { openness: 4, conscientiousness: 3, extraversion: 1, agreeableness: 3, neuroticism: 3, self_awareness: 4, self_regulation: 3, empathy: 3, social_skills: 2, assertiveness: 2, active_listening: 4, verbal_preference: 5, conflict_style: 2, intrinsic_motivation: 4, extrinsic_motivation: 2, core_values: 4, life_goals: 3 } },
  { label: 'grounded-achiever', traits: { openness: 2, conscientiousness: 5, extraversion: 3, agreeableness: 2, neuroticism: 2, self_awareness: 3, self_regulation: 5, empathy: 2, social_skills: 3, assertiveness: 4, active_listening: 3, verbal_preference: 2, conflict_style: 4, intrinsic_motivation: 3, extrinsic_motivation: 5, core_values: 2, life_goals: 5 } },
  { label: 'restless-dreamer', traits: { openness: 5, conscientiousness: 1, extraversion: 3, agreeableness: 3, neuroticism: 5, self_awareness: 3, self_regulation: 1, empathy: 4, social_skills: 2, assertiveness: 2, active_listening: 3, verbal_preference: 3, conflict_style: 2, intrinsic_motivation: 5, extrinsic_motivation: 1, core_values: 3, life_goals: 5 } },
  { label: 'diplomat', traits: { openness: 3, conscientiousness: 3, extraversion: 3, agreeableness: 5, neuroticism: 3, self_awareness: 4, self_regulation: 4, empathy: 5, social_skills: 4, assertiveness: 2, active_listening: 5, verbal_preference: 3, conflict_style: 2, intrinsic_motivation: 3, extrinsic_motivation: 3, core_values: 4, life_goals: 2 } },
  { label: 'bold-leader', traits: { openness: 3, conscientiousness: 4, extraversion: 5, agreeableness: 2, neuroticism: 2, self_awareness: 3, self_regulation: 5, empathy: 2, social_skills: 5, assertiveness: 5, active_listening: 2, verbal_preference: 3, conflict_style: 5, intrinsic_motivation: 3, extrinsic_motivation: 4, core_values: 3, life_goals: 5 } },
  { label: 'introspective-healer', traits: { openness: 4, conscientiousness: 4, extraversion: 2, agreeableness: 4, neuroticism: 4, self_awareness: 5, self_regulation: 3, empathy: 5, social_skills: 3, assertiveness: 2, active_listening: 5, verbal_preference: 4, conflict_style: 3, intrinsic_motivation: 4, extrinsic_motivation: 2, core_values: 5, life_goals: 3 } },
];

function responsesFor(archetype: Archetype, seed: number): RawResponses {
  const rand = mulberry32(seed);
  const responses: RawResponses = {};
  for (const q of MATRIX) {
    const target = archetype.traits[q.trait] ?? 3;
    const jitter = Math.round(rand() * 2) - 1;
    let raw = target + jitter;
    if (q.reverse) raw = 6 - raw;
    responses[q.id] = Math.min(5, Math.max(1, Math.round(raw)));
  }
  return responses;
}

async function main() {
  const url = `${SUPABASE_URL}/rest/v1/persona_evaluations`;
  let inserted = 0;

  for (let i = 0; i < ARCHETYPES.length; i++) {
    const a = ARCHETYPES[i];
    const responses = responsesFor(a, 1000 + i * 7);
    const profile = computeProfile(responses);
    const vector = buildVector(profile, config.vectorDim, config.personaProjectionSeed);
    const personaText = buildPersonaText(profile);

    const body = {
      responses,
      dimensions: profile,
      profile: personaText,
      persona_vector: `[${vector.map((n) => n.toFixed(6)).join(',')}]`,
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`POST ${a.label} failed (${res.status}): ${err.slice(0, 500)}`);
    }
    const created = (await res.json()) as Array<{ id: string }>;
    console.log(`[${i + 1}/${ARCHETYPES.length}] inserted ${a.label} -> ${created[0]?.id}`);
    inserted++;
  }
  console.log(`Done. Inserted ${inserted} demo personas.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
