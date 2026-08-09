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

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL missing');

const sql = readFileSync(process.argv[2], 'utf8');

async function main() {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const res = await client.query(sql);
    console.log(`Applied. Rows affected: ${res.rowCount}`);
  } finally {
    await client.end();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
