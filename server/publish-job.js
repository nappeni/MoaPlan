import { randomUUID } from 'node:crypto';
// One remote request per tick. Leases prevent concurrent workers claiming the same job.
export async function runPublishStep(store, credentials, api, now = Date.now()) {
  const lease = randomUUID();
  const task = await store.transact(state => {
    for (const org of state.organizations) for (const activity of org.activities) {
      const p = activity.promotion;
      if (!p || !['scheduled','processing'].includes(p.status)) continue;
      if (p.status === 'scheduled') {
        if (Date.parse(p.scheduledAt) > now) continue;
        if (p.stale || activity.status !== 'confirmed') { p.status = 'paused'; continue; }
        Object.assign(p, { status:'processing', stage:'create', startedAt:new Date(now).toISOString(), containers:[], assetIndex:0 });
      }
      if ((p.leaseUntil || 0) > now || (p.nextAt || 0) > now) continue;
      // A publish request may have succeeded before a crash. Never send it again automatically.
      if (p.stage === 'publishing' || !['create','poll','carousel','poll-carousel','ready'].includes(p.stage)) {
        p.status = 'attention'; p.error = '처리가 중단되었습니다. Instagram에서 게시 여부를 확인해 주세요.'; continue;
      }
      if (now - Date.parse(p.startedAt) > 20 * 60000) {
        p.status = 'failed'; p.error = '이미지 준비 시간이 초과되었습니다. 다시 예약해 주세요.'; continue;
      }
      p.leaseId = lease; p.leaseUntil = now + 90000;
      return { org, activity };
    }
    return null;
  });
  if (!task) return { processed:false };
  const p = task.activity.promotion;
  const update = fn => store.transact(state => {
    const current = state.organizations.find(o => o.id === task.org.id)?.activities.find(a => a.id === task.activity.id)?.promotion;
    if (!current || current.jobId !== p.jobId || current.leaseId !== lease || current.status !== 'processing') return false;
    fn(current); return true;
  });
  let publishing = false;
  try {
    const s = credentials(task.org);
    if (s.instagramUserId !== p.targetInstagramId) throw new Error('예약 후 게시 계정이 변경되었습니다.');
    let patch;
    if (p.stage === 'create') {
      const item = await api.create(s,p,p.assetIndex);
      patch = { stage:'poll', currentContainer:item.id, nextAt:now+2000 };
    } else if (p.stage === 'poll' || p.stage === 'poll-carousel') {
      const result = await api.status(s,p.currentContainer);
      if (['ERROR','EXPIRED'].includes(result.status_code)) throw new Error('Instagram 이미지 처리에 실패했습니다.');
      if (result.status_code !== 'FINISHED') patch = {nextAt:now+5000};
      else if (p.stage === 'poll-carousel') patch = {stage:'ready',containerId:p.currentContainer,nextAt:0};
      else {
        const containers = [...p.containers,p.currentContainer];
        patch = {containers,assetIndex:p.assetIndex+1,nextAt:0,
          stage:containers.length < p.assets.length ? 'create' : containers.length > 1 ? 'carousel' : 'ready',
          ...(containers.length===1 && p.assets.length===1 ? {containerId:p.currentContainer} : {})};
      }
    } else if (p.stage === 'carousel') {
      const item = await api.carousel(s,p);
      patch = {stage:'poll-carousel',currentContainer:item.id,nextAt:now+2000};
    } else {
      if (!await update(current => { current.stage = 'publishing'; })) return {processed:false};
      publishing = true;
      const result = await api.publish(s,p.containerId);
      patch = {status:'published',stage:'done',mediaId:result.id,publishedAt:new Date().toISOString(),error:''};
    }
    await update(current => Object.assign(current,patch,{leaseUntil:0,leaseId:''}));
    return {processed:true};
  } catch {
    await update(current => Object.assign(current, {status:publishing?'attention':'failed',leaseUntil:0,leaseId:'',error:publishing?'게시 결과가 불명확합니다. Instagram에서 확인 후 처리해 주세요.':'게시 준비에 실패했습니다. 연결 상태를 확인한 후 다시 예약해 주세요.'}));
    return {processed:true, failed:true};
  }
}
