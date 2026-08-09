import { Client } from 'pg';

const REF = 'hddjorzhvtypzexcsniq';
const PASSWORD = process.env.SUPABASE_DB_PASSWORD || '';

const AWS_REGIONS = [
  'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2', 'ca-central-1', 'ca-west-1',
  'eu-west-1', 'eu-west-2', 'eu-west-3', 'eu-central-1', 'eu-central-2', 'eu-north-1', 'eu-south-1', 'eu-south-2',
  'ap-east-1', 'ap-south-1', 'ap-south-2', 'ap-northeast-1', 'ap-northeast-2', 'ap-northeast-3',
  'ap-southeast-1', 'ap-southeast-2', 'ap-southeast-3', 'ap-southeast-4', 'ap-southeast-5',
  'sa-east-1', 'me-south-1', 'me-central-1', 'af-south-1', 'il-central-1',
];

async function probe(region: string): Promise<string> {
  const url = `postgresql://postgres.${REF}:${PASSWORD}@aws-0-${region}.pooler.supabase.com:6543/postgres`;
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 7000 });
  try {
    await client.connect();
    const r = await client.query('SELECT current_user AS u');
    return `FOUND+CONNECTED ${r.rows[0].u}`;
  } catch (e) {
    const m = (e as Error).message;
    if (m.includes('not found')) return 'no-tenant';
    if (m.includes('password authentication failed')) return 'TENANT-FOUND-BAD-PASSWORD';
    return `other: ${m.slice(0, 90)}`;
  } finally {
    await client.end().catch(() => {});
  }
}

async function main() {
  for (const region of AWS_REGIONS) {
    const result = await probe(region);
    if (result !== 'no-tenant') console.log(`${region.padEnd(16)} ${result}`);
  }
  console.log('scan complete');
}
main().catch((e) => { console.error(e); process.exit(1); });
