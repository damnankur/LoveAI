-- LoveAI: add verbal persona-type label to persona evaluations.
-- The five fixed prototypes (Resilient / Overcontrolled / Undercontrolled /
-- Reserved / Confident) are seeded with user_id NULL by scripts/seed-persona-types.ts.
-- User evaluations get their matched prototype label stamped at evaluate time.

ALTER TABLE persona_evaluations ADD COLUMN IF NOT EXISTS persona_type VARCHAR(100);
CREATE INDEX IF NOT EXISTS idx_persona_type ON persona_evaluations(persona_type);
