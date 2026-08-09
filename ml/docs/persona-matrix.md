# Persona Evaluation Matrix

Canonical source of truth: [`shared/persona-matrix.json`](../../shared/persona-matrix.json)
(TS implementation: `server/src/persona/matrix.ts`).

The 34-question psychological matrix (17 dimensions x 2 items, balanced keying)
evaluates users across these dimensions:

## Big Five Personality Traits (10 questions)
- Openness
- Conscientiousness
- Extraversion
- Agreeableness
- Neuroticism

## Emotional Intelligence (8 questions)
- Self-awareness
- Self-regulation
- Empathy
- Social skills

## Communication Style (8 questions)
- Assertiveness
- Active listening
- Verbal/text preference
- Conflict resolution style

## Values & Motivations (8 questions)
- Intrinsic motivation
- Extrinsic motivation
- Core values assessment
- Life goals alignment

## Response Processing
Responses are scored per dimension (reverse-scored Likert, 0..1 normalized), the
17-dim profile is centered at 0.5 and projected with a seeded Gaussian matrix
(mulberry32 + Box-Muller) to a deterministic 768-dimensional vector
(`server/src/persona/vector.ts`; identical port in `ml/persona_vector.py`),
L2-normalized, then stored in pgvector for cosine-similarity retrieval during
chat (`ml/data/` vectors computed offline match the server exactly).

## Generated Training Data
`ml/datasets/build_dataset.py` samples synthetic trait profiles, renders the
persona text prompt, and emits:
- `persona_sft_{train,val}.jsonl` — ChatML-style messages for QLoRA SFT
- `persona_dpo_{train,val}.jsonl` — prompt + chosen/rejected for DPO alignment
