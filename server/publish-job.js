import { randomUUID } from 'node:crypto';
// One remote request per tick. Leases prevent concurrent workers claiming the same job.
export async function runPublishStep(store, credentials, api, now = Date.now(), target = null) {
  const lease = randomUUID();
  const task = await store.transact((state) => {
    for (const org of state.organizations)
      for (const collection of ['activities', 'promotions'])
        for (const activity of org[collection] || []) {
          if (
            target &&
            (target.orgId !== org.id ||
              target.entryId !== activity.id ||
              target.collection !== collection)
          )
            continue;
          const p = activity.promotion;
          if (target ? !p?.manual || p.jobId !== target.jobId : p?.manual) continue;
          if (!p || !['scheduled', 'processing'].includes(p.status)) continue;
          if (p.status === 'scheduled') {
            if (Date.parse(p.scheduledAt) > now) continue;
            if (p.stale || activity.status !== 'confirmed') {
              p.status = 'paused';
              continue;
            }
            Object.assign(p, {
              status: 'processing',
              stage: 'create',
              startedAt: new Date(now).toISOString(),
              containers: [],
              assetIndex: 0,
            });
          }
          if ((p.leaseUntil || 0) > now || (p.nextAt || 0) > now) continue;
          // A publish request may have succeeded before a crash. Never send it again automatically.
          if (
            p.stage === 'publishing' ||
            !['create', 'poll', 'carousel', 'poll-carousel', 'ready'].includes(p.stage)
          ) {
            p.status = 'attention';
            p.error = '처리가 중단되었습니다. Instagram에서 게시 여부를 확인해 주세요.';
            continue;
          }
          if (now - Date.parse(p.startedAt) > 20 * 60000) {
            p.status = 'failed';
            p.error = '이미지 준비 시간이 초과되었습니다. 다시 게시해 주세요.';
            continue;
          }
          p.leaseId = lease;
          p.leaseUntil = now + 90000;
          return { org, activity, collection };
        }
    return null;
  });
  if (!task) return { processed: false };
  const p = task.activity.promotion;
  const update = (fn) =>
    store.transact((state) => {
      const current = state.organizations
        .find((o) => o.id === task.org.id)
        ?.[task.collection]?.find((a) => a.id === task.activity.id)?.promotion;
      if (
        !current ||
        current.jobId !== p.jobId ||
        current.leaseId !== lease ||
        current.status !== 'processing'
      )
        return false;
      fn(current);
      return true;
    });
  let publishing = false;
  try {
    const s = credentials(task.org);
    if (s.instagramUserId !== p.targetInstagramId)
      throw new Error('예약 후 게시 계정이 변경되었습니다.');
    let patch;
    if (p.stage === 'create') {
      const item = await api.create(s, p, p.assetIndex);
      if (!item?.id) throw new Error('missing container');
      patch = { stage: 'poll', currentContainer: item.id, nextAt: now + 2000 };
    } else if (p.stage === 'poll' || p.stage === 'poll-carousel') {
      const result = await api.status(s, p.currentContainer);
      if (['ERROR', 'EXPIRED'].includes(result.status_code))
        throw new Error('Instagram 이미지 처리에 실패했습니다.');
      if (result.status_code !== 'FINISHED') patch = { nextAt: now + 5000 };
      else if (p.stage === 'poll-carousel')
        patch = { stage: 'ready', containerId: p.currentContainer, nextAt: 0 };
      else {
        const containers = [...p.containers, p.currentContainer];
        patch = {
          containers,
          assetIndex: p.assetIndex + 1,
          nextAt: 0,
          stage:
            containers.length < p.assets.length
              ? 'create'
              : containers.length > 1
                ? 'carousel'
                : 'ready',
          ...(containers.length === 1 && p.assets.length === 1
            ? { containerId: p.currentContainer }
            : {}),
        };
      }
    } else if (p.stage === 'carousel') {
      const item = await api.carousel(s, p);
      if (!item?.id) throw new Error('missing container');
      patch = { stage: 'poll-carousel', currentContainer: item.id, nextAt: now + 2000 };
    } else {
      if (
        !(await update((current) => {
          current.stage = 'publishing';
        }))
      )
        return { processed: false };
      publishing = true;
      const result = await api.publish(s, p.containerId);
      if (!result?.id) throw new Error('missing media');
      patch = {
        status: 'published',
        stage: 'done',
        mediaId: result.id,
        publishedAt: new Date().toISOString(),
        error: '',
      };
    }
    await update((current) => Object.assign(current, patch, { leaseUntil: 0, leaseId: '' }));
    return { processed: true };
  } catch (error) {
    const reason = [401, 403].includes(error.remoteStatus)
      ? 'Instagram 인증 또는 권한이 만료되었거나 부족합니다. 단체 관리에서 연결을 확인해 주세요.'
      : error.remoteStatus === 429
        ? 'Instagram 요청 한도에 도달했습니다. 잠시 후 다시 게시해 주세요.'
        : '게시 준비에 실패했습니다. 이미지 저장소와 Instagram 계정·토큰·게시 권한을 확인한 후 다시 게시해 주세요.';
    await update((current) =>
      Object.assign(current, {
        status: publishing ? 'attention' : 'failed',
        leaseUntil: 0,
        leaseId: '',
        error: publishing
          ? '게시 결과가 불명확합니다. Instagram에서 확인 후 처리해 주세요.'
          : reason,
      }),
    );
    return { processed: true, failed: true };
  }
}
