// Run only after approval for production extensions, Vault, function and paused Cron.
import fs from 'node:fs/promises';
import {Store} from '../server/store.js';
const store=new Store();
const {proxy}=JSON.parse(await fs.readFile('.local/deploy/generated-secrets.json','utf8'));
const db=await store.pool.connect();
try {
 await db.query('BEGIN');
 await db.query('CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog');
 await db.query('CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions');
 const existing=await db.query("SELECT id FROM vault.secrets WHERE name='moaplan_scheduler_proxy'");
 if(existing.rows.length)await db.query('SELECT vault.update_secret($1::uuid,$2::text)',[existing.rows[0].id,proxy]);
 else await db.query("SELECT vault.create_secret($1::text,'moaplan_scheduler_proxy','MoaPlan scheduler')",[proxy]);
 await db.query(`CREATE OR REPLACE FUNCTION moaplan_private.trigger_publishing_step() RETURNS bigint
 LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
 DECLARE request_id bigint; proxy text;
 BEGIN
 IF NOT EXISTS(SELECT 1 FROM moaplan_private.moaplan_state s,
 jsonb_array_elements(s.data->'organizations') o,jsonb_array_elements(o->'activities') a
 WHERE a->'promotion'->>'status'='processing' OR
 (a->'promotion'->>'status'='scheduled' AND (a->'promotion'->>'scheduledAt')::timestamptz<=now())) THEN RETURN NULL; END IF;
 SELECT decrypted_secret INTO proxy FROM vault.decrypted_secrets WHERE name='moaplan_scheduler_proxy';
 SELECT net.http_post(url:='https://ckcabjobmmhmpsqoaftb.supabase.co/functions/v1/moaplan-api/internal/work',
 headers:=jsonb_build_object('Content-Type','application/json','x-moaplan-proxy',proxy),
 body:='{}'::jsonb,timeout_milliseconds:=30000) INTO request_id;
 RETURN request_id; END $$`);
 await db.query('REVOKE ALL ON FUNCTION moaplan_private.trigger_publishing_step() FROM PUBLIC, anon, authenticated');
 const {rows}=await db.query("SELECT cron.schedule('moaplan-publishing-step','10 seconds','SELECT moaplan_private.trigger_publishing_step()') AS id");
 await db.query('SELECT cron.alter_job($1::bigint,active:=false)',[rows[0].id]);
 await db.query('COMMIT');
 console.log('Scheduler installed and paused.');
} catch {
 await db.query('ROLLBACK');process.exitCode=1;console.error('Scheduler installation rolled back; diagnostics withheld.');
} finally {db.release();await store.close();}
