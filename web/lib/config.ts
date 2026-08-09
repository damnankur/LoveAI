export const config = {
  databaseUrl: process.env.DATABASE_URL || '',
  llmUrl: process.env.LLM_URL || '',
  llmEnabled: process.env.LLM_ENABLED !== 'false',
  llmMock: process.env.LLM_MOCK === 'true',
  llmApiKey: process.env.LLM_API_KEY || '',
  llmTimeoutMs: Number(process.env.LLM_TIMEOUT_MS) || 60000,
  vectorDim: 768,
  personaProjectionSeed: Number(process.env.PERSONA_SEED) || 42,
  authSessionTtlDays: Number(process.env.AUTH_SESSION_TTL_DAYS) || 30,
  allowDevToken: process.env.AUTH_ALLOW_DEV_TOKEN === 'true',
};
