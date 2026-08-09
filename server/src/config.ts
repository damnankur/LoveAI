import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: Number(process.env.PORT) || 3001,
  databaseUrl:
    process.env.DATABASE_URL ||
    'postgresql://loveai:loveai_pw@localhost:5432/loveai',
  // URL of the self-hosted fine-tuned model inference server (ml/serve.py)
  llmUrl: process.env.LLM_URL || 'http://localhost:8000',
  llmEnabled: process.env.LLM_ENABLED !== 'false',
  llmTimeoutMs: Number(process.env.LLM_TIMEOUT_MS) || 60000,
  // When true, never call the inference server (deterministic local fallback)
  llmMock: process.env.LLM_MOCK === 'true',
  // Comma-separated list of allowed frontend origins for CORS.
  // Empty (default) = allow all origins (dev). For production set
  // ALLOWED_ORIGINS in server/.env to the deployed frontend URL(s), e.g.
  //   ALLOWED_ORIGINS=https://loveai.example.com,https://loveai.vercel.app
  allowedOrigins: (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  vectorDim: 768,
  personaProjectionSeed: Number(process.env.PERSONA_SEED) || 42,

  // Auth (Google ID token) sessions
  authSessionTtlDays: Number(process.env.AUTH_SESSION_TTL_DAYS) || 30,
  // Dev-only bypass: when true, an idToken of the form "dev:<email>" is accepted
  // without calling Google (offline testing). Never enable in production.
  allowDevToken: process.env.AUTH_ALLOW_DEV_TOKEN === 'true',
};
