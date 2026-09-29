import { Pool } from 'pg';
import { config } from './config';

const globalForPg = globalThis as unknown as { loveaiPool?: Pool };

const rawUrl = config.databaseUrl || '';

function parseDbConfig(connStr: string) {
  if (!connStr) return {};
  try {
    const u = new URL(connStr);
    const isLocal = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
    return {
      host: u.hostname,
      port: Number(u.port) || 5432,
      user: decodeURIComponent(u.username),
      password: decodeURIComponent(u.password),
      database: u.pathname.replace(/^\//, '') || 'postgres',
      ssl: isLocal ? undefined : { rejectUnauthorized: false },
      max: 10,
      connectionTimeoutMillis: 10000,
    };
  } catch (err) {
    console.error('[db] parseDbConfig error:', err);
    return {
      connectionString: connStr,
      ssl: connStr.includes('localhost') ? undefined : { rejectUnauthorized: false },
      max: 10,
    };
  }
}

export const pool =
  globalForPg.loveaiPool ??
  new Pool(parseDbConfig(rawUrl));

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

let lastDbError = '';

export function getDbError(): string {
  return lastDbError;
}

export function getDbHost(): string {
  const u = config.databaseUrl || '';
  if (!u) return 'empty';
  try {
    const parts = u.split('@');
    if (parts.length > 1) {
      return parts[1].split('/')[0];
    }
    return 'invalid-format';
  } catch {
    return 'parse-err';
  }
}

export async function checkConnection(): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    lastDbError = '';
    return true;
  } catch (err: any) {
    lastDbError = err?.message || String(err);
    console.error('[db] connection error:', lastDbError);
    return false;
  }
}
