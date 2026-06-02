# Persona Evaluation Matrix

The 30-question psychological matrix evaluates users across these dimensions:

## Big Five Personality Traits (10 questions)
- Openness (2 questions)
- Conscientiousness (2 questions)
- Extraversion (2 questions)
- Agreeableness (2 questions)
- Neuroticism (2 questions)

## Emotional Intelligence (8 questions)
- Self-awareness (2 questions)
- Self-regulation (2 questions)
- Empathy (2 questions)
- Social skills (2 questions)

## Communication Style (7 questions)
- Assertiveness (2 questions)
- Passive/Active (2 questions)
- Verbal/Non-verbal preference (1 question)
- Conflict resolution style (2 questions)

## Values & Motivations (5 questions)
- Intrinsic/Extrinsic motivation (2 questions)
- Core values assessment (2 questions)
- Life goals alignment (1 question)

## Response Processing
Responses are embedded into a 768-dimensional vector space using a fine-tuned sentence transformer, then stored in pgvector for similarity retrieval during chat.
