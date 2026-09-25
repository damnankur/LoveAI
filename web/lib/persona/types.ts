import { buildVector, cosineSimilarity } from './vector';
import { Profile } from './profile';
import { config } from '../config';

// The five empirically replicated personality prototypes (Big Five cluster
// analysis). Sources: Gerlach et al. 2021 (PLOS ONE, N=22,820, LPA/k-means/
// spectral, "Personality types revisited"); supported by Caspi & Silva,
// Mueller & Tan 2019, Asendorpf & van Aken. These are the fixed archetypes
// seeded into the persona store so RAG always has verbal labels to return.
export interface PersonaType {
  key: string;
  label: string;
  tagline: string;
  description: string;
  profile: Profile;
}

export const PERSONA_TYPES: PersonaType[] = [
  {
    key: 'resilient',
    label: 'Resilient',
    tagline: 'the steady flame',
    description:
      'Well-adjusted and emotionally stable. Warm, organised, open to experience, calm under pressure. Handles stress by staying level and keeping perspective.',
    profile: {
      openness: 0.7,
      conscientiousness: 0.7,
      extraversion: 0.6,
      agreeableness: 0.7,
      neuroticism: 0.3,
      self_awareness: 0.7,
      self_regulation: 0.75,
      empathy: 0.7,
      social_skills: 0.65,
      assertiveness: 0.55,
      active_listening: 0.7,
      verbal_preference: 0.5,
      conflict_style: 0.65,
      intrinsic_motivation: 0.7,
      extrinsic_motivation: 0.4,
      core_values: 0.7,
      life_goals: 0.6,
    },
  },
  {
    key: 'overcontrolled',
    label: 'Overcontrolled',
    tagline: 'the careful perfectionist',
    description:
      'High self-discipline and high standards, but prone to worry and restraint. Reserved, dutiful, detail-oriented. Tends to keep emotions in and push for correctness.',
    profile: {
      openness: 0.4,
      conscientiousness: 0.85,
      extraversion: 0.35,
      agreeableness: 0.55,
      neuroticism: 0.7,
      self_awareness: 0.55,
      self_regulation: 0.5,
      empathy: 0.55,
      social_skills: 0.4,
      assertiveness: 0.4,
      active_listening: 0.6,
      verbal_preference: 0.55,
      conflict_style: 0.4,
      intrinsic_motivation: 0.55,
      extrinsic_motivation: 0.7,
      core_values: 0.8,
      life_goals: 0.75,
    },
  },
  {
    key: 'undercontrolled',
    label: 'Undercontrolled',
    tagline: 'the free spirit',
    description:
      'Expressive and spontaneous with looser self-discipline. Extraverted, impulsive, lives in the moment. Strong feelings, quick reactions, enjoys novelty and stimulation.',
    profile: {
      openness: 0.65,
      conscientiousness: 0.3,
      extraversion: 0.7,
      agreeableness: 0.4,
      neuroticism: 0.55,
      self_awareness: 0.4,
      self_regulation: 0.3,
      empathy: 0.45,
      social_skills: 0.6,
      assertiveness: 0.65,
      active_listening: 0.35,
      verbal_preference: 0.5,
      conflict_style: 0.45,
      intrinsic_motivation: 0.65,
      extrinsic_motivation: 0.6,
      core_values: 0.35,
      life_goals: 0.65,
    },
  },
  {
    key: 'reserved',
    label: 'Reserved',
    tagline: 'the quiet observer',
    description:
      'Introverted, calm and private. Low-key, self-reliant, prefers depth over noise. Comfortable with solitude, thoughtful before speaking, steady and low-anxiety.',
    profile: {
      openness: 0.4,
      conscientiousness: 0.75,
      extraversion: 0.25,
      agreeableness: 0.6,
      neuroticism: 0.35,
      self_awareness: 0.55,
      self_regulation: 0.7,
      empathy: 0.5,
      social_skills: 0.3,
      assertiveness: 0.3,
      active_listening: 0.7,
      verbal_preference: 0.6,
      conflict_style: 0.55,
      intrinsic_motivation: 0.6,
      extrinsic_motivation: 0.3,
      core_values: 0.65,
      life_goals: 0.4,
    },
  },
  {
    key: 'confident',
    label: 'Confident',
    tagline: 'the charismatic initiator',
    description:
      'Outgoing, assured and persuasive. Warm, open, sociable, comfortable taking the lead. Motivated by growth and connection, decisive and expressive.',
    profile: {
      openness: 0.8,
      conscientiousness: 0.55,
      extraversion: 0.9,
      agreeableness: 0.6,
      neuroticism: 0.25,
      self_awareness: 0.65,
      self_regulation: 0.65,
      empathy: 0.6,
      social_skills: 0.8,
      assertiveness: 0.85,
      active_listening: 0.5,
      verbal_preference: 0.4,
      conflict_style: 0.7,
      intrinsic_motivation: 0.75,
      extrinsic_motivation: 0.55,
      core_values: 0.6,
      life_goals: 0.8,
    },
  },
];

// Match a user profile (0..1 across the 17 dimensions) to its nearest fixed
// prototype using the same 768-dim seeded projection the RAG uses, so the
// assignment is consistent with the nearest-neighbour search in the DB.
export function matchPersonaType(profile: Profile): PersonaType {
  const userVec = buildVector(profile, config.vectorDim, config.personaProjectionSeed);
  let best = PERSONA_TYPES[0];
  let bestSim = -Infinity;
  for (const t of PERSONA_TYPES) {
    const tv = buildVector(t.profile, config.vectorDim, config.personaProjectionSeed);
    const sim = cosineSimilarity(userVec, tv);
    if (sim > bestSim) {
      bestSim = sim;
      best = t;
    }
  }
  return best;
}
