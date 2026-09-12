import test from 'node:test';
import assert from 'node:assert/strict';
import { startWorker } from '../server/worker.js';

test('disabled worker never processes scheduled jobs', (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  let calls = 0;
  for (const value of ['', 'false', '1', 'TRUE']) {
    assert.equal(startWorker(() => calls++, value), null);
  }
  t.mock.timers.tick(60000);
  assert.equal(calls, 0);
});

test('explicitly enabled worker runs every ten seconds and can be stopped', (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  let calls = 0;
  const timer = startWorker(() => calls++, 'true');
  assert.equal(calls, 0);
  t.mock.timers.tick(10000);
  assert.equal(calls, 1);
  clearInterval(timer);
  t.mock.timers.tick(10000);
  assert.equal(calls, 1);
});

test('missing worker setting defaults to disabled', () => {
  const previous = process.env.MOAPLAN_WORKER_ENABLED;
  delete process.env.MOAPLAN_WORKER_ENABLED;
  try {
    assert.equal(startWorker(() => { throw new Error('unexpected job'); }), null);
  } finally {
    if (previous === undefined) delete process.env.MOAPLAN_WORKER_ENABLED;
    else process.env.MOAPLAN_WORKER_ENABLED = previous;
  }
});
