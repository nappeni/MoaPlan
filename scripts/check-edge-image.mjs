import fs from 'node:fs/promises';
import sharp from 'sharp';
const {proxy}=JSON.parse(await fs.readFile('.local/deploy/generated-secrets.json','utf8'));
const b=await sharp({create:{width:1080,height:1350,channels:3,background:'#155f55'}}).png().toBuffer();
const r=await fetch('https://ckcabjobmmhmpsqoaftb.supabase.co/functions/v1/moaplan-api/internal/image-check',{method:'POST',headers:{'x-moaplan-proxy':proxy,'Content-Type':'application/json'},body:JSON.stringify({data:b.toString('base64')}),signal:AbortSignal.timeout(60000)});
const data=await r.json();
console.log(JSON.stringify({status:r.status,ok:data.ok,bytes:data.bytes,thumbBytes:data.thumbBytes,width:data.width}));
if(!r.ok)process.exitCode=1;
