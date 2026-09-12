import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {randomBytes} from 'node:crypto';
import {optimize} from '../server/images-wasm.js';
test('WASM compression bounds noisy images and creates tiny WebP thumbnail',async()=>{
 const input=await sharp(randomBytes(960*720*3),{raw:{width:960,height:720,channels:3}}).png().toBuffer();
 const {out,thumb,width}=await optimize(input);
 assert.ok(out.length<=300*1024);assert.ok(thumb.length<16*1024);
 const metadata=await sharp(out).metadata();assert.equal(metadata.format,'jpeg');assert.equal(metadata.width,width);assert.ok(width<=960);
 assert.equal((await sharp(thumb).metadata()).format,'webp');
});
test('WASM does not enlarge small images and removes alpha',async()=>{
 const input=await sharp({create:{width:24,height:16,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).png().toBuffer();
 const {out,thumb}=await optimize(input);
 assert.equal((await sharp(out).metadata()).width,24);assert.equal((await sharp(thumb).metadata()).width,24);
 const {data}=await sharp(out).raw().toBuffer({resolveWithObject:true});assert.ok(data[0]>240);
});
