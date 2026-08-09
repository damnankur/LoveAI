import { readFileSync, existsSync } from 'fs';
import { Client } from 'pg';

function loadEnvLocal(): void {
  const p = '.env.local';
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m || line.trimStart().startsWith('#')) continue;
    process.env[m[1]] = m[2].replace(/^"|"$/g, '');
  }
}
loadEnvLocal();

async function main() {
  const url = process.env.DATABASE_URL!;
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    console.log('Server:', client.connectionParameters.host, client.connectionParameters.database);
    const cols = await client.query(
      `SELECT column_name, data_type, udt_name FROM information_schema.columns
       WHERE table_schema='public' AND table_name='persona_evaluations' ORDER BY ordinal_position`
    );
    console.log('persona_evaluations columns:', JSON.stringify(cols.rows));
  } finally {
    await client.end();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
