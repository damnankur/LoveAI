import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import { config } from './config';

export const pool = new Pool({ connectionString: config.databaseUrl });

let pgvectorAvailable: boolean | null = null;

export async function isPgvectorAvailable(): Promise<boolean> {
  if (pgvectorAvailable !== null) return pgvectorAvailable;
  try {
    await pool.query('CREATE EXTENSION IF NOT EXISTS vector');
    const { rows } = await pool.query(
      "SELECT 1 FROM pg_type WHERE typname = 'vector'"
    );
    pgvectorAvailable = rows.length > 0;
  } catch {
    pgvectorAvailable = false;
  }
  console.log(`[db] pgvector ${pgvectorAvailable ? 'available' : 'NOT available (using JS cosine fallback)'}`);
  return pgvectorAvailable;
}

export async function applySchema(): Promise<void> {
  const vectorOk = await isPgvectorAvailable();
  const schema = fs.readFileSync(path.join(__dirname, 'models', 'schema.sql'), 'utf8');

  try {
    if (vectorOk) {
      await pool.query(schema);
    } else {
      // Fallback schema without the vector column / HNSW index.
      const fallback = schema
        .replace(/CREATE EXTENSION IF NOT EXISTS vector;/, '')
        .replace(/persona_vector vector\(768\),/, '')
        .replace(/CREATE INDEX IF NOT EXISTS idx_persona_vector[\s\S]*?vector_cosine_ops\);\s*$/, '');
      await pool.query(fallback);
    }
  } catch (err: any) {
    // Extension tables may already exist; tolerate re-runs.
    if (!String(err?.message || '').includes('already exists')) throw err;
  }
  console.log('[db] schema ready');
}

export async function checkConnection(): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}
