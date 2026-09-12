import fs from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const ref = 'ckcabjobmmhmpsqoaftb';
const db = new URL(process.env.DATABASE_URL);
if (!decodeURIComponent(db.username).includes(ref) && !db.hostname.includes(ref)) throw new Error('Database project mismatch');
if (!/^[a-f0-9]{64}$/i.test(process.env.ENCRYPTION_KEY || '')) throw new Error('Existing encryption key missing');
await fs.mkdir('.local/deploy', { recursive: true, mode: 0o700 });
const file = '.local/deploy/generated-secrets.json';
let secrets;
try { secrets = JSON.parse(await fs.readFile(file, 'utf8')); }
catch (error) {
  if (error.code !== 'ENOENT') throw error;
  secrets = { proxy: randomBytes(32).toString('hex'), setup: randomBytes(32).toString('hex') };
  await fs.writeFile(file, JSON.stringify(secrets), { mode: 0o600, flag: 'wx' });
}
const edge = {
  DATABASE_URL: process.env.DATABASE_URL,
  DATABASE_SSL_CA: process.env.DATABASE_SSL_CA || await fs.readFile(process.env.DATABASE_SSL_CA_FILE, 'utf8'),
  DATABASE_POOL_SIZE: '1',
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
  SETUP_TOKEN: secrets.setup,
  APP_URL: 'https://moaplan.pages.dev',
  MOAPLAN_PROXY_SECRET: secrets.proxy,
  MOAPLAN_WORKER_ENABLED: 'false',
  NODE_ENV: 'production',
};
function run(args, input) {
  const result = spawnSync(args[0], args.slice(1), { input, encoding: 'utf8', env: { ...process.env, CI: 'true', WRANGLER_SEND_METRICS: 'false' }, timeout: 90000 });
  if (result.status !== 0) throw new Error('Remote configuration failed; output withheld');
}
const envFile = '.local/deploy/edge.env';
try {
  await fs.writeFile(envFile, Object.entries(edge).map(([k,v]) => k + '=' + JSON.stringify(v)).join('\n'), { mode: 0o600 });
  run(['node_modules/.bin/supabase', 'secrets', 'set', '--env-file', envFile, '--project-ref', ref]);
  console.log('Edge secrets configured; values withheld.');
} finally { await fs.rm(envFile, { force: true }); }
for (const [name, value] of Object.entries({ MOAPLAN_API_URL: `https://${ref}.supabase.co/functions/v1/moaplan-api`, MOAPLAN_PROXY_SECRET: secrets.proxy })) {
  run(['node_modules/.bin/wrangler', 'pages', 'secret', 'put', name, '--project-name', 'moaplan'], value);
}
console.log('Pages secrets configured; values withheld.');
