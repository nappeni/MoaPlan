import React, { useState } from 'react';
import {
  ArrowLeft,
  Sparkles,
  Save,
  Copy,
  CalendarPlus,
  Eye,
  Instagram,
  MapPin,
  Upload,
} from 'lucide-react';
import { api, newActivity, statusLabels, searchAddress } from './api';
import { Button, Field, Badge, Modal } from './ui';
import PromotionEditor from './PromotionEditor';
const contentFields = [
  ['description', '활동안내'],
  ['schedule', '활동일정'],
  ['supplies', '준비물'],
  ['transport', '이동·주차 안내'],
  ['notice', '알림 문구'],
  ['tags', '태그'],
];
const aiNames = { title: '활동명', ...Object.fromEntries(contentFields) };
function escapeHtml(s) {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
}
function htmlText(s) {
  return escapeHtml(s)
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');
}
export default function ActivityEditor({ initial, data, notify, refresh, onSaved, onBack }) {
  const [a, setA] = useState(initial),
    [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(''),
    [tab, setTab] = useState('plan'),
    [preview, setPreview] = useState(false),
    [suggestion, setSuggestion] = useState(null),
    [selectedFields, setSelectedFields] = useState([]),
    [protectedFields, setProtectedFields] = useState([]);
  const change = (k, v) => {
    setA((a) => ({ ...a, [k]: v }));
    setDirty(true);
    if (k in aiNames) setProtectedFields((p) => [...new Set([...p, k])]);
  };
  async function save() {
    setBusy('save');
    try {
      const result = await api('/activities' + (a.id ? '/' + a.id : ''), a.id ? 'PUT' : 'POST', a);
      setA(result);
      setDirty(false);
      await refresh();
      onSaved(result);
      notify('기획안을 저장했습니다.');
      return result;
    } catch (e) {
      notify(e.message);
    } finally {
      setBusy('');
    }
  }
  async function generate(field) {
    setBusy(field);
    try {
      const result = await api('/activities/' + a.id + '/ai', 'POST', { field });
      const values = Object.fromEntries(
        Object.entries(result.suggestion).filter(
          ([k, v]) => k in aiNames && typeof v === 'string' && (field === 'all' || field === k),
        ),
      );
      setSuggestion(values);
      setSelectedFields(Object.keys(values).filter((k) => !protectedFields.includes(k)));
    } catch (e) {
      notify(e.message);
    } finally {
      setBusy('');
    }
  }
  async function calendar(remove = false) {
    if (remove && !confirm('구글 캘린더에서 연결된 일정을 삭제할까요?')) return;
    setBusy('calendar');
    try {
      const result = await api('/activities/' + a.id + '/calendar', remove ? 'DELETE' : 'POST', {});
      const d = await refresh();
      const updated = d.activities.find((x) => x.id === a.id);
      setA(updated);
      onSaved(updated);
      notify(remove ? '캘린더 일정을 삭제했습니다.' : '구글 캘린더에 반영했습니다.');
    } catch (e) {
      notify(e.message);
    } finally {
      setBusy('');
    }
  }
  async function copyNotice() {
    const blocks = [
      ['활동안내', a.description],
      ['이동 안내', a.transport],
      ['준비물', a.supplies],
      ['공통 안내', a.includeCommon ? data.settings.commonNotice : ''],
      ['활동일정', a.schedule],
    ].filter((v) => v[1]);
    const html = blocks.map(([h, t]) => '<h3>' + h + '</h3><p>' + htmlText(t) + '</p>').join('');
    const plain = blocks.map(([h, t]) => h + '\n' + t).join('\n\n');
    try {
      if (window.ClipboardItem)
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/html': new Blob([html], { type: 'text/html' }),
            'text/plain': new Blob([plain], { type: 'text/plain' }),
          }),
        ]);
      else await navigator.clipboard.writeText(plain);
      notify('공지 본문을 복사했습니다. 홈페이지 편집기에 붙여넣으세요.');
    } catch {
      notify('클립보드 접근이 제한되었습니다. 미리보기에서 본문을 선택해 복사해 주세요.');
    }
  }
  function leave() {
    if (dirty && !confirm('저장하지 않은 변경 사항이 있습니다. 목록으로 돌아갈까요?')) return;
    onBack();
  }
  const renderAttachments = () =>
    (a.attachments || []).map((id, i) => (
      <img
        className="notice-image"
        key={id}
        src={'/api/activities/' + a.id + '/assets/' + id + '/content'}
        alt={'활동 이미지 ' + (i + 1)}
      />
    ));
  const renderBody = (t) =>
    a.attachmentPlacement === 'inline'
      ? t.split(/(\{이미지:\d+\})/).map((part, i) => {
          const m = part.match(/^\{이미지:(\d+)\}$/);
          const id = m && a.attachments?.[Number(m[1])];
          return id ? (
            <img
              className="notice-image"
              key={i}
              src={'/api/activities/' + a.id + '/assets/' + id + '/content'}
              alt="활동 이미지"
            />
          ) : (
            part
          );
        })
      : t;
  const take = (next) => {
    setA(next);
    onSaved(next);
  };
  return (
    <>
      <button className="back-link" onClick={leave}>
        <ArrowLeft size={16} />
        활동 목록
      </button>
      <div className="page-heading editor-heading">
        <div>
          <div className="inline">
            <span className="eyebrow">ACTIVITY WORKSPACE</span>
            <Badge status={a.status} />
            {dirty && <span className="unsaved">저장 전</span>}
          </div>
          <h1>{a.title || '새 활동 기획'}</h1>
        </div>
        <div className="inline">
          <Button onClick={() => setPreview(true)}>
            <Eye size={17} />
            미리보기
          </Button>
          <Button kind="primary" busy={busy === 'save'} disabled={!!busy} onClick={save}>
            <Save size={17} />
            기획안 저장
          </Button>
        </div>
      </div>
      <div className="editor-tabs">
        <button className={tab === 'plan' ? 'active' : ''} onClick={() => setTab('plan')}>
          01 <span>기획안 작성</span>
        </button>
        <button
          className={tab === 'promotion' ? 'active' : ''}
          onClick={() => setTab('promotion')}
          disabled={!a.id}
        >
          02 <span>인스타그램 홍보</span>
        </button>
      </div>
      {tab === 'promotion' ? (
        <PromotionEditor
          key={a.promotion?.updatedAt || 'new-promotion'}
          activity={a}
          settings={data.settings}
          dirty={dirty}
          notify={notify}
          refresh={refresh}
          onSaved={take}
        />
      ) : (
        <div className="editor-layout">
          <div className="editor-main">
            <section className="panel form-panel ai-brief">
              <div className="section-heading">
                <h2>
                  <Sparkles size={19} />
                  어떤 활동을 기획하고 있나요?
                </h2>
              </div>
              <textarea
                aria-label="활동 기획 메모"
                value={a.memo}
                onChange={(e) => change('memo', e.target.value)}
                placeholder="예: 10월 토요일, 15명과 보호소 청소 및 산책 봉사를 진행하고 싶습니다. 가능한 활동과 시간별 진행 순서를 제안해 주세요."
              />
              <div className="ai-brief-footer">
                <small>
                  {!a.id || dirty
                    ? '기획 메모와 날짜를 저장한 뒤 AI 작성을 요청하세요.'
                    : 'AI 초안을 확인하고 필요한 항목만 반영할 수 있습니다.'}
                </small>
                <Button
                  kind="primary"
                  disabled={!a.id || dirty || !!busy}
                  busy={busy === 'all'}
                  onClick={() => generate('all')}
                >
                  <Sparkles size={16} />
                  AI 초안 작성
                </Button>
              </div>
            </section>
            <section className="panel form-panel">
              <div className="section-heading">
                <h2>기본 정보</h2>
                <span className="helper">홈페이지 공지 양식</span>
              </div>
              <div className="form-grid">
                <Field
                  label="활동명"
                  wide
                  required
                  value={a.title}
                  onChange={(e) => change('title', e.target.value)}
                  placeholder="활동의 이름을 입력해 주세요"
                />
                <Field label="분류">
                  <select value={a.category} onChange={(e) => change('category', e.target.value)}>
                    <option>봉사</option>
                    <option>친목</option>
                  </select>
                </Field>
                <Field label="작성 템플릿">
                  <select value={a.template} onChange={(e) => change('template', e.target.value)}>
                    {['봉사활동', '정기모임', '번개·친목'].map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </Field>
                <Field label="참석가능 등급">
                  <select value={a.grade} onChange={(e) => change('grade', e.target.value)}>
                    {[
                      ...new Set([
                        a.grade,
                        ...data.settings.grades.split(',').map((s) => s.trim()),
                      ]),
                    ]
                      .filter(Boolean)
                      .map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                  </select>
                </Field>
                <Field label="진행 상태">
                  <select value={a.status} onChange={(e) => change('status', e.target.value)}>
                    {['draft', 'confirmed', 'completed', 'cancelled'].map((s) => (
                      <option value={s} key={s}>
                        {statusLabels[s]}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field
                  label="시작일"
                  type="date"
                  value={a.startDate}
                  onChange={(e) => change('startDate', e.target.value)}
                />
                <Field
                  label="종료일"
                  hint="하루 활동이면 비워두어도 됩니다."
                  type="date"
                  value={a.endDate}
                  onChange={(e) => change('endDate', e.target.value)}
                />
                <Field
                  label="활동 시작 시간"
                  type="time"
                  value={a.startTime}
                  onChange={(e) => change('startTime', e.target.value)}
                />
                <Field
                  label="활동 종료 시간"
                  type="time"
                  value={a.endTime}
                  onChange={(e) => change('endTime', e.target.value)}
                />
                <Field
                  label="신청 마감일시"
                  type="datetime-local"
                  value={a.deadline}
                  onChange={(e) => change('deadline', e.target.value)}
                />
                <Field
                  label="모집 정원"
                  type="number"
                  min="0"
                  hint="0명은 인원 제한 없음"
                  value={a.capacity}
                  onChange={(e) => change('capacity', e.target.value)}
                />
                <Field
                  label="봉사인증 시간"
                  type="number"
                  min="0"
                  step="0.5"
                  hint="기관과 확인한 시간을 입력하세요."
                  value={a.hours}
                  onChange={(e) => change('hours', e.target.value)}
                />
                <Field
                  label="참가 신청 URL"
                  type="url"
                  value={a.applicationUrl}
                  onChange={(e) => change('applicationUrl', e.target.value)}
                  placeholder="공식 홈페이지의 해당 공지 링크"
                />
              </div>
            </section>
            <section className="panel form-panel">
              <div className="section-heading">
                <h2>활동 장소와 집합 안내</h2>
              </div>
              <div className="form-grid">
                <Field label="저장한 후보지 선택" wide>
                  <select
                    value={a.venueId}
                    onChange={(e) => {
                      const v = data.venues.find((v) => v.id === e.target.value);
                      setA({
                        ...a,
                        venueId: e.target.value,
                        ...(v
                          ? {
                              location: v.name,
                              address: [v.address, v.detailAddress].filter(Boolean).join(' '),
                            }
                          : {}),
                      });
                      setDirty(true);
                    }}
                  >
                    <option value="">직접 입력 / 장소 미정</option>
                    {data.venues.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name} · {v.status}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field
                  label="활동 장소명"
                  value={a.location}
                  onChange={(e) => change('location', e.target.value)}
                  placeholder="장소명 또는 추후 공지"
                />
                <Field label="활동 주소">
                  <div className="input-action">
                    <input
                      value={a.address}
                      onChange={(e) => change('address', e.target.value)}
                      placeholder="주소"
                    />
                    <Button
                      onClick={async () => {
                        try {
                          const d = await searchAddress();
                          if (d?.address) change('address', d.address);
                        } catch (e) {
                          notify(e.message);
                        }
                      }}
                    >
                      <MapPin size={15} />
                    </Button>
                  </div>
                </Field>
                <Field
                  label="공동 이동 집합 장소"
                  value={a.meetingLocation}
                  onChange={(e) => change('meetingLocation', e.target.value)}
                  placeholder="현장과 다를 때 입력"
                />
                <Field
                  label="공동 이동 집합 시간"
                  type="time"
                  value={a.meetingTime}
                  onChange={(e) => change('meetingTime', e.target.value)}
                />
              </div>
              {a.venueId && (
                <div className="reference-note">
                  후보지 협의 조건:{' '}
                  {data.venues.find((v) => v.id === a.venueId)?.conditions || '등록된 조건 없음'}
                  <br />
                  담당자 연락처와 내부 메모는 홍보에 자동 포함되지 않습니다.
                </div>
              )}
            </section>
            <section className="panel form-panel">
              <div className="section-heading">
                <h2>활동 공지 본문</h2>
                <Button kind="small" onClick={copyNotice}>
                  <Copy size={15} />
                  본문 복사
                </Button>
              </div>
              <div className="content-fields">
                {contentFields.map(([id, label]) => (
                  <div className="content-field" key={id}>
                    <div className="section-heading">
                      <label htmlFor={id}>{label}</label>
                      <Button
                        kind="small"
                        disabled={!a.id || dirty || !!busy}
                        busy={busy === id}
                        onClick={() => generate(id)}
                      >
                        <Sparkles size={14} />이 항목 작성
                      </Button>
                    </div>
                    <textarea
                      id={id}
                      rows={id === 'description' ? 8 : id === 'schedule' ? 6 : 3}
                      value={a[id]}
                      onChange={(e) => change(id, e.target.value)}
                      placeholder={
                        id === 'schedule'
                          ? '09:00 집합 및 이동\n10:00 활동 시작\n12:00 활동 종료'
                          : undefined
                      }
                    />
                    {id === 'description' && (
                      <small>
                        **강조할 문구** 형태로 입력하면 홈페이지 복사 시 굵게 표시됩니다.
                      </small>
                    )}
                  </div>
                ))}
              </div>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={a.includeCommon}
                  onChange={(e) => change('includeCommon', e.target.checked)}
                />
                단체 공통 안내문 포함
              </label>
              {a.includeCommon && (
                <p className="reference-note prewrap">
                  {data.settings.commonNotice || '단체 관리에서 공통 안내문을 등록해 주세요.'}
                </p>
              )}
              <div className="form-grid spaced">
                <Field
                  label="참고 링크 1"
                  type="url"
                  value={a.link1}
                  onChange={(e) => change('link1', e.target.value)}
                />
                <Field
                  label="참고 링크 2"
                  type="url"
                  value={a.link2}
                  onChange={(e) => change('link2', e.target.value)}
                />
              </div>
            </section>
            <section className="panel form-panel">
              <div className="section-heading">
                <h2>홈페이지 첨부 이미지</h2>
                <small>{a.attachments?.length || 0} / 2개</small>
              </div>
              <p className="helper">
                홈페이지에는 이미지 파일을 별도로 첨부하세요. 본문 복사는 텍스트와 서식만
                복사합니다.
              </p>
              <input
                type="file"
                aria-label="공지 이미지 첨부"
                accept="image/png,image/jpeg,image/webp"
                disabled={!a.id || !!busy || (a.attachments?.length || 0) >= 2}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  if (file.size > 15 * 1024 * 1024)
                    return notify('15MB 이하 이미지를 선택해 주세요.');
                  setBusy('attachment');
                  try {
                    const value = await new Promise((resolve, reject) => {
                      const r = new FileReader();
                      r.onload = () => resolve(r.result);
                      r.onerror = reject;
                      r.readAsDataURL(file);
                    });
                    const asset = await api('/activities/' + a.id + '/assets', 'POST', {
                      data: value,
                    });
                    setA((old) => ({
                      ...old,
                      assets: [...(old.assets || []), asset],
                      attachments: [...(old.attachments || []), asset.id],
                    }));
                    setDirty(true);
                    await refresh();
                    notify('이미지를 첨부했습니다. 기획안을 저장해 주세요.');
                  } catch (e) {
                    notify(e.message);
                  } finally {
                    setBusy('');
                    e.target.value = '';
                  }
                }}
              />
              <div className="attachment-grid">
                {(a.attachments || []).map((id, i) => (
                  <div key={id}>
                    <img
                      src={'/api/activities/' + a.id + '/assets/' + id + '/content'}
                      alt={'첨부 이미지 ' + (i + 1)}
                    />
                    <div className="inline">
                      <a
                        className="btn small"
                        href={'/api/activities/' + a.id + '/assets/' + id + '/content'}
                        download={'MoaPlan-' + i + '.jpg'}
                      >
                        다운로드
                      </a>
                      <Button
                        kind="small danger"
                        onClick={() =>
                          change(
                            'attachments',
                            a.attachments.filter((x) => x !== id),
                          )
                        }
                      >
                        제거
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              <Field label="첨부사진 표시 위치">
                <select
                  value={a.attachmentPlacement || 'top'}
                  onChange={(e) => change('attachmentPlacement', e.target.value)}
                >
                  <option value="top">상단 출력</option>
                  <option value="bottom">하단 출력</option>
                  <option value="inline">본문 삽입</option>
                </select>
              </Field>
              {a.attachmentPlacement === 'inline' && (
                <p className="helper">
                  활동안내에 {'{이미지:0}'}, {'{이미지:1}'}을 넣으면 미리보기에 표시됩니다.
                </p>
              )}
            </section>
          </div>
          <aside className="editor-aside">
            <section className="panel form-panel">
              <span className="eyebrow">NEXT STEPS</span>
              <h2>활동 준비 체크</h2>
              <ul className="checklist">
                {[
                  [!!a.title, '활동명 입력'],
                  [!!a.startDate, '활동 날짜 선택'],
                  [!!a.location, '장소 또는 안내 입력'],
                  [!!a.description, '활동안내 작성'],
                  [a.status === 'confirmed', '기획 확정'],
                  [!!a.applicationUrl, '홈페이지 신청 링크'],
                ].map(([done, t]) => (
                  <li key={t} className={done ? 'done' : ''}>
                    <span>{done ? '✓' : '○'}</span>
                    {t}
                  </li>
                ))}
              </ul>
            </section>
            <section className="panel form-panel">
              <CalendarPlus size={24} className="feature-icon" />
              <h2>구글 캘린더</h2>
              <p className="helper">버튼을 눌렀을 때만 등록하거나 업데이트합니다.</p>
              {a.calendar?.stale && (
                <p className="warning">변경된 기획안을 캘린더에 반영해 주세요.</p>
              )}
              <Button
                disabled={!a.id || dirty || !!busy || !data.settings.secrets.googleRefreshToken}
                busy={busy === 'calendar'}
                onClick={() => calendar()}
              >
                {a.calendar ? '일정 업데이트' : '캘린더에 등록'}
              </Button>
              {!data.settings.secrets.googleRefreshToken && (
                <small className="block">단체 관리에서 Google 계정을 연결해 주세요.</small>
              )}
              {a.calendar && (
                <>
                  <a className="block" href={a.calendar.url} target="_blank" rel="noreferrer">
                    구글 캘린더에서 보기 ↗
                  </a>
                  <button
                    className="text-button danger"
                    onClick={() => calendar(true)}
                    disabled={!!busy}
                  >
                    연결된 일정 삭제
                  </button>
                </>
              )}
            </section>
            {a.id && (
              <section className="panel form-panel">
                <h2>활동 재사용</h2>
                <p className="helper">날짜·협의 조건을 다시 확인하고 새 활동으로 저장합니다.</p>
                <Button
                  onClick={() => {
                    onSaved({
                      ...a,
                      id: undefined,
                      version: undefined,
                      title: a.title + ' (복사)',
                      startDate: '',
                      endDate: '',
                      deadline: '',
                      status: 'draft',
                      calendar: undefined,
                      promotion: undefined,
                      assets: [],
                      attachments: [],
                    });
                  }}
                >
                  활동 복사
                </Button>
                <button
                  className="text-button danger block"
                  onClick={async () => {
                    if (!confirm('활동을 삭제할까요? 삭제 후 되돌릴 수 없습니다.')) return;
                    try {
                      await api('/activities/' + a.id, 'DELETE');
                      await refresh();
                      onBack();
                    } catch (e) {
                      notify(e.message);
                    }
                  }}
                >
                  활동 삭제
                </button>
              </section>
            )}
          </aside>
        </div>
      )}
      {preview && (
        <Modal title="홈페이지 공지 미리보기" onClose={() => setPreview(false)}>
          <div className="notice-preview">
            {a.attachmentPlacement === 'top' && renderAttachments()}
            <Badge status={a.category} />
            <h1>{a.title || '활동명'}</h1>
            <div className="notice-summary">
              <div>
                활동 일시
                <strong>
                  {a.startDate || '미정'} {a.startTime}
                  {a.endDate ? ' ~ ' + a.endDate : ''}
                </strong>
              </div>
              <div>
                활동 장소<strong>{a.location || '미정'}</strong>
              </div>
              <div>
                봉사인증 시간<strong>{a.hours}시간</strong>
              </div>
              <div>
                모집 정원
                <strong>{Number(a.capacity) === 0 ? '제한 없음' : a.capacity + '명'}</strong>
              </div>
              <div>
                신청 마감<strong>{a.deadline.replace('T', ' ') || '미정'}</strong>
              </div>
              <div>
                참고사항<strong>{a.notice || '없음'}</strong>
              </div>
            </div>
            {[
              ['활동안내', a.description],
              [
                '집합·이동 안내',
                [a.meetingTime, a.meetingLocation, a.transport].filter(Boolean).join(' '),
              ],
              ['준비물', a.supplies],
              ['공통 안내', a.includeCommon ? data.settings.commonNotice : ''],
              ['활동일정', a.schedule],
            ]
              .filter((v) => v[1])
              .map(([h, t]) => (
                <section key={h}>
                  <h3>{h}</h3>
                  <div className="prewrap">{renderBody(t)}</div>
                </section>
              ))}
            {a.attachmentPlacement === 'bottom' && renderAttachments()}
            <Button onClick={copyNotice}>
              <Copy size={16} />
              홈페이지용 본문 복사
            </Button>
          </div>
        </Modal>
      )}
      {suggestion && (
        <Modal title="AI 추천 내용 검토" onClose={() => setSuggestion(null)}>
          <p className="helper">
            선택한 항목만 기획안에 반영합니다. 직접 수정한 항목은 기본 선택에서 제외했습니다.
          </p>
          {Object.entries(suggestion).map(([k, v]) => (
            <div className="suggestion" key={k}>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={selectedFields.includes(k)}
                  onChange={(e) =>
                    setSelectedFields(
                      e.target.checked
                        ? [...selectedFields, k]
                        : selectedFields.filter((x) => x !== k),
                    )
                  }
                />
                {aiNames[k]}
                {protectedFields.includes(k) && <small>직접 수정한 항목</small>}
              </label>
              <p className="prewrap">{v}</p>
            </div>
          ))}
          <Button
            kind="primary"
            onClick={() => {
              setA({ ...a, ...Object.fromEntries(selectedFields.map((k) => [k, suggestion[k]])) });
              setDirty(true);
              setSuggestion(null);
              notify('선택한 초안을 반영했습니다. 확인 후 저장해 주세요.');
            }}
          >
            선택한 항목 반영
          </Button>
        </Modal>
      )}
    </>
  );
}
