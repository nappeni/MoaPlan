import {setImageProcessor} from '../server/images.js';
import {optimize as nodeOptimize} from '../server/images-node.js';
setImageProcessor(nodeOptimize);
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { activitySchema, updateActivity, calendarEvent, publicActivity } from '../server/domain.js';
import { encrypt, decrypt, passwordHash, checkPassword } from '../server/security.js';
import { Store } from '../server/store.js';
import { optimize } from '../server/integrations.js';
import sharp from 'sharp';
test('date ranges and time ranges reject invalid chronology', () => {
  assert.throws(() =>
    activitySchema.parse({ title: '봉사', startDate: '2026-10-02', endDate: '2026-10-01' }),
  );
  assert.throws(() =>
    activitySchema.parse({ title: '봉사', startTime: '10:00', endTime: '09:00' }),
  );
  assert.throws(() => activitySchema.parse({ title: '봉사', startTime: '25:00' }));
  assert.throws(() => activitySchema.parse({ title: '봉사', capacity: -1 }));
  assert.throws(() => activitySchema.parse({ title: '봉사', startDate: '2026-02-30' }));
  assert.throws(() => activitySchema.parse({ title: '봉사', deadline: 'tomorrow' }));
});
test('planning changes pause scheduled publishing and flag calendar', () => {
  const a = updateActivity(
    { version: 3, promotion: { status: 'scheduled' }, calendar: { eventId: 'x' } },
    { title: '변경' },
  );
  assert.equal(a.version, 4);
  assert.equal(a.promotion.status, 'paused');
  assert.equal(a.promotion.stale, true);
  assert.equal(a.calendar.stale, true);
});
test('calendar requires confirmed start/end and excludes internal data', () => {
  assert.throws(() => calendarEvent({ title: 'x' }));
  const a = {
    title: '봉사',
    startDate: '2026-10-01',
    startTime: '09:00',
    endTime: '12:00',
    memo: '내부 메모',
    contact: '비공개',
    hours: 4,
  };
  const e = calendarEvent(a);
  assert.match(e.start.dateTime, /\+09:00$/);
  assert.equal(e.description.includes('내부'), false);
  assert.equal(publicActivity(a).memo, undefined);
});
test('secrets authenticate encryption and password hashes', () => {
  const key = randomBytes(32);
  const secret = encrypt('private-test-key', key);
  assert.equal(secret.includes('private-test-key'), false);
  assert.equal(decrypt(secret, key), 'private-test-key');
  assert.throws(() => decrypt(secret, randomBytes(32)));
  const p = passwordHash('a-long-test-password');
  assert.equal(checkPassword('a-long-test-password', p), true);
  assert.equal(checkPassword('incorrect-password', p), false);
});
test('local transactions preserve concurrent writes and rollback failures', async () => {
  await fs.mkdir('.local/tests', { recursive: true });
  const dir = await fs.mkdtemp(path.resolve('.local/tests/store-'));
  const store = new Store({ dir, url: '' });
  await store.init();
  await Promise.all(
    Array.from({ length: 20 }, () =>
      store.transact((s) => {
        s.count = (s.count || 0) + 1;
      }),
    ),
  );
  assert.equal(await store.read((s) => s.count), 20);
  await assert.rejects(
    store.transact((s) => {
      s.count = 99;
      throw new Error('rollback');
    }),
  );
  assert.equal(await store.read((s) => s.count), 20);
  const reopened = new Store({ dir, url: '' });
  await reopened.init();
  assert.equal(await reopened.read((s) => s.count), 20);
});
test('image optimization bounds dimensions and creates small thumbnail', async () => {
  const source = await sharp({
    create: { width: 2160, height: 2700, channels: 3, background: '#155f55' },
  })
    .png()
    .toBuffer();
  const { out, thumb } = await optimize(source);
  const meta = await sharp(out).metadata();
  assert.equal(meta.format, 'jpeg');
  assert.equal(meta.width, 1080);
  assert.equal(meta.height, 1350);
  assert.ok(out.length < 300 * 1024);
  assert.equal((await sharp(thumb).metadata()).format, 'webp');
  assert.equal((await sharp(thumb).metadata()).width, 160);
});
