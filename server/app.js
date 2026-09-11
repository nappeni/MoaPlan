import express from 'express';
import helmet from 'helmet';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { Store } from './store.js';
import {
  token,
  hash,
  passwordHash,
  checkPassword,
  encryptionKey,
  encrypt,
  secretFields,
  settingsView,
} from './security.js';
import { defaults, activitySchema, venueSchema, editableAI, updateActivity } from './domain.js';
import * as integration from './integrations.js';

export async function createApp({
  production = process.env.NODE_ENV === 'production',
  appUrl = (process.env.APP_URL || 'http://localhost:5173').replace(/\/$/, ''),
  store = new Store(),
  initializeStore = true,
} = {}) {
  if (
    production &&
    (!process.env.DATABASE_URL || !process.env.SETUP_TOKEN || !appUrl.startsWith('https://'))
  )
    throw new Error('Production requires DATABASE_URL, SETUP_TOKEN and HTTPS APP_URL');
  if (initializeStore) await store.init();
  const key = await encryptionKey(store.dir);
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
  app.use(express.json({ limit: '24mb' }));
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!['GET', 'HEAD'].includes(req.method) && req.headers.origin !== appUrl)
      return res.status(403).json({ error: '다른 출처에서 보낸 요청입니다.' });
    next();
  });
  const fail = (message, status = 400) => Object.assign(new Error(message), { status });
  const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
  const sessionHash = (req) => {
    const raw = (req.headers.cookie || '')
      .split(';')
      .map((v) => v.trim())
      .find((v) => v.startsWith('moaplan='));
    return raw ? hash(raw.slice(8)) : '';
  };
  function setCookie(res, value) {
    res.setHeader(
      'Set-Cookie',
      'moaplan=' +
        value +
        '; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800' +
        (production ? '; Secure' : ''),
    );
  }
  async function createSession(userId, res) {
    const v = token();
    await store.transact((s) => {
      s.sessions = s.sessions.filter((v) => v.expires > Date.now());
      s.sessions.push({ hash: hash(v), userId, expires: Date.now() + 7 * 86400000 });
    });
    setCookie(res, v);
  }
  const attempts = new Map();
  function rate(req, res, next) {
    const k = req.ip;
    const now = Date.now();
    for (const [id, v] of attempts) if (v.until < now) attempts.delete(id);
    const v = attempts.get(k) || { count: 0, until: now + 900000 };
    if (++v.count > 30)
      return res.status(429).json({ error: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' });
    attempts.set(k, v);
    next();
  }
  app.get(
    '/api/health',
    wrap(async (req, res) => {
      await store.read((s) => s.version);
      res.json({ ok: true });
    }),
  );
  app.get(
    '/api/session',
    wrap(async (req, res) => {
      res.json(
        await store.read((s) => {
          const session = s.sessions.find(
            (v) => v.hash === sessionHash(req) && v.expires > Date.now(),
          );
          const u = s.users.find((v) => v.id === session?.userId);
          return {
            user: u ? { id: u.id, email: u.email, name: u.name, orgId: u.orgId } : null,
            setupRequired: s.users.length === 0,
            localMode: !process.env.DATABASE_URL,
            setupTokenRequired: production || !!process.env.SETUP_TOKEN,
          };
        }),
      );
    }),
  );
  app.post(
    '/api/setup',
    rate,
    wrap(async (req, res) => {
      const data = z
        .object({
          name: z.string().min(1).max(100),
          organization: z.string().min(1).max(100),
          email: z.email().max(200),
          password: z.string().min(12).max(128),
          setupToken: z.string().optional(),
        })
        .parse(req.body);
      if (process.env.SETUP_TOKEN && data.setupToken !== process.env.SETUP_TOKEN)
        throw fail('초기 설정 코드가 올바르지 않습니다.', 403);
      const password = passwordHash(data.password);
      const user = await store.transact((s) => {
        if (s.users.length && !process.env.SETUP_TOKEN)
          throw fail('이미 초기 설정이 완료되었습니다.', 409);
        if (s.users.some((u) => u.email === data.email.toLowerCase()))
          throw fail('이미 등록된 이메일입니다.', 409);
        const org = {
          id: randomUUID(),
          settings: { ...defaults, name: data.organization, hashtags: '#봉사활동' },
          secrets: {},
          activities: [],
          venues: [],
          usage: {},
        };
        const user = {
          id: randomUUID(),
          orgId: org.id,
          name: data.name,
          email: data.email.toLowerCase(),
          password,
        };
        s.organizations.push(org);
        s.users.push(user);
        return user;
      });
      await createSession(user.id, res);
      res.status(201).json({ ok: true });
    }),
  );
  app.post(
    '/api/login',
    rate,
    wrap(async (req, res) => {
      const data = z.object({ email: z.email(), password: z.string().max(128) }).parse(req.body);
      const user = await store.read((s) =>
        s.users.find((u) => u.email === data.email.toLowerCase()),
      );
      if (!user || !checkPassword(data.password, user.password))
        throw fail('이메일 또는 비밀번호를 확인해 주세요.', 401);
      await createSession(user.id, res);
      res.json({ ok: true });
    }),
  );
  app.use(
    '/api',
    wrap(async (req, res, next) => {
      req.user = await store.read((s) => {
        const ss = s.sessions.find((v) => v.hash === sessionHash(req) && v.expires > Date.now());
        return s.users.find((u) => u.id === ss?.userId);
      });
      if (!req.user) throw fail('로그인이 필요합니다.', 401);
      next();
    }),
  );
  const orgRead = (req, fn) =>
    store.read((s) => fn(s.organizations.find((o) => o.id === req.user.orgId)));
  const orgWrite = (req, fn) =>
    store.transact((s) => fn(s.organizations.find((o) => o.id === req.user.orgId)));
  function activity(o, id) {
    const a = o.activities.find((a) => a.id === id);
    if (!a) throw fail('활동을 찾을 수 없습니다.', 404);
    return a;
  }
  function editable(a) {
    if (a.promotion?.status === 'attention')
      throw fail('먼저 Instagram 게시 여부를 확인해 결과를 기록해 주세요.', 409);
    if (a.promotion?.status === 'processing')
      throw fail('게시 처리 중입니다. 결과 확인 후 수정해 주세요.', 409);
  }
  app.post(
    '/api/logout',
    wrap(async (req, res) => {
      await store.transact((s) => {
        s.sessions = s.sessions.filter((v) => v.hash !== sessionHash(req));
      });
      res.setHeader(
        'Set-Cookie',
        'moaplan=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0' + (production ? '; Secure' : ''),
      );
      res.json({ ok: true });
    }),
  );
  app.get(
    '/api/data',
    wrap(async (req, res) =>
      res.json(
        await orgRead(req, (o) => ({
          settings: settingsView(o),
          activities: o.activities,
          venues: o.venues,
          usage: o.usage,
        })),
      ),
    ),
  );
  app.put(
    '/api/settings',
    wrap(async (req, res) => {
      const body = z
        .object({
          settings: z.preprocess(
            (value) => {
              if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
              const { secrets, logoId, ...settings } = value;
              return settings;
            },
            z.record(z.string(), z.union([z.string().max(20000), z.number()])),
          ),
          secrets: z.record(z.string(), z.string().max(10000)).optional(),
          clearSecrets: z.array(z.string()).optional(),
        })
        .parse(req.body);
      res.json(
        await orgWrite(req, (o) => {
          for (const k of Object.keys(defaults))
            if (k in body.settings) {
              if (typeof body.settings[k] !== typeof defaults[k] && k !== 'aiMonthlyLimit')
                throw fail('설정 값의 형식을 확인해 주세요.');
              o.settings[k] = body.settings[k];
            }
          if (typeof o.settings.name !== 'string' || !o.settings.name.trim())
            throw fail('단체명을 입력해 주세요.');
          if (!/^#[0-9a-f]{6}$/i.test(o.settings.color)) throw fail('대표 색상을 확인해 주세요.');
          o.settings.aiMonthlyLimit = z.coerce
            .number()
            .int()
            .min(1)
            .max(100000)
            .parse(o.settings.aiMonthlyLimit);
          for (const k of secretFields)
            if (k !== 'googleRefreshToken' && body.secrets?.[k])
              o.secrets[k] = encrypt(body.secrets[k], key);
          for (const k of body.clearSecrets || [])
            if (secretFields.includes(k)) delete o.secrets[k];
          return settingsView(o);
        }),
      );
    }),
  );
  app.post(
    '/api/logo',
    wrap(async (req, res) => {
      const data = z.string().max(23000000).parse(req.body.data);
      if (!/^data:image\/(png|jpeg|webp);base64,/.test(data))
        throw fail('PNG, JPEG, WebP 이미지만 업로드해 주세요.');
      const o = await orgRead(req, (o) => o);
      const logo = await integration.uploadImage(
        integration.credentials(o, key),
        o.id,
        'branding',
        Buffer.from(data.split(',')[1], 'base64'),
      );
      await orgWrite(req, (o) => {
        o.logo = logo;
      });
      res.json({ logoId: logo.id });
    }),
  );
  app.get(
    '/api/logo/content',
    wrap(async (req, res) => {
      const o = await orgRead(req, (o) => o);
      if (!o.logo) throw fail('로고가 없습니다.', 404);
      const u = await integration.imageUrl(integration.credentials(o, key), o.logo.key);
      const r = await fetch(u, { signal: AbortSignal.timeout(30000) });
      if (!r.ok) throw fail('로고를 불러오지 못했습니다.', 502);
      res.type('image/jpeg').send(Buffer.from(await r.arrayBuffer()));
    }),
  );
  app.get(
    '/api/export',
    wrap(async (req, res) => {
      res.setHeader('Content-Disposition', 'attachment; filename="moaplan-export.json"');
      res.json(
        await orgRead(req, (o) => ({
          exportedAt: new Date().toISOString(),
          settings: o.settings,
          activities: o.activities,
          venues: o.venues,
        })),
      );
    }),
  );
  app.post(
    '/api/venues',
    wrap(async (req, res) => {
      const data = venueSchema.parse(req.body);
      res.status(201).json(
        await orgWrite(req, (o) => {
          const venue = { ...data, id: randomUUID(), updatedAt: new Date().toISOString() };
          o.venues.push(venue);
          return venue;
        }),
      );
    }),
  );
  app.put(
    '/api/venues/:id',
    wrap(async (req, res) => {
      const data = venueSchema.parse(req.body);
      res.json(
        await orgWrite(req, (o) => {
          const v = o.venues.find((v) => v.id === req.params.id);
          if (!v) throw fail('후보지를 찾을 수 없습니다.', 404);
          Object.assign(v, data, { updatedAt: new Date().toISOString() });
          return v;
        }),
      );
    }),
  );
  app.delete(
    '/api/venues/:id',
    wrap(async (req, res) => {
      await orgWrite(req, (o) => {
        if (o.activities.some((a) => a.venueId === req.params.id))
          throw fail('활동에 연결된 후보지는 삭제할 수 없습니다.');
        o.venues = o.venues.filter((v) => v.id !== req.params.id);
      });
      res.json({ ok: true });
    }),
  );
  app.post(
    '/api/activities',
    wrap(async (req, res) => {
      const data = activitySchema.parse(req.body);
      res.status(201).json(
        await orgWrite(req, (o) => {
          if (data.attachments.length) throw fail('활동 저장 후 이미지를 첨부해 주세요.');
          const a = {
            ...data,
            id: randomUUID(),
            version: 1,
            assets: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          o.activities.push(a);
          return a;
        }),
      );
    }),
  );
  app.put(
    '/api/activities/:id',
    wrap(async (req, res) => {
      const data = activitySchema.parse(req.body);
      res.json(
        await orgWrite(req, (o) => {
          const a = activity(o, req.params.id);
          editable(a);
          if (data.attachments.some((id) => !a.assets.some((asset) => asset.id === id)))
            throw fail('첨부 이미지를 찾을 수 없습니다.');
          if (data.version !== a.version)
            throw fail('다른 화면에서 수정되었습니다. 새로고침 후 다시 저장해 주세요.', 409);
          const updated = updateActivity(a, data);
          Object.assign(a, updated);
          return a;
        }),
      );
    }),
  );
  app.delete(
    '/api/activities/:id',
    wrap(async (req, res) => {
      await orgWrite(req, (o) => {
        const a = activity(o, req.params.id);
        editable(a);
        if (a.calendar?.eventId) throw fail('연결된 구글 캘린더 일정을 먼저 삭제해 주세요.');
        o.activities = o.activities.filter((v) => v.id !== a.id);
      });
      res.json({ ok: true });
    }),
  );
  async function reserveAI(req) {
    return orgWrite(req, (o) => {
      const month = new Date().toISOString().slice(0, 7);
      const used = o.usage[month] || 0;
      if (used >= o.settings.aiMonthlyLimit) throw fail('이번 달 AI 요청 한도에 도달했습니다.');
      if (!o.secrets.aiKey) throw fail('관리 메뉴에서 AI 키를 먼저 설정해 주세요.');
      o.usage[month] = used + 1;
      return integration.credentials(o, key);
    });
  }
  app.post(
    '/api/activities/:id/ai',
    wrap(async (req, res) => {
      const field = z.enum(['all', ...editableAI, 'promotion']).parse(req.body.field || 'all');
      const a = await orgRead(req, (o) => activity(o, req.params.id));
      const s = await reserveAI(req);
      const result = await integration.aiText(s, a, field, field === 'promotion');
      res.json({ suggestion: result, sourceVersion: a.version });
    }),
  );
  const slideSchema = z.object({
    title: z.string().max(100),
    body: z.string().max(400),
    visual: z.string().max(2000).default(''),
    backgroundId: z.string().optional(),
  });
  app.put(
    '/api/activities/:id/promotion',
    wrap(async (req, res) => {
      const data = z
        .object({
          caption: z.string().max(2200),
          hashtags: z.string().max(1000),
          slides: z.array(slideSchema).min(1).max(8),
          assetIds: z.array(z.string()).max(8),
          sourceVersion: z.number().int(),
        })
        .parse(req.body);
      if ((data.caption + '\n\n' + data.hashtags).length > 2200)
        throw fail('캡션과 해시태그를 합쳐 2,200자 이내로 작성해 주세요.');
      res.json(
        await orgWrite(req, (o) => {
          const a = activity(o, req.params.id);
          editable(a);
          if (a.promotion?.status === 'published')
            throw fail('이미 게시된 홍보물입니다. 새 홍보 만들기를 선택해 주세요.', 409);
          if (data.sourceVersion !== a.version)
            throw fail('기획안이 변경되었습니다. 최신 내용으로 홍보물을 검토해 주세요.', 409);
          const assets = data.assetIds.map((id) => {
            const v = a.assets.find((v) => v.id === id);
            if (!v) throw fail('이미지를 찾을 수 없습니다.');
            return v;
          });
          for (const slide of data.slides)
            if (slide.backgroundId && !a.assets.some((v) => v.id === slide.backgroundId))
              throw fail('배경 이미지를 찾을 수 없습니다.');
          a.promotion = {
            ...data,
            assets,
            status: 'draft',
            stale: false,
            updatedAt: new Date().toISOString(),
          };
          return a;
        }),
      );
    }),
  );
  app.post(
    '/api/activities/:id/assets',
    wrap(async (req, res) => {
      const data = z.object({ data: z.string().max(23000000) }).parse(req.body);
      if (!/^data:image\/(png|jpeg|webp);base64,/.test(data.data))
        throw fail('PNG, JPEG, WebP 이미지만 업로드할 수 있습니다.');
      const o = await orgRead(req, (o) => o);
      activity(o, req.params.id);
      const asset = await integration.uploadImage(
        integration.credentials(o, key),
        o.id,
        req.params.id,
        Buffer.from(data.data.split(',')[1], 'base64'),
      );
      await orgWrite(req, (o) => activity(o, req.params.id).assets.push(asset));
      res.json(asset);
    }),
  );
  app.post(
    '/api/activities/:id/background',
    wrap(async (req, res) => {
      const prompt = z.string().min(1).max(3000).parse(req.body.prompt);
      const o = await orgRead(req, (o) => o);
      activity(o, req.params.id);
      const s = await reserveAI(req);
      integration.r2(s);
      const buffer = await integration.aiImage(s, prompt);
      const asset = await integration.uploadImage(s, o.id, req.params.id, buffer);
      await orgWrite(req, (o) => activity(o, req.params.id).assets.push(asset));
      res.json(asset);
    }),
  );
  app.get(
    '/api/activities/:id/assets/:assetId/content',
    wrap(async (req, res) => {
      const o = await orgRead(req, (o) => o);
      const asset = activity(o, req.params.id).assets.find((a) => a.id === req.params.assetId);
      if (!asset) throw fail('이미지를 찾을 수 없습니다.', 404);
      const url = await integration.imageUrl(integration.credentials(o, key), asset.key);
      const upstream = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (!upstream.ok) throw fail('저장된 이미지를 읽지 못했습니다.', 502);
      res.type('image/jpeg').send(Buffer.from(await upstream.arrayBuffer()));
    }),
  );
  app.get(
    '/api/activities/:id/assets/:assetId',
    wrap(async (req, res) => {
      const o = await orgRead(req, (o) => o);
      const asset = activity(o, req.params.id).assets.find((a) => a.id === req.params.assetId);
      if (!asset) throw fail('이미지를 찾을 수 없습니다.', 404);
      res.json({
        url: await integration.imageUrl(
          integration.credentials(o, key),
          req.query.thumb === '1' ? asset.thumbKey : asset.key,
        ),
      });
    }),
  );
  app.post(
    '/api/integrations/test/:type',
    wrap(async (req, res) => {
      const s = await orgRead(req, (o) => integration.credentials(o, key));
      if (req.params.type === 'r2') await integration.testR2(s);
      else if (req.params.type === 'instagram')
        await integration.ig(s, s.instagramUserId + '?fields=id,username');
      else if (req.params.type === 'google') await integration.calendars(s);
      else if (req.params.type === 'ai') {
        if (!s.aiKey) throw fail('AI 키를 설정해 주세요.');
        await integration.jsonFetch('https://api.openai.com/v1/models', {
          headers: { Authorization: 'Bearer ' + s.aiKey },
        });
      } else throw fail('지원하지 않는 연동입니다.');
      res.json({ ok: true });
    }),
  );
  app.post(
    '/api/google/connect',
    wrap(async (req, res) => {
      const state = token();
      const s = await orgRead(req, (o) => integration.credentials(o, key));
      const url = integration.googleAuthUrl(s, state, appUrl);
      await store.transact((db) => {
        db.oauth = db.oauth.filter((x) => x.expires > Date.now());
        db.oauth.push({
          state: hash(state),
          userId: req.user.id,
          orgId: req.user.orgId,
          expires: Date.now() + 600000,
        });
      });
      res.json({ url });
    }),
  );
  app.get(
    '/api/google/callback',
    wrap(async (req, res) => {
      const oauth = await store.transact((s) => {
        const record = s.oauth.find(
          (x) =>
            x.state === hash(String(req.query.state || '')) &&
            x.userId === req.user.id &&
            x.expires > Date.now(),
        );
        if (!record) throw fail('Google 연결 요청이 만료되었습니다.', 403);
        s.oauth = s.oauth.filter((x) => x !== record);
        return record;
      });
      if (req.query.error) return res.redirect('/?google=denied');
      const s = await orgRead(req, (o) => integration.credentials(o, key));
      const data = await integration.googleExchange(s, {
        code: String(req.query.code || ''),
        redirect_uri: appUrl + '/api/google/callback',
        grant_type: 'authorization_code',
      });
      if (!data.refresh_token) throw fail('Google 연결에 필요한 갱신 토큰을 받지 못했습니다.');
      await orgWrite(req, (o) => {
        o.secrets.googleRefreshToken = encrypt(data.refresh_token, key);
      });
      res.redirect('/?google=connected');
    }),
  );
  app.get(
    '/api/google/calendars',
    wrap(async (req, res) =>
      res.json(
        await integration.calendars(await orgRead(req, (o) => integration.credentials(o, key))),
      ),
    ),
  );
  app.post(
    '/api/google/disconnect',
    wrap(async (req, res) => {
      await orgWrite(req, (o) => {
        delete o.secrets.googleRefreshToken;
      });
      res.json({ ok: true });
    }),
  );
  app.post(
    '/api/activities/:id/calendar',
    wrap(async (req, res) => {
      const o = await orgRead(req, (o) => o);
      const a = activity(o, req.params.id);
      if (a.status === 'cancelled') throw fail('취소된 활동입니다.');
      const calendarId = a.calendar?.calendarId || o.settings.calendarId || 'primary';
      const id = hash(o.id + a.id).slice(0, 40);
      const result = await integration.saveCalendar(integration.credentials(o, key), a, id);
      res.json(
        await orgWrite(req, (o) => {
          const current = activity(o, a.id);
          current.calendar = {
            eventId: result.id,
            url: result.htmlLink,
            calendarId,
            sourceVersion: a.version,
            stale: current.version !== a.version,
          };
          return current;
        }),
      );
    }),
  );
  app.delete(
    '/api/activities/:id/calendar',
    wrap(async (req, res) => {
      const o = await orgRead(req, (o) => o);
      const a = activity(o, req.params.id);
      await integration.deleteCalendar(integration.credentials(o, key), a);
      await orgWrite(req, (o) => {
        delete activity(o, a.id).calendar;
      });
      res.json({ ok: true });
    }),
  );
  app.post(
    '/api/activities/:id/publish',
    wrap(async (req, res) => {
      res.json(
        await orgWrite(req, (o) => {
          const a = activity(o, req.params.id);
          editable(a);
          const p = a.promotion;
          if (a.status !== 'confirmed') throw fail('활동 기획을 확정한 뒤 게시해 주세요.');
          if (
            !p ||
            p.stale ||
            !p.assets.length ||
            p.assets.length > 8 ||
            p.assets.length !== p.slides.length
          )
            throw fail('최신 홍보물과 1~8장의 게시용 이미지를 저장해 주세요.');
          if (['published', 'scheduled', 'attention'].includes(p.status))
            throw fail('이미 게시되었거나 예약 또는 결과 확인이 필요한 홍보물입니다.');
          const s = integration.credentials(o, key);
          if (!s.instagramToken || !s.instagramUserId)
            throw fail('인스타그램 계정을 먼저 설정해 주세요.');
          const at = req.body.scheduledAt ? new Date(req.body.scheduledAt) : new Date();
          if (!Number.isFinite(at.getTime()) || (req.body.scheduledAt && at.getTime() < Date.now()))
            throw fail('미래의 예약 시간을 선택해 주세요.');
          p.status = 'scheduled';
          p.scheduledAt = at.toISOString();
          p.targetInstagramId = s.instagramUserId;
          p.jobId = randomUUID();
          return a;
        }),
      );
    }),
  );
  app.post(
    '/api/activities/:id/resolve-publish',
    wrap(async (req, res) => {
      const data = z.object({ published: z.boolean() }).parse(req.body);
      res.json(
        await orgWrite(req, (o) => {
          const a = activity(o, req.params.id);
          const p = a.promotion;
          if (p?.status !== 'attention') throw fail('게시 결과 확인이 필요한 상태가 아닙니다.');
          p.status = data.published ? 'published' : 'failed';
          p.error = data.published ? '' : '운영자가 미게시 상태를 확인했습니다.';
          p.resolvedAt = new Date().toISOString();
          return a;
        }),
      );
    }),
  );
  app.post(
    '/api/activities/:id/new-promotion',
    wrap(async (req, res) => {
      res.json(
        await orgWrite(req, (o) => {
          const a = activity(o, req.params.id);
          editable(a);
          if (a.promotion?.status === 'scheduled') throw fail('예약을 먼저 취소해 주세요.');
          if (a.promotion) {
            a.promotionHistory = [...(a.promotionHistory || []), a.promotion];
            delete a.promotion;
          }
          return a;
        }),
      );
    }),
  );
  app.post(
    '/api/activities/:id/unpublish',
    wrap(async (req, res) => {
      res.json(
        await orgWrite(req, (o) => {
          const a = activity(o, req.params.id);
          editable(a);
          if (a.promotion?.status === 'published' || a.promotion?.status === 'attention')
            throw fail('이미 게시되었거나 결과 확인이 필요한 상태입니다.');
          if (a.promotion) a.promotion.status = 'draft';
          return a;
        }),
      );
    }),
  );
  let workerBusy = false;
  async function work() {
    if (workerBusy) return;
    workerBusy = true;
    try {
      const task = await store.transact((s) => {
        for (const o of s.organizations)
          for (const a of o.activities) {
            const p = a.promotion;
            if (p?.status === 'processing' && Date.now() - Date.parse(p.startedAt) > 10 * 60000) {
              p.status = 'attention';
              p.error = '처리가 중단되었습니다. Instagram에서 게시 여부를 확인해 주세요.';
            }
            if (p?.status === 'scheduled' && Date.parse(p.scheduledAt) <= Date.now()) {
              if (p.stale || a.status !== 'confirmed') {
                p.status = 'paused';
                continue;
              }
              p.status = 'processing';
              p.stage = 'preparing';
              p.startedAt = new Date().toISOString();
              return { org: o, a };
            }
          }
        return null;
      });
      if (!task) return;
      let publishing = false;
      try {
        const s = integration.credentials(task.org, key);
        if (s.instagramUserId !== task.a.promotion.targetInstagramId)
          throw fail('예약 후 게시 계정이 변경되었습니다.');
        const result = await integration.publishInstagram(
          s,
          task.a.promotion,
          async (container) => {
            await store.transact((db) => {
              const p = activity(
                db.organizations.find((o) => o.id === task.org.id),
                task.a.id,
              ).promotion;
              p.stage = 'publishing';
              p.containerId = container;
            });
            publishing = true;
          },
        );
        await store.transact((db) => {
          const p = activity(
            db.organizations.find((o) => o.id === task.org.id),
            task.a.id,
          ).promotion;
          Object.assign(p, result, { status: 'published', publishedAt: new Date().toISOString() });
        });
      } catch (e) {
        await store.transact((db) => {
          const p = activity(
            db.organizations.find((o) => o.id === task.org.id),
            task.a.id,
          ).promotion;
          p.status = publishing ? 'attention' : 'failed';
          p.error = publishing
            ? '게시 결과가 불명확합니다. Instagram에서 확인 후 처리해 주세요.'
            : e.message;
        });
      }
    } catch (e) {
      console.error('Worker error:', e.message);
    } finally {
      workerBusy = false;
    }
  }
  app.use('/api', (req, res) => res.status(404).json({ error: '지원하지 않는 요청입니다.' }));
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    const status = err instanceof z.ZodError ? 400 : err.status || 500;
    res.status(status).json({
      error:
        err instanceof z.ZodError
          ? err.issues.map((v) => v.message).join(' / ')
          : status === 500
            ? '처리 중 오류가 발생했습니다. 서버 설정과 입력 내용을 확인해 주세요.'
            : err.message,
    });
    if (status === 500) console.error(err.message);
  });

  return { app, store, work };
}
