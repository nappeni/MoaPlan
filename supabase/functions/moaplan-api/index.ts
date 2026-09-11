import express from 'express';
import { createApp } from '../../../server/app.js';
import { setImageProcessor } from '../../../server/images.js';
import { optimize } from '../../../server/images-wasm.js';
setImageProcessor(optimize);
const secret = Deno.env.get('MOAPLAN_PROXY_SECRET');
if (!secret || secret.length < 32) throw new Error('MOAPLAN_PROXY_SECRET is required');
const {app} = await createApp({production:true,initializeStore:false});
const gateway=express();
gateway.use((req,res,next)=>{
  if (req.headers['x-moaplan-proxy'] !== secret) return res.status(403).json({error:'Forbidden'});
  next();
});
gateway.use('/moaplan-api',app);
gateway.listen(8000);
