import { NextResponse } from 'next/server';
import { checkConnection, isPgvectorAvailable } from '@/lib/db';
import { config } from '@/lib/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const db = await checkConnection();
  const pgv = await isPgvectorAvailable();
  return NextResponse.json({
    status: 'ok',
    service: 'LoveAI Server',
    db: db ? 'connected' : 'unreachable',
    pgvector: pgv ? 'available' : 'fallback',
    llm: config.llmMock ? 'mock' : config.llmEnabled && config.llmUrl ? `http ${config.llmUrl}` : 'disabled',
    matrixQuestions: 34,
  });
}
