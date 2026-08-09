import express from 'express';
import cors from 'cors';
import { config } from './config';
import { applySchema, checkConnection, isPgvectorAvailable } from './db';
import personaRoutes from './routes/persona';
import chatRoutes from './routes/chat';
import authRoutes from './routes/auth';
import profileRoutes from './routes/profile';

// ---------------------------------------------------------------------------
// CORS: production-ready origin allowlist is configurable via ALLOWED_ORIGINS.
//   - Empty (default): allow every origin (local dev - client runs on another
//     port, e.g. Vite on http://localhost:5173).
//   - Non-empty: only the comma-separated origins in ALLOWED_ORIGINS are
//     accepted; everything else is rejected.
// The deploying agent/session MUST update ALLOWED_ORIGINS in server/.env to
// the real frontend URL(s) before going live, e.g.
//     ALLOWED_ORIGINS=https://loveai.example.com,https://loveai.vercel.app
// ---------------------------------------------------------------------------
function buildCorsOptions(): cors.CorsOptions {
  if (config.allowedOrigins.length === 0) {
    return { origin: true };
  }
  return {
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      if (!origin || config.allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`CORS blocked origin: ${origin}`));
    },
  };
}

const app = express();

app.use(cors(buildCorsOptions()));
app.use(express.json());

app.get('/api/health', async (_req, res) => {
  const db = await checkConnection();
  const pgv = await isPgvectorAvailable();
  res.json({
    status: 'ok',
    service: 'LoveAI Server',
    db: db ? 'connected' : 'unreachable',
    pgvector: pgv ? 'available' : 'fallback',
    llm: config.llmMock ? 'mock' : config.llmEnabled ? `http ${config.llmUrl}` : 'disabled',
    corsOrigins: config.allowedOrigins.length
      ? config.allowedOrigins
      : 'any (dev) - set ALLOWED_ORIGINS before production',
    matrixQuestions: 34,
  });
});

app.use('/api/persona', personaRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);

// JSON error handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[server] unhandled error:', err);
  res.status(500).json({ error: err?.message || 'Internal server error' });
});

async function start() {
  await applySchema();
  app.listen(config.port, () => {
    console.log(`LoveAI Server running on port ${config.port}`);
  });
}

start().catch((err) => {
  console.error('Failed to start LoveAI server:', err);
  process.exit(1);
});
