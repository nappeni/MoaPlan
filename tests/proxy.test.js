import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/api/[[path]].js';
const env = { MOAPLAN_API_URL: 'https://edge.example/functions/v1/moaplan-api', MOAPLAN_PROXY_SECRET: 'test-'.repeat(8) };

test('proxy rejects missing configuration and cross-origin writes before contacting API', async () => {
  const request = new Request('https://app.example/api/login', { method: 'POST', headers: { Origin: 'https://other.example' } });
  assert.equal((await onRequest({ request, env: {} })).status, 503);
  assert.equal((await onRequest({ request, env })).status, 403);
});

test('proxy forwards API path, cookies, origin and trusted headers; preserves session cookie', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(String(url), 'https://edge.example/functions/v1/moaplan-api/api/login?x=1');
    assert.equal(options.headers.get('Authorization'), null);
    assert.equal(options.headers.get('x-moaplan-proxy'), env.MOAPLAN_PROXY_SECRET);
    assert.equal(options.headers.get('x-forwarded-for'), '192.0.2.1');
    assert.equal(options.headers.get('Cookie'), 'moaplan=test-session');
    assert.equal(options.headers.get('Origin'), 'https://app.example');
    assert.equal(options.redirect, 'manual');
    return new Response('{}', { headers: { 'Set-Cookie': 'moaplan=new; Secure; HttpOnly; Path=/' } });
  });
  const request = new Request('https://app.example/api/login?x=1', {
    method: 'POST', body: '{}', headers: { Origin: 'https://app.example', Cookie: 'moaplan=test-session', Authorization: 'untrusted', 'x-moaplan-proxy': 'untrusted', 'x-forwarded-for': 'untrusted', 'cf-connecting-ip': '192.0.2.1' },
  });
  const response = await onRequest({ request, env });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.match(response.headers.get('Set-Cookie'), /Secure; HttpOnly/);
});

test('proxy hides upstream connection failure details', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('sensitive diagnostic'); });
  const response = await onRequest({ request: new Request('https://app.example/api/health'), env });
  assert.equal(response.status, 502);
  assert.equal((await response.text()).includes('sensitive'), false);
});
