import { z } from 'zod';
export const text = z.string().max(20000).default('');
const short = z.string().max(500).default('');
const validDate = (v) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(v + 'T00:00:00Z');
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v;
};
const date = z
  .string()
  .refine((v) => !v || validDate(v), '실제로 존재하는 날짜를 입력해 주세요.')
  .default('');
const time = z
  .string()
  .refine((v) => !v || /^([01]\d|2[0-3]):[0-5]\d$/.test(v), '시간 형식을 확인해 주세요.')
  .default('');
export const activitySchema = z
  .object({
    title: z.string().trim().min(1, '활동명을 입력해 주세요.').max(200),
    category: z.enum(['봉사', '친목']).default('봉사'),
    template: short,
    grade: short,
    startDate: date,
    endDate: date,
    startTime: time,
    endTime: time,
    deadline: short,
    venueId: short,
    location: short,
    address: short,
    meetingLocation: short,
    meetingTime: time,
    transport: text,
    capacity: z.coerce.number().int().min(0).max(100000).default(0),
    hours: z.coerce.number().min(0).max(10000).default(0),
    notice: text,
    memo: text,
    description: text,
    schedule: text,
    supplies: text,
    tags: short,
    link1: short,
    link2: short,
    applicationUrl: short,
    status: z.enum(['draft', 'confirmed', 'cancelled', 'completed']).default('draft'),
    includeCommon: z.boolean().default(false),
    attachments: z.array(z.string()).max(2).default([]),
    attachmentPlacement: z.enum(['top', 'bottom', 'inline']).default('top'),
    version: z.number().int().optional(),
  })
  .superRefine((a, c) => {
    if (
      a.deadline &&
      (!/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/.test(a.deadline) ||
        !validDate(a.deadline.slice(0, 10)))
    )
      c.addIssue({ code: 'custom', message: '신청 마감일시를 확인해 주세요.', path: ['deadline'] });
    if (a.endDate && a.startDate && a.endDate < a.startDate)
      c.addIssue({
        code: 'custom',
        message: '종료일은 시작일 이후여야 합니다.',
        path: ['endDate'],
      });
    if (
      a.endTime &&
      a.startTime &&
      (!a.endDate || a.endDate === a.startDate) &&
      a.endTime <= a.startTime
    )
      c.addIssue({
        code: 'custom',
        message: '종료 시간은 시작 시간 이후여야 합니다.',
        path: ['endTime'],
      });
    for (const field of ['link1', 'link2', 'applicationUrl'])
      if (a[field] && !/^https?:\/\//i.test(a[field]))
        c.addIssue({
          code: 'custom',
          message: '링크는 http 또는 https 주소를 입력해 주세요.',
          path: [field],
        });
  });
export const venueSchema = z.object({
  name: z.string().trim().min(1).max(200),
  phone: short,
  contact: short,
  address: short,
  detailAddress: short,
  postcode: short,
  memo: text,
  status: z.enum(['미연락', '협의 중', '활동 가능', '보류', '진행 불가']).default('미연락'),
  lastContact: date,
  nextContact: date,
  conditions: text,
});
export const editableAI = [
  'title',
  'description',
  'schedule',
  'supplies',
  'notice',
  'tags',
  'transport',
];
export function publicActivity(a) {
  return {
    title: a.title,
    category: a.category,
    template: a.template,
    grade: a.grade,
    deadline: a.deadline,
    startDate: a.startDate,
    endDate: a.endDate,
    startTime: a.startTime,
    endTime: a.endTime,
    location: a.location,
    address: a.address,
    meetingLocation: a.meetingLocation,
    meetingTime: a.meetingTime,
    capacity: a.capacity,
    hours: a.hours,
    description: a.description,
    schedule: a.schedule,
    supplies: a.supplies,
    transport: a.transport,
    notice: a.notice,
    applicationUrl: a.applicationUrl,
  };
}
export function updateActivity(old, input) {
  const now = new Date().toISOString();
  const a = { ...old, ...input, version: (old?.version || 0) + 1, updatedAt: now };
  if (old?.promotion) {
    a.promotion = {
      ...old.promotion,
      stale: true,
      status: old.promotion.status === 'scheduled' ? 'paused' : old.promotion.status,
    };
  }
  if (old?.calendar) a.calendar = { ...old.calendar, stale: true };
  return a;
}
export function calendarEvent(a) {
  if (!a.startDate || !a.startTime || !a.endTime)
    throw new Error('캘린더 등록 전에 시작일과 시작·종료 시간을 입력해 주세요.');
  return {
    summary: a.title,
    location: [a.location, a.address].filter(Boolean).join(' '),
    description: [
      a.description,
      a.meetingLocation ? '집합: ' + a.meetingTime + ' ' + a.meetingLocation : '',
      a.supplies ? '준비물: ' + a.supplies : '',
      a.applicationUrl,
    ]
      .filter(Boolean)
      .join('\n\n'),
    start: { dateTime: a.startDate + 'T' + a.startTime + ':00+09:00', timeZone: 'Asia/Seoul' },
    end: {
      dateTime: (a.endDate || a.startDate) + 'T' + a.endTime + ':00+09:00',
      timeZone: 'Asia/Seoul',
    },
  };
}
export const defaults = {
  name: '바보클럽',
  intro: '',
  website: '',
  applicationUrl: '',
  color: '#155f55',
  tone: '따뜻하고 구체적인 안내. 처음 참여하는 사람도 이해하기 쉽게 작성.',
  commonNotice: '',
  exampleNotice: '',
  templateInstructions: '활동안내: 취지, 활동 내용, 이동 안내, 준비물. 활동일정: 시간별 진행 순서.',
  grades:
    '비회원,일반회원,예비땀바,땀바,땀바운영진1,땀바운영진2,땀바운영진3,땀바운영진4,총무,사무국장',
  hashtags: '#바보클럽 #봉사활동',
  aiModel: '',
  imageModel: '',
  googleClientId: '',
  calendarId: 'primary',
  mapsKey: '',
  instagramUserId: '',
  graphVersion: 'v24.0',
  r2AccountId: '',
  r2Bucket: '',
  r2AccessKeyId: '',
  aiMonthlyLimit: 100,
};
