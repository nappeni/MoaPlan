export async function api(path, method = 'GET', body) {
  const r = await fetch('/api' + path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let data;
  try {
    data = await r.json();
  } catch {
    throw new Error('서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.');
  }
  if (!r.ok) throw new Error(data.error || '요청에 실패했습니다.');
  return data;
}
export const dateLabel = (v) =>
  v
    ? new Date(v + 'T12:00:00').toLocaleDateString('ko-KR', {
        month: 'long',
        day: 'numeric',
        weekday: 'short',
      })
    : '일정 미정';
export const statusLabels = {
  draft: '기획 중',
  confirmed: '기획 확정',
  cancelled: '취소',
  completed: '활동 완료',
  scheduled: '게시 예약',
  processing: '게시 중',
  published: '게시 완료',
  failed: '게시 실패',
  paused: '수정 필요',
  attention: '결과 확인 필요',
};
export const newActivity = () => ({
  title: '',
  category: '봉사',
  template: '봉사활동',
  grade: '일반회원',
  startDate: '',
  endDate: '',
  startTime: '',
  endTime: '',
  deadline: '',
  venueId: '',
  location: '',
  address: '',
  meetingLocation: '',
  meetingTime: '',
  transport: '',
  capacity: 0,
  hours: 0,
  notice: '',
  memo: '',
  description: '',
  schedule: '',
  supplies: '',
  tags: '',
  link1: '',
  link2: '',
  applicationUrl: '',
  status: 'draft',
  includeCommon: false,
  attachments: [],
  attachmentPlacement: 'top',
});
export const newVenue = () => ({
  name: '',
  phone: '',
  contact: '',
  address: '',
  detailAddress: '',
  postcode: '',
  memo: '',
  status: '미연락',
  lastContact: '',
  nextContact: '',
  conditions: '',
});
let postcodeLoading;
export function searchAddress() {
  if (!postcodeLoading)
    postcodeLoading = new Promise((resolve, reject) => {
      if (window.daum?.Postcode) return resolve();
      const s = document.createElement('script');
      s.src = 'https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';
      s.onload = resolve;
      s.onerror = () => {
        postcodeLoading = null;
        reject(new Error('주소 검색을 불러오지 못했습니다.'));
      };
      document.head.append(s);
    });
  return postcodeLoading.then(
    () =>
      new Promise((resolve) =>
        new window.daum.Postcode({
          oncomplete: (d) =>
            resolve({ address: d.roadAddress || d.autoRoadAddress || '', postcode: d.zonecode }),
          onclose: (state) => {
            if (state !== 'COMPLETE_CLOSE') resolve(null);
          },
        }).open(),
      ),
  );
}
