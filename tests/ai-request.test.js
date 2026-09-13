import test from 'node:test';
import assert from 'node:assert/strict';
import {aiText,jsonFetch} from '../server/integrations.js';
test('JSON output instruction exists in actual input and provider details remain private',async t=>{
 const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});
 globalThis.fetch=async(_url,options)=>{
  const body=JSON.parse(options.body);
  assert.match(body.input,/JSON/);assert.equal(body.text.format.type,'json_object');
  return new Response(JSON.stringify({output:[{content:[{type:'output_text',text:'{"caption":"ok"}'}]}]}),{status:200});
 };
 assert.deepEqual(await aiText({aiKey:'synthetic',aiModel:'test-model'},{kind:'organization',title:'제목',description:'설명'},'promotion',true),{caption:'ok'});
 for(const [status,error,expected] of [[400,{param:'text.format',message:'unsupported secret-value'},/JSON/],[401,{message:'secret-value'},/인증/],[429,{code:'insufficient_quota',message:'secret-value'},/잔액/]]){
  globalThis.fetch=async()=>new Response(JSON.stringify({error}),{status});
  await assert.rejects(jsonFetch('https://api.openai.com/v1/responses'),e=>{assert.match(e.message,expected);assert.ok(!e.message.includes('secret-value'));return true;});
 }
});
