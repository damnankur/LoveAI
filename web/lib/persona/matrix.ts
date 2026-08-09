// The 34-question psychological matrix (17 dimensions x 2 items, balanced keying).
// Based on the psychometrics research: BFI-2/TIPI/IPIP (Big Five), WLEIS (EI),
// RAS/AELS/ROCI-II style (Communication), WEIMS/PVQ style (Values & Motivation).
// See Knowledge/loveai-persona-questionnaire.md in the memory vault.
// Reverse = agreement lowers the trait score (Likert 5 -> 6 - x).

export type TraitId =
  | 'openness'
  | 'conscientiousness'
  | 'extraversion'
  | 'agreeableness'
  | 'neuroticism'
  | 'self_awareness'
  | 'self_regulation'
  | 'empathy'
  | 'social_skills'
  | 'assertiveness'
  | 'active_listening'
  | 'verbal_preference'
  | 'conflict_style'
  | 'intrinsic_motivation'
  | 'extrinsic_motivation'
  | 'core_values'
  | 'life_goals';

export interface MatrixQuestion {
  id: string;
  trait: TraitId;
  category: string;      // Big Five | Emotional Intelligence | Communication | Values & Motivation
  text: string;
  reverse?: boolean;     // agreement scores LOWER on the trait when true
}

export const TRAIT_ORDER: TraitId[] = [
  'openness', 'conscientiousness', 'extraversion', 'agreeableness', 'neuroticism',
  'self_awareness', 'self_regulation', 'empathy', 'social_skills',
  'assertiveness', 'active_listening', 'verbal_preference', 'conflict_style',
  'intrinsic_motivation', 'extrinsic_motivation', 'core_values', 'life_goals',
];

export const MATRIX: MatrixQuestion[] = [
  // ---- Big Five (10) ----
  { id: 'o1', trait: 'openness', category: 'Big Five', text: 'I enjoy exploring new ideas, even ones that challenge my beliefs.' },
  { id: 'o2', trait: 'openness', category: 'Big Five', text: 'I prefer routines and familiar ways of doing things.', reverse: true },
  { id: 'c1', trait: 'conscientiousness', category: 'Big Five', text: 'I follow through on tasks even when they are tedious.' },
  { id: 'c2', trait: 'conscientiousness', category: 'Big Five', text: 'I often leave things half-finished or put them off to the last minute.', reverse: true },
  { id: 'e1', trait: 'extraversion', category: 'Big Five', text: 'I feel energized by meeting new people.' },
  { id: 'e2', trait: 'extraversion', category: 'Big Five', text: 'I tend to be quiet and reserved around new people.', reverse: true },
  { id: 'a1', trait: 'agreeableness', category: 'Big Five', text: 'I go out of my way to help people who need it.' },
  { id: 'a2', trait: 'agreeableness', category: 'Big Five', text: 'I sometimes come across as cold or indifferent to others.', reverse: true },
  { id: 'n1', trait: 'neuroticism', category: 'Big Five', text: 'I worry about things long after they are over.' },
  { id: 'n2', trait: 'neuroticism', category: 'Big Five', text: 'I stay calm and even-tempered under stress.', reverse: true },

  // ---- Emotional Intelligence (8) ----
  { id: 'sa1', trait: 'self_awareness', category: 'Emotional Intelligence', text: 'I usually know why I feel the way I do.' },
  { id: 'sa2', trait: 'self_awareness', category: 'Emotional Intelligence', text: 'My own emotions often take me by surprise.', reverse: true },
  { id: 'sr1', trait: 'self_regulation', category: 'Emotional Intelligence', text: 'When I get upset, I can calm myself down quickly.' },
  { id: 'sr2', trait: 'self_regulation', category: 'Emotional Intelligence', text: 'My temper gets the better of me under pressure.', reverse: true },
  { id: 'em1', trait: 'empathy', category: 'Emotional Intelligence', text: 'I can sense how people around me are feeling even before they say it.' },
  { id: 'em2', trait: 'empathy', category: 'Emotional Intelligence', text: 'I am not easily moved by other people\u2019s moods.', reverse: true },
  { id: 'ss1', trait: 'social_skills', category: 'Emotional Intelligence', text: 'I find it easy to make people feel comfortable around me.' },
  { id: 'ss2', trait: 'social_skills', category: 'Emotional Intelligence', text: 'I struggle to get others to see my point of view.', reverse: true },

  // ---- Communication Style (8) ----
  { id: 'as1', trait: 'assertiveness', category: 'Communication', text: 'I can say \u201cno\u201d without feeling guilty about it.' },
  { id: 'as2', trait: 'assertiveness', category: 'Communication', text: 'I tend to give in to avoid conflict, even when I disagree.', reverse: true },
  { id: 'pl1', trait: 'active_listening', category: 'Communication', text: 'When someone is talking, I give them my full attention and don\u2019t interrupt.' },
  { id: 'pl2', trait: 'active_listening', category: 'Communication', text: 'I often start planning my reply while the other person is still speaking.', reverse: true },
  { id: 'vp1', trait: 'verbal_preference', category: 'Communication', text: 'I\u2019d rather have a long text conversation than a phone call.' },
  { id: 'vp2', trait: 'verbal_preference', category: 'Communication', text: 'I prefer talking out loud (voice or video) to typing.', reverse: true },
  { id: 'cf1', trait: 'conflict_style', category: 'Communication', text: 'In a disagreement, I prefer to address the issue directly and work it out together.' },
  { id: 'cf2', trait: 'conflict_style', category: 'Communication', text: 'When there is tension, I\u2019d rather avoid the topic and let it pass.', reverse: true },

  // ---- Values & Motivation (8) ----
  { id: 'im1', trait: 'intrinsic_motivation', category: 'Values & Motivation', text: 'I do my best work when the task itself genuinely interests me.' },
  { id: 'im2', trait: 'intrinsic_motivation', category: 'Values & Motivation', text: 'I only really push myself when there is an external payoff (reward, praise, deadline).', reverse: true },
  { id: 'xm1', trait: 'extrinsic_motivation', category: 'Values & Motivation', text: 'Recognition, praise, and tangible rewards strongly motivate me.' },
  { id: 'xm2', trait: 'extrinsic_motivation', category: 'Values & Motivation', text: 'Status, titles, and material rewards matter little to me.', reverse: true },
  { id: 'cv1', trait: 'core_values', category: 'Values & Motivation', text: 'It is important to me to act with integrity, even when it causes friction.' },
  { id: 'cv2', trait: 'core_values', category: 'Values & Motivation', text: 'It is more important to me that my life stays stable and predictable than that I push for change.', reverse: true },
  { id: 'lg1', trait: 'life_goals', category: 'Values & Motivation', text: 'I want my life to be full of new experiences and adventures.' },
  { id: 'lg2', trait: 'life_goals', category: 'Values & Motivation', text: 'I measure success by concrete achievements and milestones, not by new experiences.', reverse: true },
];

export const SCALE_OPTIONS = [
  { value: 1, label: 'Strongly disagree' },
  { value: 2, label: 'Disagree' },
  { value: 3, label: 'Neutral' },
  { value: 4, label: 'Agree' },
  { value: 5, label: 'Strongly agree' },
];
