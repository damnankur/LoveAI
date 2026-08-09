import { Client } from 'pg';

async function main() {
  const url = process.env.SUPABASE_DB_URL!;
  if (!url) throw new Error('SUPABASE_DB_URL required');
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const db = await client.query('SELECT current_database() AS db, current_user AS usr');
    const count = await client.query('SELECT COUNT(*)::int AS personas FROM persona_evaluations');
    const ext = await client.query("SELECT extversion FROM pg_extension WHERE extname='vector'");
    console.log('connected:', JSON.stringify(db.rows[0]));
    console.log('persona rows:', count.rows[0].personas);
    console.log('pgvector version:', ext.rows[0]?.extversion ?? 'MISSING');
  } finally {
    await client.end();
  }
}
main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
