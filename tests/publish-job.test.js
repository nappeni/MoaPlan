import test from 'node:test';
import assert from 'node:assert/strict';
import { runPublishStep } from '../server/publish-job.js';
import { consumeAttempt } from '../server/rate-limit.js';
function fixture() {
  const p = {
    status: 'scheduled',
    scheduledAt: new Date(0).toISOString(),
    jobId: 'job',
    targetInstagramId: 'account',
    assets: [{ key: 'a' }],
  };
  const state = {
    organizations: [{ id: 'org', activities: [{ id: 'act', status: 'confirmed', promotion: p }] }],
  };
  let queue = Promise.resolve();
  const store = {
    transact(fn) {
      const next = queue.then(() => structuredClone(fn(state)));
      queue = next.catch(() => {});
      return next;
    },
  };
  return { p, store };
}
const creds = () => ({ instagramUserId: 'account' });
test('resumes each stage and publishes only once', async () => {
  const { p, store } = fixture();
  let published = 0;
  const api = {
    create: async () => ({ id: 'container' }),
    status: async () => ({ status_code: 'FINISHED' }),
    publish: async () => {
      published++;
      return { id: 'media' };
    },
  };
  await runPublishStep(store, creds, api, 10000);
  assert.equal(p.stage, 'poll');
  await runPublishStep(store, creds, api, 13000);
  assert.equal(p.stage, 'ready');
  await runPublishStep(store, creds, api, 14000);
  assert.equal(p.status, 'published');
  await runPublishStep(store, creds, api, 15000);
  assert.equal(published, 1);
});
test('concurrent ticks claim a job once', async () => {
  const { p, store } = fixture();
  let creates = 0;
  const api = {
    create: async () => {
      creates++;
      return { id: 'container' };
    },
  };
  await Promise.all([
    runPublishStep(store, creds, api, 10000),
    runPublishStep(store, creds, api, 10000),
  ]);
  assert.equal(creates, 1);
  assert.equal(p.stage, 'poll');
});
test('lost publish response requires manual review, never automatic retry', async () => {
  const { p, store } = fixture();
  Object.assign(p, {
    status: 'processing',
    stage: 'ready',
    containerId: 'c',
    startedAt: new Date(0).toISOString(),
  });
  let calls = 0;
  const api = {
    publish: async () => {
      calls++;
      throw new Error('timeout');
    },
  };
  await runPublishStep(store, creds, api, 10000);
  await runPublishStep(store, creds, api, 110000);
  assert.equal(p.status, 'attention');
  assert.equal(calls, 1);
});
test('expired publishing lease after runtime crash is not republished', async () => {
  const { p, store } = fixture();
  Object.assign(p, { status: 'processing', stage: 'publishing', leaseUntil: 9000 });
  await runPublishStep(store, creds, {}, 10000);
  assert.equal(p.status, 'attention');
});
test('login limit is shared across callers and expires', async () => {
  const { store } = fixture();
  const results = await Promise.all(
    Array.from({ length: 40 }, () => consumeAttempt(store, 'hashed-ip', 1000)),
  );
  assert.equal(results.filter(Boolean).length, 30);
  assert.equal(await consumeAttempt(store, 'hashed-ip', 901001), true);
});
test('carousel resumes all containers and publishes the parent only', async () => {
  const { p, store } = fixture();
  p.assets = [{ key: 'a' }, { key: 'b' }];
  const sent = [];
  const api = {
    create: async (_s, _p, i) => ({ id: 'child' + i }),
    status: async () => ({ status_code: 'FINISHED' }),
    carousel: async (_s, current) => {
      assert.deepEqual(current.containers, ['child0', 'child1']);
      return { id: 'parent' };
    },
    publish: async (_s, id) => {
      sent.push(id);
      return { id: 'media' };
    },
  };
  for (let i = 0; i < 7; i++) await runPublishStep(store, creds, api, 10000 + i * 10000);
  assert.equal(p.status, 'published');
  assert.deepEqual(sent, ['parent']);
});
test('a restarted worker resumes an expired preparation lease', async () => {
  const { p, store } = fixture();
  Object.assign(p, {
    status: 'processing',
    stage: 'poll',
    currentContainer: 'c',
    containers: [],
    assetIndex: 0,
    leaseUntil: 9000,
    startedAt: new Date(0).toISOString(),
  });
  await runPublishStep(store, creds, { status: async () => ({ status_code: 'FINISHED' }) }, 10000);
  assert.equal(p.stage, 'ready');
  assert.equal(p.containerId, 'c');
});

test('manual organization job is scoped, skipped by scheduler, and publishes once', async () => {
  const p = {
    manual: true,
    status: 'scheduled',
    scheduledAt: new Date(0).toISOString(),
    jobId: 'manual',
    targetInstagramId: 'account',
    assets: [{ key: 'image' }],
  };
  const other = { ...structuredClone(p), jobId: 'other', manual: false };
  const state = {
    organizations: [
      {
        id: 'org',
        activities: [{ id: 'activity', status: 'confirmed', promotion: other }],
        promotions: [{ id: 'promo', status: 'confirmed', promotion: p }],
      },
    ],
  };
  const store = { transact: async (fn) => structuredClone(fn(state)) };
  const target = { orgId: 'org', entryId: 'promo', collection: 'promotions', jobId: 'manual' };
  let published = 0;
  const api = {
    create: async () => ({ id: 'c' }),
    status: async () => ({ status_code: 'FINISHED' }),
    publish: async () => {
      published++;
      return { id: 'm' };
    },
  };
  await runPublishStep(store, creds, api, 10000, { ...target, orgId: 'wrong' });
  assert.equal(p.status, 'scheduled');
  for (const now of [10000, 13000, 16000, 19000])
    await runPublishStep(store, creds, api, now, target);
  assert.equal(p.status, 'published');
  assert.equal(published, 1);
  assert.equal(other.status, 'scheduled');
  p.status = 'scheduled';
  await runPublishStep(store, creds, api, 22000);
  assert.equal(p.status, 'scheduled');
});
test('missing publish result is attention, while permission failure gives safe actionable message', async () => {
  const { p, store } = fixture();
  const err = new Error('sensitive upstream details');
  err.remoteStatus = 403;
  await runPublishStep(
    store,
    creds,
    {
      create: async () => {
        throw err;
      },
    },
    10000,
  );
  assert.equal(p.status, 'failed');
  assert.match(p.error, /권한/);
  assert.ok(!p.error.includes('sensitive'));
  Object.assign(p, { status: 'processing', stage: 'ready', startedAt: new Date(0).toISOString() });
  await runPublishStep(store, creds, { publish: async () => ({}) }, 13000);
  assert.equal(p.status, 'attention');
});
