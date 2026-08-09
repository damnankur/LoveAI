import { MATRIX, TRAIT_ORDER, TraitId } from './matrix';

export type RawResponses = Record<string, number>; // questionId -> 1..5

export type Profile = Record<TraitId, number>; // normalized 0..1

// Likert 1..5 -> [0, 1]
function normalizeRaw(v: number): number {
  const x = Math.min(5, Math.max(1, v));
  return (x - 1) / 4;
}

export function computeProfile(responses: RawResponses): Profile {
  const sums: Record<TraitId, { total: number; count: number }> = {} as any;
  for (const t of TRAIT_ORDER) sums[t] = { total: 0, count: 0 };

  for (const q of MATRIX) {
    if (responses[q.id] === undefined) continue;
    let score = normalizeRaw(responses[q.id]);
    if (q.reverse) score = 1 - score;
    sums[q.trait].total += score;
    sums[q.trait].count += 1;
  }

  const profile = {} as Profile;
  for (const t of TRAIT_ORDER) {
    const { total, count } = sums[t];
    profile[t] = count ? total / count : 0.5;
  }
  return profile;
}

const TRAIT_LABELS: Record<TraitId, [string, string]> = {
  openness: ['Curious & imaginative', 'Pragmatic & grounded'],
  conscientiousness: ['Organised & reliable', 'Spontaneous & flexible'],
  extraversion: ['Outgoing & energetic', 'Reserved & introspective'],
  agreeableness: ['Warm & cooperative', 'Assertive & independent'],
  neuroticism: ['Sensitive & vigilant', 'Calm & resilient'],
  self_awareness: ['Self-aware', 'Emotionally opaque'],
  self_regulation: ['Composed', 'Reactive'],
  empathy: ['Empathic', 'Task-focused'],
  social_skills: ['Charismatic', 'Private'],
  assertiveness: ['Direct', 'Accommodating'],
  active_listening: ['Attentive listener', 'Impatient talker'],
  verbal_preference: ['Prefers writing/text', 'Prefers voice/face-to-face'],
  conflict_style: ['Conciliatory', 'Avoidant'],
  intrinsic_motivation: ['Intrinsically driven', 'Externally rewarded'],
  extrinsic_motivation: ['Reward-driven', 'Indifferent to rewards'],
  core_values: ['Principle-led', 'Stability-led'],
  life_goals: ['Experience-focused', 'Accomplishment-focused'],
};

export function traitTier(score01: number): 'low' | 'mid' | 'high' {
  if (score01 < 0.4) return 'low';
  if (score01 > 0.6) return 'high';
  return 'mid';
}

export function buildPersonaText(profile: Profile): string {
  const lines: string[] = [];
  for (const t of TRAIT_ORDER) {
    const [high, low] = TRAIT_LABELS[t];
    const tier = traitTier(profile[t]);
    const label = tier === 'high' ? high : tier === 'low' ? low : 'Balanced';
    lines.push(`- ${t.replace(/_/g, ' ')}: ${label} (${(profile[t] * 100).toFixed(0)}/100)`);
  }
  return [
    'The user completed a 34-question psychological matrix (17 dimensions). Their persona profile:',
    ...lines,
  ].join('\n');
}

export function personaArchetype(profile: Profile): string {
  const byTier = TRAIT_ORDER
    .map((t) => ({ t, v: profile[t] }))
    .sort((a, b) => b.v - a.v);
  const top = byTier[0];
  const second = byTier[1];
  const pick = (t: TraitId): string => TRAIT_LABELS[t][0].split(' ')[0].toLowerCase();
  return `the ${pick(top.t)} ${pick(second.t)}`;
}
