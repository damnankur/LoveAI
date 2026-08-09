import { MATRIX } from '../persona/matrix';
import { RawResponses } from '../persona/profile';

const TARGET = 'https://loveai-brown.vercel.app';

const traits: Record<string, number> = {
  openness: 4, conscientiousness: 3, extraversion: 4, agreeableness: 5, neuroticism: 3,
  self_awareness: 4, self_regulation: 3, empathy: 5, social_skills: 4, assertiveness: 2,
  active_listening: 5, verbal_preference: 2, conflict_style: 3, intrinsic_motivation: 4,
  extrinsic_motivation: 3, core_values: 5, life_goals: 3,
};

const responses: RawResponses = {};
for (const q of MATRIX) {
  const target = traits[q.trait] ?? 3;
  responses[q.id] = q.reverse ? 6 - target : target;
}

async function main() {
  const res = await fetch(`${TARGET}/api/persona/evaluate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ responses, email: 'demo@loveai.app', displayName: 'Demo' }),
  });
  const body = await res.json();
  if (!res.ok) {
    console.error('FAILED', res.status, JSON.stringify(body).slice(0, 400));
    process.exit(1);
  }
  console.log('status:', res.status);
  console.log('evaluationId:', body.evaluationId);
  console.log('archetype:', body.archetype);
  console.log('vectorDim:', body.vectorDim);
  console.log('vectorPreview:', JSON.stringify(body.vectorPreview));
}
main().catch((e) => { console.error(e); process.exit(1); });
