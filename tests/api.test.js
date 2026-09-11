import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
test('API isolates organizations and preserves activity, secrets and session invariants', async (t) => {
  await fs.mkdir('.local/tests', { recursive: true });
  const dir = await fs.mkdtemp(path.resolve('.local/tests/api-'));
  const port = 5197;
  const base = 'http://127.0.0.1:' + port;
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      APP_URL: base,
      DATA_DIR: dir,
      DATABASE_URL: '',
      NODE_ENV: 'test',
      SETUP_TOKEN: 'test-only-setup',
      ENCRYPTION_KEY: randomBytes(32).toString('hex'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (d) => (output += d));
  child.stderr.on('data', (d) => (output += d));
  t.after(async () => {
    child.kill();
    await new Promise((resolve) => {
      if (child.exitCode !== null) return resolve();
      child.once('exit', resolve);
      setTimeout(resolve, 2000).unref();
    });
  });
  for (let i = 0; i < 80 && !output.includes('MoaPlan:'); i++) {
    if (child.exitCode !== null) throw new Error(output);
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.match(output, /MoaPlan:/);
  async function req(route, method = 'GET', body, cookie = '', origin = base) {
    const r = await fetch(base + '/api' + route, {
      method,
      headers: {
        Origin: origin,
        Cookie: cookie,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return {
      status: r.status,
      data: await r.json(),
      cookie: r.headers.get('set-cookie')?.split(';')[0],
    };
  }
  assert.equal((await req('/data')).status, 401);
  assert.equal(
    (
      await req('/setup', 'POST', {
        name: '관리자',
        organization: 'A',
        email: 'a@example.com',
        password: 'a-secure-test-password',
        setupToken: 'bad',
      })
    ).status,
    403,
  );
  const ua = await req('/setup', 'POST', {
    name: 'A관리자',
    organization: 'A단체',
    email: 'a@example.com',
    password: 'a-secure-test-password',
    setupToken: 'test-only-setup',
  });
  assert.equal(ua.status, 201);
  const ca = ua.cookie;
  const ub = await req('/setup', 'POST', {
    name: 'B관리자',
    organization: 'B단체',
    email: 'b@example.com',
    password: 'b-secure-test-password',
    setupToken: 'test-only-setup',
  });
  assert.equal(ub.status, 201);
  const cb = ub.cookie;
  assert.equal(
    (await req('/activities', 'POST', { title: '공격' }, ca, 'https://other.example')).status,
    403,
  );
  const venue = await req(
    '/venues',
    'POST',
    { name: '보호소', address: '부산광역시 테스트로 1' },
    ca,
  );
  assert.equal(venue.status, 201);
  const made = await req(
    '/activities',
    'POST',
    {
      title: '테스트 봉사',
      venueId: venue.data.id,
      startDate: '2026-10-10',
      startTime: '10:00',
      endTime: '12:00',
    },
    ca,
  );
  assert.equal(made.status, 201);
  assert.equal((await req('/data', 'GET', undefined, cb)).data.activities.length, 0);
  assert.equal(
    (await req('/activities/' + made.data.id, 'PUT', { ...made.data, title: '타단체 변경' }, cb))
      .status,
    404,
  );
  const updated = await req(
    '/activities/' + made.data.id,
    'PUT',
    { ...made.data, title: '저장된 봉사' },
    ca,
  );
  assert.equal(updated.status, 200);
  assert.equal(updated.data.version, 2);
  assert.equal((await req('/activities/' + made.data.id, 'PUT', made.data, ca)).status, 409);
  assert.equal((await req('/venues/' + venue.data.id, 'DELETE', undefined, ca)).status, 400);
  const badPromo = await req(
    '/activities/' + made.data.id + '/promotion',
    'PUT',
    {
      caption: '안내',
      hashtags: '',
      slides: Array.from({ length: 9 }, () => ({ title: 'a', body: 'b', visual: '' })),
      assetIds: [],
      sourceVersion: 2,
    },
    ca,
  );
  assert.equal(badPromo.status, 400);
  assert.equal((await req('/activities/' + made.data.id + '/publish', 'POST', {}, ca)).status, 400);
  const set = await req(
    '/settings',
    'PUT',
    { settings: { name: 'A 새 이름' }, secrets: { aiKey: 'not-a-real-key' } },
    ca,
  );
  assert.equal(set.status, 200);
  assert.equal(set.data.secrets.aiKey, true);
  const fullSettings = await req(
    '/settings',
    'PUT',
    {
      settings: { ...set.data, r2Bucket: 'test-bucket' },
      secrets: {},
      clearSecrets: [],
    },
    ca,
  );
  assert.equal(fullSettings.status, 200);
  assert.equal(fullSettings.data.r2Bucket, 'test-bucket');
  assert.equal(fullSettings.data.secrets.aiKey, true);
  assert.equal(JSON.stringify(set.data).includes('not-a-real-key'), false);
  const disk = await fs.readFile(path.join(dir, 'state.json'), 'utf8');
  assert.equal(disk.includes('not-a-real-key'), false);
  const exp = await req('/export', 'GET', undefined, ca);
  assert.equal(JSON.stringify(exp.data).includes('not-a-real-key'), false);
  assert.equal((await req('/data', 'GET', undefined, cb)).data.settings.secrets.aiKey, false);
  assert.equal((await req('/logout', 'POST', {}, ca)).status, 200);
  assert.equal((await req('/data', 'GET', undefined, ca)).status, 401);
  assert.equal(
    (await req('/login', 'POST', { email: 'a@example.com', password: 'wrong' })).status,
    401,
  );
  assert.equal(
    (await req('/login', 'POST', { email: 'a@example.com', password: 'a-secure-test-password' }))
      .status,
    200,
  );
});
