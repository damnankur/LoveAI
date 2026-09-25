import { Profile } from './profile';

// The 16 MBTI personality profiles, mapped onto the loveAI 17-dimension
// psychological matrix (0..1 per trait). Sources:
//   - MBTI type names + descriptions: Myers & Briggs Foundation (myersbriggs.org)
//     and 16Personalities (16personalities.com/personality-types)
//   - MBTI -> Big Five trait mapping: LifeScore MBTI-to-Big-Five converter
//     (grounded in McCrae & Costa 1989; Furnham 1996), plus the well-established
//     E/I<->Extraversion, S/N<->Openness, T/F<->Agreeableness, J/P<->Conscientiousness
//     correspondences documented by TraitLab and ExplorePsychology.
//   - The remaining EI / communication / values dims are reasoned from each
//     type's canonical description (16Personalities strengths/blind-spots table).
// Neuroticism has no MBTI equivalent, so values are set from typical descriptions.
export interface MbtiType {
  key: string;
  label: string;
  tagline: string;
  description: string;
  profile: Profile;
}

export const MBTI_TYPES: MbtiType[] = [
  {
    key: 'intj',
    label: 'INTJ - The Architect',
    tagline: 'imaginative and strategic, with a plan for everything',
    description:
      'Imaginative and strategic thinkers, with a plan for everything. Independent, analytical and future-oriented; motivated by mastery and competence.',
    profile: {
      openness: 0.75, conscientiousness: 0.75, extraversion: 0.25, agreeableness: 0.3, neuroticism: 0.5,
      self_awareness: 0.7, self_regulation: 0.7, empathy: 0.35, social_skills: 0.4, assertiveness: 0.7,
      active_listening: 0.5, verbal_preference: 0.6, conflict_style: 0.65, intrinsic_motivation: 0.7,
      extrinsic_motivation: 0.5, core_values: 0.6, life_goals: 0.75,
    },
  },
  {
    key: 'intp',
    label: 'INTP - The Logician',
    tagline: 'innovative inventors with an unquenchable thirst for knowledge',
    description:
      'Innovative inventors with an unquenchable thirst for knowledge. Deeply curious, logical and theoretical; value ideas over social polish.',
    profile: {
      openness: 0.8, conscientiousness: 0.35, extraversion: 0.3, agreeableness: 0.5, neuroticism: 0.5,
      self_awareness: 0.65, self_regulation: 0.5, empathy: 0.4, social_skills: 0.3, assertiveness: 0.4,
      active_listening: 0.55, verbal_preference: 0.7, conflict_style: 0.5, intrinsic_motivation: 0.8,
      extrinsic_motivation: 0.35, core_values: 0.5, life_goals: 0.55,
    },
  },
  {
    key: 'entj',
    label: 'ENTJ - The Commander',
    tagline: 'bold, imaginative and strong-willed leaders',
    description:
      'Bold, imaginative and strong-willed leaders, always finding a way - or making one. Decisive, strategic and driven to achieve.',
    profile: {
      openness: 0.7, conscientiousness: 0.8, extraversion: 0.8, agreeableness: 0.3, neuroticism: 0.3,
      self_awareness: 0.6, self_regulation: 0.75, empathy: 0.3, social_skills: 0.7, assertiveness: 0.9,
      active_listening: 0.4, verbal_preference: 0.35, conflict_style: 0.85, intrinsic_motivation: 0.6,
      extrinsic_motivation: 0.65, core_values: 0.55, life_goals: 0.85,
    },
  },
  {
    key: 'entp',
    label: 'ENTP - The Debater',
    tagline: 'quick-witted and audacious, thrives on intellectual challenge',
    description:
      'Quick-witted and audacious, ENTPs thrive on intellectual challenge. Charismatic and energetic, they love exploring new ideas and debating them.',
    profile: {
      openness: 0.8, conscientiousness: 0.35, extraversion: 0.75, agreeableness: 0.45, neuroticism: 0.5,
      self_awareness: 0.55, self_regulation: 0.45, empathy: 0.4, social_skills: 0.65, assertiveness: 0.75,
      active_listening: 0.4, verbal_preference: 0.45, conflict_style: 0.8, intrinsic_motivation: 0.7,
      extrinsic_motivation: 0.55, core_values: 0.45, life_goals: 0.7,
    },
  },
  {
    key: 'infj',
    label: 'INFJ - The Advocate',
    tagline: 'quietly inspiring, principled and insightful',
    description:
      'Quietly inspiring and principled. Insightful idealists with a strong moral compass; deeply attuned to people and committed to meaningful change.',
    profile: {
      openness: 0.75, conscientiousness: 0.55, extraversion: 0.3, agreeableness: 0.75, neuroticism: 0.5,
      self_awareness: 0.8, self_regulation: 0.55, empathy: 0.8, social_skills: 0.55, assertiveness: 0.45,
      active_listening: 0.75, verbal_preference: 0.65, conflict_style: 0.55, intrinsic_motivation: 0.75,
      extrinsic_motivation: 0.4, core_values: 0.85, life_goals: 0.65,
    },
  },
  {
    key: 'infp',
    label: 'INFP - The Mediator',
    tagline: 'poetic, kind and altruistic',
    description:
      'Poetic, kind and altruistic. Empathetic idealists guided by deep personal values; introspective and drawn to authenticity and meaning.',
    profile: {
      openness: 0.75, conscientiousness: 0.35, extraversion: 0.3, agreeableness: 0.8, neuroticism: 0.7,
      self_awareness: 0.8, self_regulation: 0.35, empathy: 0.85, social_skills: 0.45, assertiveness: 0.35,
      active_listening: 0.75, verbal_preference: 0.75, conflict_style: 0.45, intrinsic_motivation: 0.8,
      extrinsic_motivation: 0.3, core_values: 0.85, life_goals: 0.6,
    },
  },
  {
    key: 'enfj',
    label: 'ENFJ - The Protagonist',
    tagline: 'inspiring and supportive, born leaders',
    description:
      'Inspiring and supportive, natural-born leaders with a gift for helping others grow. Warm, charismatic and deeply invested in people.',
    profile: {
      openness: 0.7, conscientiousness: 0.65, extraversion: 0.8, agreeableness: 0.8, neuroticism: 0.45,
      self_awareness: 0.7, self_regulation: 0.6, empathy: 0.85, social_skills: 0.85, assertiveness: 0.65,
      active_listening: 0.7, verbal_preference: 0.4, conflict_style: 0.6, intrinsic_motivation: 0.7,
      extrinsic_motivation: 0.55, core_values: 0.8, life_goals: 0.75,
    },
  },
  {
    key: 'enfp',
    label: 'ENFP - The Campaigner',
    tagline: 'enthusiastic, creative and sociable free spirits',
    description:
      'Enthusiastic, creative and sociable free spirits. Curious optimists who love new ideas, people and possibilities - energy is infectious.',
    profile: {
      openness: 0.85, conscientiousness: 0.35, extraversion: 0.8, agreeableness: 0.75, neuroticism: 0.5,
      self_awareness: 0.65, self_regulation: 0.4, empathy: 0.8, social_skills: 0.8, assertiveness: 0.6,
      active_listening: 0.55, verbal_preference: 0.5, conflict_style: 0.5, intrinsic_motivation: 0.85,
      extrinsic_motivation: 0.45, core_values: 0.6, life_goals: 0.8,
    },
  },
  {
    key: 'istj',
    label: 'ISTJ - The Logistician',
    tagline: 'practical, reliable and fact-minded',
    description:
      'Practical, reliable and fact-minded. Quiet and serious, they earn success through thoroughness and dependability; value tradition, duty and order.',
    profile: {
      openness: 0.3, conscientiousness: 0.85, extraversion: 0.3, agreeableness: 0.55, neuroticism: 0.3,
      self_awareness: 0.5, self_regulation: 0.8, empathy: 0.45, social_skills: 0.4, assertiveness: 0.55,
      active_listening: 0.6, verbal_preference: 0.55, conflict_style: 0.6, intrinsic_motivation: 0.5,
      extrinsic_motivation: 0.65, core_values: 0.75, life_goals: 0.7,
    },
  },
  {
    key: 'isfj',
    label: 'ISFJ - The Defender',
    tagline: 'loyal, warm and protective',
    description:
      'Loyal, warm and protective. Devoted and detail-oriented caregivers who quietly support others and keep things running; humble and dependable.',
    profile: {
      openness: 0.3, conscientiousness: 0.8, extraversion: 0.3, agreeableness: 0.8, neuroticism: 0.5,
      self_awareness: 0.55, self_regulation: 0.6, empathy: 0.8, social_skills: 0.55, assertiveness: 0.35,
      active_listening: 0.75, verbal_preference: 0.6, conflict_style: 0.4, intrinsic_motivation: 0.55,
      extrinsic_motivation: 0.55, core_values: 0.8, life_goals: 0.55,
    },
  },
  {
    key: 'estj',
    label: 'ESTJ - The Executive',
    tagline: 'organized, efficient and community-minded',
    description:
      'Organized, efficient and community-minded. Decisive and practical leaders who value order, rules and results; strong sense of duty.',
    profile: {
      openness: 0.3, conscientiousness: 0.85, extraversion: 0.75, agreeableness: 0.35, neuroticism: 0.3,
      self_awareness: 0.5, self_regulation: 0.8, empathy: 0.35, social_skills: 0.65, assertiveness: 0.85,
      active_listening: 0.45, verbal_preference: 0.4, conflict_style: 0.8, intrinsic_motivation: 0.45,
      extrinsic_motivation: 0.7, core_values: 0.7, life_goals: 0.75,
    },
  },
  {
    key: 'esfj',
    label: 'ESFJ - The Consul',
    tagline: 'caring, sociable and community-focused',
    description:
      'Caring, sociable and community-focused. Attentive to others and eager to help; warm organisers who nurture relationships and harmony.',
    profile: {
      openness: 0.3, conscientiousness: 0.75, extraversion: 0.8, agreeableness: 0.8, neuroticism: 0.5,
      self_awareness: 0.55, self_regulation: 0.6, empathy: 0.8, social_skills: 0.8, assertiveness: 0.5,
      active_listening: 0.7, verbal_preference: 0.4, conflict_style: 0.5, intrinsic_motivation: 0.55,
      extrinsic_motivation: 0.65, core_values: 0.75, life_goals: 0.6,
    },
  },
  {
    key: 'istp',
    label: 'ISTP - The Virtuoso',
    tagline: 'bold, practical and hands-on experimenters',
    description:
      'Bold, practical and hands-on experimenters. Cool-headed and adaptable problem-solvers who master tools and systems; independent and reserved.',
    profile: {
      openness: 0.5, conscientiousness: 0.4, extraversion: 0.3, agreeableness: 0.35, neuroticism: 0.3,
      self_awareness: 0.6, self_regulation: 0.7, empathy: 0.4, social_skills: 0.45, assertiveness: 0.55,
      active_listening: 0.5, verbal_preference: 0.6, conflict_style: 0.55, intrinsic_motivation: 0.65,
      extrinsic_motivation: 0.45, core_values: 0.5, life_goals: 0.5,
    },
  },
  {
    key: 'isfp',
    label: 'ISFP - The Adventurer',
    tagline: 'flexible, artistic and quietly charismatic',
    description:
      'Flexible, artistic and quietly charismatic. Gentle aesthetes who live in the moment, value authenticity and express themselves through doing.',
    profile: {
      openness: 0.55, conscientiousness: 0.35, extraversion: 0.3, agreeableness: 0.75, neuroticism: 0.5,
      self_awareness: 0.65, self_regulation: 0.45, empathy: 0.75, social_skills: 0.5, assertiveness: 0.35,
      active_listening: 0.65, verbal_preference: 0.65, conflict_style: 0.45, intrinsic_motivation: 0.75,
      extrinsic_motivation: 0.35, core_values: 0.6, life_goals: 0.55,
    },
  },
  {
    key: 'estp',
    label: 'ESTP - The Entrepreneur',
    tagline: 'smart, energetic and perceptive risk-takers',
    description:
      'Smart, energetic and perceptive people who truly enjoy living on the edge. Action-oriented pragmatists who seize the moment and adapt fast.',
    profile: {
      openness: 0.55, conscientiousness: 0.35, extraversion: 0.85, agreeableness: 0.35, neuroticism: 0.3,
      self_awareness: 0.5, self_regulation: 0.6, empathy: 0.35, social_skills: 0.75, assertiveness: 0.8,
      active_listening: 0.4, verbal_preference: 0.4, conflict_style: 0.7, intrinsic_motivation: 0.65,
      extrinsic_motivation: 0.6, core_values: 0.4, life_goals: 0.7,
    },
  },
  {
    key: 'esfp',
    label: 'ESFP - The Entertainer',
    tagline: 'spontaneous, energetic and enthusiastic',
    description:
      'Spontaneous, energetic and enthusiastic - life is never boring around them. Warm, social performers who live for the present moment.',
    profile: {
      openness: 0.55, conscientiousness: 0.35, extraversion: 0.85, agreeableness: 0.75, neuroticism: 0.35,
      self_awareness: 0.55, self_regulation: 0.5, empathy: 0.7, social_skills: 0.85, assertiveness: 0.6,
      active_listening: 0.5, verbal_preference: 0.45, conflict_style: 0.55, intrinsic_motivation: 0.7,
      extrinsic_motivation: 0.55, core_values: 0.5, life_goals: 0.65,
    },
  },
];
