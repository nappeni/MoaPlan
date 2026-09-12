// Opt in explicitly, including in production: starting the API must not publish posts.
export function startWorker(work, enabled = process.env.MOAPLAN_WORKER_ENABLED) {
  if (enabled !== 'true') return null;
  const interval = setInterval(() => {
    try { Promise.resolve(work()).catch(() => console.error('Scheduled job failed')); }
    catch { console.error('Scheduled job failed'); }
  }, 10000);
  interval.unref();
  return interval;
}
