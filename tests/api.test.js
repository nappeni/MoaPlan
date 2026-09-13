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
      MOAPLAN_WORKER_ENABLED: 'false',
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
    { settings: { name: 'A 새 이름', color: '#cb713a' }, secrets: { aiKey: 'not-a-real-key' } },
    ca,
  );
  assert.equal(set.status, 200);
  assert.equal(set.data.secrets.aiKey, true);
  assert.equal(set.data.color, '#cb713a');
  assert.equal((await req('/data', 'GET', undefined, ca)).data.settings.color, '#cb713a');
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
  // Organization promotions are independent and stay private to their organization.
  const campaign = await req(
    '/promotions',
    'POST',
    { title: '단체 소개', description: '공개 가능한 단체 소개' },
    ca,
  );
  assert.equal(campaign.status, 201);
  const route = '/promotions/' + campaign.data.id;
  const draft = {
    caption: '소개 게시글',
    hashtags: '#단체',
    slides: [{ title: '소개', body: '함께해요' }],
    assetIds: [],
    sourceVersion: 1,
  };
  assert.equal((await req(route + '/promotion', 'PUT', draft, cb)).status, 404);
  assert.equal(
    (await req('/activities/' + campaign.data.id + '/promotion', 'PUT', draft, ca)).status,
    404,
  );
  assert.equal((await req('/data', 'GET', undefined, cb)).data.promotions.length, 0);
  assert.equal((await req('/data', 'GET', undefined, ca)).data.activities.length, 1);
  const saved = await req(route + '/promotion', 'PUT', draft, ca);
  assert.equal(saved.status, 200);
  assert.equal(saved.data.promotion.status, 'draft');
  assert.equal(
    (await req(route + '/publish-step', 'POST', { jobId: 'unapproved' }, ca)).status,
    409,
  );
  // Seed an image descriptor in the isolated test store; never contact R2 or Instagram.
  const stateFile = path.join(dir, 'state.json');
  const state = JSON.parse(await fs.readFile(stateFile, 'utf8'));
  const item = state.organizations
    .flatMap((o) => o.promotions || [])
    .find((a) => a.id === campaign.data.id);
  item.assets = [{ id: 'image', key: 'test-image' }];
  await fs.writeFile(stateFile, JSON.stringify(state));
  const rendered = await req(route + '/promotion', 'PUT', { ...draft, assetIds: ['image'] }, ca);
  assert.equal(rendered.status, 200);
  const approval = { approved: true, reviewedAt: rendered.data.promotion.updatedAt };
  const missing = await req(route + '/publish', 'POST', approval, ca);
  assert.equal(missing.status, 400);
  assert.match(missing.data.error, /설정/);
  await req(
    '/settings',
    'PUT',
    {
      settings: { instagramUserId: '12345', graphVersion: 'v22.0' },
      secrets: { instagramToken: 'test-only-token' },
    },
    ca,
  );
  assert.equal((await req(route + '/publish', 'POST', {}, ca)).status, 409);
  assert.equal(
    (await req(route + '/publish', 'POST', { ...approval, reviewedAt: 'stale' }, ca)).status,
    409,
  );
  assert.equal(
    (
      await req(
        route + '/publish',
        'POST',
        { ...approval, scheduledAt: '2099-01-01T00:00:00Z' },
        ca,
      )
    ).status,
    503,
  );
  const queued = await req(route + '/publish', 'POST', approval, ca);
  assert.equal(queued.status, 200);
  assert.equal(queued.data.promotion.manual, true);
  assert.equal(queued.data.promotion.approval.reviewedAt, approval.reviewedAt);
  assert.ok(queued.data.promotion.approval.userId);
  assert.ok(Number.isFinite(Date.parse(queued.data.promotion.approval.approvedAt)));
  assert.equal(queued.data.promotion.status, 'scheduled');
  assert.equal((await req(route + '/publish', 'POST', approval, ca)).status, 400);
  assert.equal(
    (await req(route + '/publish-step', 'POST', { jobId: queued.data.promotion.jobId }, cb)).status,
    404,
  );
  assert.equal(
    (await req(route + '/publish-step', 'POST', { jobId: 'wrong-job' }, ca)).status,
    409,
  );
  assert.equal((await req(route + '/unpublish', 'POST', {}, ca)).status, 200);
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
