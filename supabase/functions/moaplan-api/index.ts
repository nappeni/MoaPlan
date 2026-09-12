import { encryptionKey } from '../../../server/security.js';
import { credentials, testR2, calendars, ig } from '../../../server/integrations.js';
import { Buffer } from 'node:buffer';
import express from 'express';
import { createApp } from '../../../server/app.js';
import { setImageProcessor } from '../../../server/images.js';

import { optimize } from '../../../server/images-wasm.js';
setImageProcessor(optimize);
const secret = Deno.env.get('MOAPLAN_PROXY_SECRET');
if (!secret || secret.length < 32) throw new Error('MOAPLAN_PROXY_SECRET is required');
if (!/^[a-f0-9]{64}$/i.test(Deno.env.get('ENCRYPTION_KEY') || '')) {
  throw new Error('Existing ENCRYPTION_KEY is required');
}
const { app, store, work } = await createApp({ production: true, initializeStore: false });
const gateway = express();
gateway.disable('x-powered-by');
gateway.use((req, res, next) => {
  if (req.headers['x-moaplan-proxy'] !== secret) return res.status(403).json({ error: 'Forbidden' });
  next();
});
gateway.get('/moaplan-api/internal/connections', async (_req,res) => {
  try {
    const key = await encryptionKey(store.dir);
    const orgs = await store.read(s => s.organizations);
    const results = [];
    for (const org of orgs) {
      const s = credentials(org,key);
      const status = {};
      for (const [name,present,check] of [
        ['r2',!!s.r2SecretAccessKey,() => testR2(s)],
        ['google',!!s.googleRefreshToken,() => calendars(s)],
        ['instagram',!!s.instagramToken,() => ig(s,s.instagramUserId+'?fields=id')],
        ['openai',!!s.aiKey,async () => {
          const response = await fetch('https://api.openai.com/v1/models',{headers:{Authorization:'Bearer '+s.aiKey},signal:AbortSignal.timeout(20000)});
          if (!response.ok) throw new Error('Connection failed');
          await response.body?.cancel();
        }],
      ]) {
        if (!present) { status[name] = 'not-configured'; continue; }
        try { await check(); status[name] = 'ok'; } catch { status[name] = 'failed'; }
      }
      results.push(status);
    }
    res.json({ok:true,results});
  } catch { res.status(500).json({error:'Connection check failed'}); }
});
// Authenticated deployment diagnostics: no DB or external service writes.
gateway.post('/moaplan-api/internal/image-check', express.json({limit:'1mb'}), async (req,res) => {
  try {
    const input = Buffer.from(req.body.data || '', 'base64');
    const result = await optimize(input);
    res.json({ok:true,bytes:result.out.length,thumbBytes:result.thumb.length,width:result.width});
  } catch (error) {
    console.error('Image check:', String(error.message).slice(0,180).replace(/[a-zA-Z0-9+/=]{40,}/g,'[redacted]'));
    res.status(500).json({error:'Image check failed'});
  }
});
gateway.post('/moaplan-api/internal/work', async (_req, res) => {
  if (Deno.env.get('MOAPLAN_WORKER_ENABLED') !== 'true') return res.status(503).json({ error:'Scheduler disabled' });
  try { res.json(await work()); }
  catch { res.status(500).json({ error:'Scheduled job failed' }); }
});
gateway.use('/moaplan-api', app);
// No worker or scheduler is started by this entrypoint.
gateway.listen(8000);
