import { Pool } from 'pg';
import { config } from './config';

const globalForPg = globalThis as unknown as { loveaiPool?: Pool };

const url = config.databaseUrl || '';
const isLocal =
  url.includes('localhost') || url.includes('127.0.0.1') || url.startsWith('postgres://loveai:');

export const pool =
  globalForPg.loveaiPool ??
  new Pool({
    connectionString: config.databaseUrl,
    ssl: isLocal ? undefined : { rejectUnauthorized: false },
    max: 10,
  });

if (!globalForPg.loveaiPool) globalForPg.loveaiPool = pool;

let pgvectorAvailable: boolean | null = null;

export async function isPgvectorAvailable(): Promise<boolean> {
  if (pgvectorAvailable !== null) return pgvectorAvailable;
  try {
    const { rows } = await pool.query("SELECT 1 FROM pg_type WHERE typname = 'vector'");
    pgvectorAvailable = rows.length > 0;
  } catch {
    pgvectorAvailable = false;
  }
  console.log(
    `[db] pgvector ${pgvectorAvailable ? 'available' : 'NOT available (using JS cosine fallback)'}`
  );
  return pgvectorAvailable;
}

export async function checkConnection(): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}
