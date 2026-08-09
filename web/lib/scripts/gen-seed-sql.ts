import * as fs from 'fs';
import * as path from 'path';
import { MATRIX } from '../persona/matrix';
import { computeProfile, buildPersonaText, RawResponses } from '../persona/profile';
import { buildVector } from '../persona/vector';
import { config } from '../config';

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
  traits: Record<string, number>; // trait -> target Likert 1..5
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
    const jitter = Math.round(rand() * 2) - 1; // -1..1
    let raw = target + jitter;
    if (q.reverse) raw = 6 - raw;
    responses[q.id] = Math.min(5, Math.max(1, Math.round(raw)));
  }
  return responses;
}

const rows: string[] = [];

function wrapLiteral(s: string, maxLen = 1800): string {
  const parts: string[] = [];
  for (let i = 0; i < s.length; i += maxLen) parts.push(s.slice(i, i + maxLen));
  return parts.map((p) => `'${p}'`).join(" ||\n    ");
}

for (const a of ARCHETYPES) {
  const responses = responsesFor(a, 1000 + ARCHETYPES.indexOf(a) * 7);
  const profile = computeProfile(responses);
  const vector = buildVector(profile, config.vectorDim, config.personaProjectionSeed);
  const text = buildPersonaText(profile);
  const responsesJson = JSON.stringify(responses).replace(/'/g, "''");
  const profileJson = JSON.stringify(profile).replace(/'/g, "''");
  const textEscaped = text.replace(/'/g, "''");
  const vectorText = vector.map((n) => n.toFixed(6)).join(',');
  rows.push(
    `INSERT INTO persona_evaluations (responses, dimensions, profile, persona_vector)\n` +
      `VALUES ('${responsesJson}'::jsonb, '${profileJson}'::jsonb, '${textEscaped}',\n` +
      `  vector('[' || ${wrapLiteral(vectorText)} || ']')\n` +
      `);`
  );
}

const out = path.join(process.env.TEMP || '.', 'opencode', 'seed-personas');
fs.mkdirSync(out, { recursive: true });
const all = rows.map((r) => r).join('\n');
rows.forEach((r, i) => fs.writeFileSync(path.join(out, `row-${i + 1}.sql`), r, 'utf8'));
fs.writeFileSync(path.join(out, 'all.sql'), all, 'utf8');
const maxLine = Math.max(...all.split(/\r?\n/).map((l) => l.length));
console.log(`Wrote ${rows.length} personas to ${out}`);
console.log(`Longest line: ${maxLine} chars`);
console.log(`Total bytes: ${all.length}`);
