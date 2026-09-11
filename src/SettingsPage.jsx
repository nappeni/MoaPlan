import React, { useState, useEffect } from 'react';
import { Save, Plug, CheckCircle2, ExternalLink, Download, ShieldCheck } from 'lucide-react';
import { api } from './api';
import { Button, Field } from './ui';
const groups = [
  ['general', '단체 기본 정보'],
  ['writing', '공지·홍보 기준'],
  ['ai', 'AI 설정'],
  ['instagram', '인스타그램'],
  ['google', '구글 연동'],
  ['storage', '이미지 저장소'],
];
export default function SettingsPage({ data, refresh, notify }) {
  const [tab, setTab] = useState('general'),
    [s, setS] = useState(data.settings),
    [secrets, setSecrets] = useState({}),
    [clear, setClear] = useState([]),
    [busy, setBusy] = useState(''),
    [calendars, setCalendars] = useState([]);
  const change = (k, v) => setS({ ...s, [k]: v });
  async function save() {
    setBusy('save');
    try {
      const { secrets: registrationStatus, logoId, ...settings } = s;
      const v = await api('/settings', 'PUT', { settings, secrets, clearSecrets: clear });
      setS(v);
      setSecrets({});
      setClear([]);
      await refresh();
      notify('단체 설정을 저장했습니다.');
      return true;
    } catch (e) {
      notify(e.message);
      return false;
    } finally {
      setBusy('');
    }
  }
  async function test(type) {
    setBusy(type);
    try {
      await api('/integrations/test/' + type, 'POST', {});
      notify('저장된 설정으로 연결을 확인했습니다.');
    } catch (e) {
      notify(e.message);
    } finally {
      setBusy('');
    }
  }
  const input = (k, label, hint, type = 'text') => (
    <Field
      label={label}
      hint={hint}
      type={type}
      value={s[k] ?? ''}
      onChange={(e) => change(k, e.target.value)}
    />
  );
  const area = (k, label, hint) => (
    <Field label={label} hint={hint}>
      <textarea rows={6} value={s[k] ?? ''} onChange={(e) => change(k, e.target.value)} />
    </Field>
  );
  const secret = (k, label) => (
    <Field
      label={label}
      hint={
        s.secrets?.[k] && !clear.includes(k) ? '저장됨 · 비워두면 기존 값을 유지합니다.' : '미등록'
      }
    >
      <input
        type="password"
        autoComplete="new-password"
        value={secrets[k] || ''}
        placeholder={s.secrets?.[k] ? '•••••••• (저장됨)' : '인증 정보 입력'}
        onChange={(e) => setSecrets({ ...secrets, [k]: e.target.value })}
      />
      {s.secrets?.[k] && (
        <label className="checkbox">
          <input
            type="checkbox"
            checked={clear.includes(k)}
            onChange={(e) =>
              setClear(e.target.checked ? [...clear, k] : clear.filter((x) => x !== k))
            }
          />
          저장 시 기존 키 삭제
        </label>
      )}
    </Field>
  );
  const testing = (type) => (
    <Button disabled={!!busy} busy={busy === type} onClick={() => test(type)}>
      <Plug size={16} />
      저장된 설정 연결 테스트
    </Button>
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">WORKSPACE SETTINGS</span>
          <h1>우리 단체에 맞게 설정하세요</h1>
          <p>단체 정보와 작성 기준, 외부 서비스 연결을 관리합니다.</p>
        </div>
        <Button kind="primary" busy={busy === 'save'} disabled={!!busy} onClick={save}>
          <Save size={17} />
          설정 저장
        </Button>
      </div>
      <div className="settings-layout">
        <nav className="settings-nav">
          {groups.map(([id, label]) => (
            <button className={tab === id ? 'active' : ''} key={id} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </nav>
        <section className="panel form-panel settings-content">
          <div className="section-heading">
            <h2>{groups.find((v) => v[0] === tab)[1]}</h2>
          </div>
          {tab === 'general' && (
            <div className="content-fields">
              {input('name', '단체명')}
              <Field
                label="단체 로고"
                hint="로고도 R2에 저장합니다. 저장소 설정 후 업로드해 주세요."
              >
                {s.logoId && (
                  <img
                    className="settings-logo"
                    src={'/api/logo/content?v=' + s.logoId}
                    alt="단체 로고"
                  />
                )}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  disabled={!!busy}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (file.size > 15 * 1024 * 1024)
                      return notify('15MB 이하 이미지를 선택해 주세요.');
                    setBusy('logo');
                    try {
                      const value = await new Promise((resolve, reject) => {
                        const r = new FileReader();
                        r.onload = () => resolve(r.result);
                        r.onerror = reject;
                        r.readAsDataURL(file);
                      });
                      const v = await api('/logo', 'POST', { data: value });
                      setS((s) => ({ ...s, logoId: v.logoId }));
                      await refresh();
                      notify('로고를 저장했습니다.');
                    } catch (e) {
                      notify(e.message);
                    } finally {
                      setBusy('');
                      e.target.value = '';
                    }
                  }}
                />
              </Field>
              {area('intro', '단체 소개')}
              {input('website', '공식 홈페이지 주소', undefined, 'url')}
              {input(
                'applicationUrl',
                '기본 참가 신청 URL',
                '활동별 공지 링크가 있으면 해당 링크를 우선 사용합니다.',
                'url',
              )}
              <div className="form-grid">
                {input('color', '대표 색상', undefined, 'color')}
                {input(
                  'grades',
                  '참석가능 등급',
                  '쉼표로 구분하세요. 회원 명단을 관리하는 기능은 아닙니다.',
                )}
              </div>
              <div className="reference-note">
                <ShieldCheck size={18} />
                현재 로그인한 단체의 정보만 변경합니다. 다른 단체의 데이터는 분리됩니다.
              </div>
              <a className="btn" href="/api/export" download>
                <Download size={16} />
                단체 데이터 내보내기
              </a>
            </div>
          )}
          {tab === 'writing' && (
            <div className="content-fields">
              {area('tone', '기본 문체')}
              {area('templateInstructions', '활동 양식 작성 기준')}
              {area(
                'commonNotice',
                '공통 안내문',
                '회비·규정 등 확인된 안내문을 등록하세요. 활동별 포함 여부를 선택합니다.',
              )}
              {area(
                'exampleNotice',
                '작성 참고 공지',
                '문체와 구성 참고용입니다. 날짜·금액·계좌를 새 활동에 자동 복사하지 않습니다.',
              )}
              {input('hashtags', '기본 해시태그')}
            </div>
          )}
          {tab === 'ai' && (
            <div className="content-fields">
              <p className="helper">
                첫 연동은 OpenAI API를 사용합니다. 이용 가능한 모델 ID를 직접 지정하며, 요청할 때
                해당 계정의 API 사용료가 발생합니다.
              </p>
              {secret('aiKey', 'AI API 키')}
              {input('aiModel', '텍스트 모델 ID', 'Responses API와 JSON 출력을 지원하는 모델')}
              {input(
                'imageModel',
                '이미지 모델 ID',
                'Images API에서 Base64 이미지를 반환하는 모델',
              )}
              {input(
                'aiMonthlyLimit',
                '월 AI 요청 한도',
                '비용 상한이 아닌 요청 횟수 제한입니다. 실패한 요청도 포함합니다.',
                'number',
              )}
              <div className="reference-note">
                이번 달 요청: {data.usage[new Date().toISOString().slice(0, 7)] || 0}회
              </div>
              {testing('ai')}
            </div>
          )}
          {tab === 'instagram' && (
            <div className="content-fields">
              <p className="helper">
                Instagram Login 방식의 게시 권한이 있는 프로페셔널 계정 토큰을 설정합니다. 실제 게시
                전 계정 권한·토큰 유효기간과 Meta 앱 설정을 확인해야 합니다.
              </p>
              {input('instagramUserId', 'Instagram 사용자 ID')}
              {secret('instagramToken', '게시용 액세스 토큰')}
              {input('graphVersion', 'Graph API 버전')}
              {testing('instagram')}
              <div className="reference-note">
                이미지와 캡션을 검토하고 즉시·예약 게시를 선택합니다. 게시 결과가 불명확하면 자동
                재시도하지 않습니다.
              </div>
            </div>
          )}
          {tab === 'google' && (
            <div className="content-fields">
              {input('googleClientId', 'Google OAuth 클라이언트 ID')}
              {secret('googleClientSecret', 'Google OAuth 클라이언트 비밀 키')}
              <div className="reference-note">
                승인된 리디렉션 URI
                <br />
                <code>{location.origin}/api/google/callback</code>
              </div>
              <div className="inline wrap">
                <Button
                  disabled={!!busy}
                  onClick={async () => {
                    if (!(await save())) return;
                    try {
                      const v = await api('/google/connect', 'POST', {});
                      location.assign(v.url);
                    } catch (e) {
                      notify(e.message);
                    }
                  }}
                >
                  <ExternalLink size={16} />
                  {s.secrets?.googleRefreshToken ? 'Google 계정 다시 연결' : 'Google 계정 연결'}
                </Button>
                {s.secrets?.googleRefreshToken && (
                  <Button
                    onClick={async () => {
                      try {
                        await api('/google/disconnect', 'POST', {});
                        const d = await refresh();
                        setS(d.settings);
                        notify('연결을 해제했습니다.');
                      } catch (e) {
                        notify(e.message);
                      }
                    }}
                  >
                    연결 해제
                  </Button>
                )}
              </div>
              {s.secrets?.googleRefreshToken && (
                <span className="connected">
                  <CheckCircle2 size={16} />
                  Google 계정 연결됨
                </span>
              )}
              <div className="input-action">
                {input('calendarId', '기본 캘린더 ID', '개인 기본 캘린더는 primary')}
                <Button
                  onClick={async () => {
                    try {
                      setCalendars(await api('/google/calendars'));
                    } catch (e) {
                      notify(e.message);
                    }
                  }}
                >
                  목록 불러오기
                </Button>
              </div>
              {calendars.length > 0 && (
                <Field label="등록할 캘린더 선택">
                  <select
                    value={s.calendarId}
                    onChange={(e) => change('calendarId', e.target.value)}
                  >
                    <option value="primary">기본 캘린더</option>
                    {calendars.map((c) => (
                      <option value={c.id} key={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              {input(
                'mapsKey',
                'Google Maps Embed API 키',
                '브라우저에 노출되는 키입니다. 서비스 도메인과 Maps Embed API로 사용 범위를 제한하세요.',
              )}
              {testing('google')}
            </div>
          )}
          {tab === 'storage' && (
            <div className="content-fields">
              <div className="storage-brand">
                Cloudflare <strong>R2</strong>
                <span>이미지 저장소</span>
              </div>
              {input('r2AccountId', 'Cloudflare 계정 ID')}
              {input('r2Bucket', '버킷 이름')}
              {input('r2AccessKeyId', 'Access Key ID')}
              {secret('r2SecretAccessKey', 'Secret Access Key')}
              {testing('r2')}
              <div className="reference-note">
                게시용 JPEG는 가독성을 유지하며 500KB 이하를 목표로 최적화합니다. 미리보기 WebP는
                별도로 생성합니다. 비공개 버킷을 사용하고 게시 시에만 유효한 서명 URL을 발급합니다.
              </div>
              <p className="helper">
                저장된 게시·배경 이미지:{' '}
                {data.activities.reduce((n, a) => n + (a.assets?.length || 0), 0)}개 · JPEG 합계{' '}
                {(
                  data.activities.flatMap((a) => a.assets || []).reduce((n, a) => n + a.bytes, 0) /
                  1024 /
                  1024
                ).toFixed(2)}
                MB
                <br />
                썸네일·삭제된 활동의 파일 등은 합계에서 제외됩니다. 실제 사용량은 R2에서 확인하세요.
              </p>
            </div>
          )}
          <div className="form-footer">
            <small>비밀 키는 암호화해 저장하며 전체 값을 다시 표시하지 않습니다.</small>
          </div>
        </section>
      </div>
    </>
  );
}
