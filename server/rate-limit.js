export async function consumeAttempt(store, key, now = Date.now()) {
  return store.transact(s => {
    s.loginAttempts ||= {};
    for (const [id, value] of Object.entries(s.loginAttempts)) if (value.until <= now) delete s.loginAttempts[id];
    if (!s.loginAttempts[key] && Object.keys(s.loginAttempts).length >= 10000) return false;
    const value = s.loginAttempts[key] ||= { count: 0, until: now + 900000 };
    value.count = Math.min(31, value.count + 1);
    return value.count <= 30;
  });
}
