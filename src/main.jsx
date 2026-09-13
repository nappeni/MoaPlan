import { readView, writeView, clearView } from './view-state.js';
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  CalendarDays,
  LayoutList,
  MapPin,
  Settings,
  Plus,
  LogOut,
  ArrowUpRight,
  Search,
  ChevronLeft,
  ChevronRight,
  Leaf,
  Check,
  Download,
} from 'lucide-react';
import { api, dateLabel, newActivity, newVenue, statusLabels, searchAddress } from './api';
import { Button, Field, Badge, Empty } from './ui';
import ActivityEditor from './ActivityEditor';
import SettingsPage from './SettingsPage';
import OrganizationPromotions from './OrganizationPromotions';
import './style.css';
function App() {
  const [session, setSession] = useState(null),
    [data, setData] = useState(null),
    [page, setPage] = useState(() => {
      const saved = readView('page', 'activities');
      return ['activities','venues','promotions','settings'].includes(saved) ? saved : 'activities';
    }),
    [selected, setSelected] = useState(null),
    [toast, setToast] = useState(''),
    [loading, setLoading] = useState(true);
  const notify = (message) => {
    setToast(message);
  };
  async function refresh() {
    const d = await api('/data');
    setData(d);
    return d;
  }
  async function initialize() {
    try {
      const s = await api('/session');
      setSession(s);
      if (s.user) {
        const d = await refresh();
        const saved = readView('activity');
        setSelected(saved === 'new' ? { ...newActivity(), applicationUrl:d.settings.applicationUrl } : d.activities.find(a => a.id === saved) || null);
      }
    } catch (e) {
      notify(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    initialize();
  }, []);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(''), 6000);
      return () => clearTimeout(t);
    }
  }, [toast]);
  useEffect(() => {
    if (!session?.user) return;
    const t = setInterval(() => {
      refresh().catch(() => {});
    }, 30000);
    return () => clearInterval(t);
  }, [session?.user?.id]);
  useEffect(() => { writeView('page', page); }, [page]);
  useEffect(() => {
    if (!loading && session?.user) writeView('activity', selected ? selected.id || 'new' : null);
  }, [selected, loading, session?.user?.id]);
  async function logout() {
    try {
      await api('/logout', 'POST', {});
      clearView();
      setPage('activities');
      setData(null);
      setSelected(null);
      await initialize();
    } catch (e) {
      notify(e.message);
    }
  }
  if (loading)
    return (
      <div className="loading">
        <Leaf /> 모아플랜을 준비하고 있습니다.
      </div>
    );
  if (!session?.user)
    return (
      <>
        <Auth session={session} onDone={initialize} notify={notify} />
        {toast && (
          <div className="toast" role="status">
            {toast}
          </div>
        )}
      </>
    );
  const nav = [
    ['activities', CalendarDays, '활동 기획'],
    ['venues', MapPin, '후보지 관리'],
    ['promotions', ArrowUpRight, '단체 홍보'],
    ['settings', Settings, '단체 관리'],
  ];
  return (
    <div className="app">
      <aside className="sidebar">
        <a
          className="brand"
          href="/"
          onClick={(e) => {
            e.preventDefault();
            setPage('activities');
            setSelected(null);
          }}
        >
          <span className="brand-mark">
            <Leaf size={24} />
          </span>
          MoaPlan<span className="beta">BETA</span>
        </a>
        <div className="organization">
          <span className="org-avatar">
            {data?.settings.logoId ? (
              <img
                className="org-logo"
                src={'/api/logo/content?v=' + data.settings.logoId}
                alt="단체 로고"
              />
            ) : (
              data?.settings.name?.slice(0, 1)
            )}
          </span>
          <div>
            <strong>{data?.settings.name}</strong>
            <small>운영진 워크스페이스</small>
          </div>
        </div>
        <nav>
          {nav.map(([id, Icon, label]) => (
            <button
              key={id}
              className={page === id ? 'active' : ''}
              onClick={() => {
                setPage(id);
                setSelected(null);
              }}
            >
              <Icon size={20} />
              {label}
            </button>
          ))}
        </nav>
        <div className="side-note">
          <span className="note-line" />
          <strong>좋은 활동에 집중하세요.</strong>
          <p>
            기획부터 홍보까지,
            <br />
            모아플랜과 함께.
          </p>
        </div>
        <div className="account">
          <span className="avatar">{session.user.name.slice(0, 1)}</span>
          <div>
            <strong>{session.user.name}</strong>
            <small>단체 관리자</small>
          </div>
          <button className="icon-button" onClick={logout} aria-label="로그아웃">
            <LogOut size={18} />
          </button>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <span>
            워크스페이스 <span className="slash">/</span> {nav.find((v) => v[0] === page)?.[2]}
          </span>
          <span className="top-date">
            {new Date().toLocaleDateString('ko-KR', {
              month: 'long',
              day: 'numeric',
              weekday: 'long',
            })}
          </span>
        </header>
        {session.localMode && (
          <div className="local-banner">
            개발용 저장소 사용 중 · 현재 PC에 저장됩니다. 운영 배포 시 PostgreSQL로 전환합니다.
          </div>
        )}
        <div className="workspace">
          {data &&
            (page === 'activities' ? (
              selected ? (
                <ActivityEditor
                  key={selected.id || 'new'}
                  initial={selected}
                  data={data}
                  notify={notify}
                  refresh={refresh}
                  onSaved={setSelected}
                  onBack={() => setSelected(null)}
                />
              ) : (
                <Activities
                  data={data}
                  onSelect={(a) =>
                    setSelected(
                      a.id
                        ? a
                        : {
                            ...a,
                            applicationUrl: a.applicationUrl || data.settings.applicationUrl,
                          },
                    )
                  }
                />
              )
            ) : page === 'promotions' ? (
              <OrganizationPromotions data={data} refresh={refresh} notify={notify} />
            ) : page === 'venues' ? (
              <Venues data={data} refresh={refresh} notify={notify} />
            ) : (
              <SettingsPage data={data} refresh={refresh} notify={notify} />
            ))}
        </div>
      </main>
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
function Auth({ session, onDone, notify }) {
  const setup = session?.setupRequired;
  const [form, setForm] = useState({
      organization: '바보클럽',
      name: '',
      email: '',
      password: '',
      setupToken: '',
    }),
    [busy, setBusy] = useState(false);
  const change = (k, v) => setForm({ ...form, [k]: v });
  return (
    <div className="auth-page">
      <div className="auth-story">
        <a className="brand" href="/">
          <span className="brand-mark">
            <Leaf />
          </span>
          MoaPlan
        </a>
        <div>
          <span className="eyebrow">함께 만드는 다음 활동</span>
          <h1>
            기획은 가볍게.
            <br />
            함께하는 시간은
            <br />
            <em>더 깊게.</em>
          </h1>
          <p>
            활동 기획, 후보지 관리, 일정과 홍보를
            <br />
            하나의 공간에서 준비하세요.
          </p>
          <div className="auth-steps">
            <span>01 기획</span>
            <span>02 일정</span>
            <span>03 홍보</span>
          </div>
        </div>
        <small>모아플랜 · 단체 활동을 위한 AI 운영 도우미</small>
      </div>
      <div className="auth-form">
        <div>
          <span className="eyebrow">{setup ? '첫 워크스페이스' : '다시 만나 반갑습니다'}</span>
          <h2>{setup ? '단체의 활동 공간을 만드세요' : '모아플랜에 로그인'}</h2>
          <p>
            {setup
              ? '공식 홈페이지 회원과 별개인 운영자 계정입니다.'
              : '준비하던 활동을 이어서 만들어 보세요.'}
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                await api(setup ? '/setup' : '/login', 'POST', form);
                await onDone();
              } catch (e) {
                notify(e.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {setup && (
              <>
                <Field
                  label="단체명"
                  required
                  value={form.organization}
                  onChange={(e) => change('organization', e.target.value)}
                />
                <Field
                  label="운영자 이름"
                  required
                  value={form.name}
                  onChange={(e) => change('name', e.target.value)}
                />
              </>
            )}
            <Field
              label="이메일"
              type="email"
              autoComplete="username"
              required
              value={form.email}
              onChange={(e) => change('email', e.target.value)}
            />
            <Field
              label="비밀번호"
              type="password"
              minLength={setup ? 12 : undefined}
              maxLength={128}
              autoComplete={setup ? 'new-password' : 'current-password'}
              required
              value={form.password}
              onChange={(e) => change('password', e.target.value)}
              hint={setup ? '12자 이상 입력해 주세요.' : undefined}
            />
            {setup && session.setupTokenRequired && (
              <Field
                label="초기 설정 코드"
                type="password"
                required
                value={form.setupToken}
                onChange={(e) => change('setupToken', e.target.value)}
              />
            )}
            <Button kind="primary" busy={busy} type="submit">
              {setup ? '워크스페이스 만들기' : '로그인'}
              <ArrowUpRight size={18} />
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
function Activities({ data, onSelect }) {
  const [view, setView] = useState('list'),
    [query, setQuery] = useState(''),
    [status, setStatus] = useState(''),
    [month, setMonth] = useState(
      () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    );
  const items = data.activities
    .filter(
      (a) => (!query || (a.title + a.location).includes(query)) && (!status || a.status === status),
    )
    .sort((a, b) => (a.startDate || '9999').localeCompare(b.startDate || '9999'));
  const active = data.activities.filter(
    (a) => a.status !== 'cancelled' && a.status !== 'completed',
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">ACTIVITY PLANNER</span>
          <h1>다음 활동을 준비해 볼까요?</h1>
          <p>아이디어를 기획으로, 기획을 함께하는 활동으로.</p>
        </div>
        <Button kind="primary" onClick={() => onSelect(newActivity())}>
          <Plus size={18} />새 활동 기획
        </Button>
      </div>
      <div className="stats">
        <div>
          <span>준비 중인 활동</span>
          <strong>
            {active.length}
            <small>건</small>
          </strong>
          <CalendarDays />
        </div>
        <div>
          <span>확정된 활동</span>
          <strong>
            {active.filter((a) => a.status === 'confirmed').length}
            <small>건</small>
          </strong>
          <Check />
        </div>
        <div>
          <span>예약된 홍보</span>
          <strong>
            {data.activities.filter((a) => a.promotion?.status === 'scheduled').length}
            <small>건</small>
          </strong>
          <ArrowUpRight />
        </div>
      </div>
      <section className="panel activities-panel">
        <div className="toolbar">
          <div className="segmented">
            <button className={view === 'list' ? 'selected' : ''} onClick={() => setView('list')}>
              <LayoutList size={16} />
              리스트
            </button>
            <button
              className={view === 'calendar' ? 'selected' : ''}
              onClick={() => setView('calendar')}
            >
              <CalendarDays size={16} />
              캘린더
            </button>
          </div>
          <div className="toolbar-right">
            <label className="search">
              <Search size={17} />
              <input
                aria-label="활동 검색"
                placeholder="활동명, 장소 검색"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <select
              aria-label="상태 필터"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">모든 상태</option>
              {['draft', 'confirmed', 'completed', 'cancelled'].map((s) => (
                <option key={s} value={s}>
                  {statusLabels[s]}
                </option>
              ))}
            </select>
          </div>
        </div>
        {view === 'list' ? (
          items.length ? (
            <div className="activity-list">
              {items.map((a) => (
                <button className="activity-row" key={a.id} onClick={() => onSelect(a)}>
                  <div className={'date-tile ' + (a.category === '친목' ? 'social' : '')}>
                    <span>{a.startDate ? a.startDate.slice(5, 7) + '월' : '미정'}</span>
                    <strong>{a.startDate ? a.startDate.slice(8) : '—'}</strong>
                  </div>
                  <div className="activity-info">
                    <div className="inline">
                      <span className="category">{a.category}</span>
                      <Badge status={a.status} />
                      {a.promotion?.stale && <Badge status="paused" />}
                    </div>
                    <h3>{a.title}</h3>
                    <p>
                      <MapPin size={14} />
                      {a.location || '장소 미정'}
                      <span>·</span>
                      {a.startTime || '시간 미정'}
                    </p>
                  </div>
                  <div className="row-end">
                    {a.promotion && <Badge status={a.promotion.status} />}
                    <ChevronRight size={18} />
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <Empty
              icon={CalendarDays}
              title={query || status ? '조건에 맞는 활동이 없습니다' : '첫 활동을 기획해 보세요'}
              action={
                !query &&
                !status && (
                  <Button onClick={() => onSelect(newActivity())}>
                    <Plus size={16} />
                    활동 만들기
                  </Button>
                )
              }
            >
              날짜와 아이디어를 적으면 단체 양식에 맞춰 준비할 수 있습니다.
            </Empty>
          )
        ) : (
          <Calendar month={month} setMonth={setMonth} items={items} onSelect={onSelect} />
        )}
      </section>
      <div className="bottom-hint">
        <Leaf size={17} />
        신청자와 회원 관리는 기존 공식 홈페이지에서 진행합니다.
      </div>
    </>
  );
}
function Calendar({ month, setMonth, items, onSelect }) {
  const year = month.getFullYear(),
    m = month.getMonth();
  const start = new Date(year, m, 1);
  start.setDate(1 - start.getDay());
  const key = (d) =>
    [
      d.getFullYear(),
      String(d.getMonth() + 1).padStart(2, '0'),
      String(d.getDate()).padStart(2, '0'),
    ].join('-');
  return (
    <div className="calendar">
      <div className="calendar-heading">
        <h2>
          {year}년 {m + 1}월
        </h2>
        <div className="inline">
          <Button onClick={() => setMonth(new Date(year, m - 1, 1))} aria-label="이전 달">
            <ChevronLeft size={16} />
          </Button>
          <Button
            onClick={() => setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}
          >
            이번 달
          </Button>
          <Button onClick={() => setMonth(new Date(year, m + 1, 1))} aria-label="다음 달">
            <ChevronRight size={16} />
          </Button>
        </div>
      </div>
      <div className="calendar-grid">
        {['일', '월', '화', '수', '목', '금', '토'].map((d) => (
          <div className="weekday" key={d}>
            {d}
          </div>
        ))}
        {Array.from({ length: 42 }, (_, i) => {
          const d = new Date(start);
          d.setDate(start.getDate() + i);
          const day = key(d);
          return (
            <div
              className={
                'calendar-day ' +
                (d.getMonth() !== m ? 'muted' : '') +
                ' ' +
                (day === key(new Date()) ? 'today' : '')
              }
              key={day}
            >
              <button
                className="day-number"
                onClick={() => onSelect({ ...newActivity(), startDate: day })}
                aria-label={day + ' 활동 추가'}
              >
                {d.getDate()}
              </button>
              {items
                .filter(
                  (a) => a.startDate && a.startDate <= day && (a.endDate || a.startDate) >= day,
                )
                .map((a) => (
                  <button
                    className={'calendar-event ' + a.status}
                    key={a.id}
                    onClick={() => onSelect(a)}
                  >
                    {a.startTime} {a.title}
                  </button>
                ))}
              {items
                .filter(
                  (a) =>
                    a.promotion?.status === 'scheduled' &&
                    new Date(a.promotion.scheduledAt).toLocaleDateString('sv-SE', {
                      timeZone: 'Asia/Seoul',
                    }) === day,
                )
                .map((a) => (
                  <button
                    className="calendar-event promotion-event"
                    key={'p' + a.id}
                    onClick={() => onSelect(a)}
                  >
                    홍보 · {a.title}
                  </button>
                ))}
            </div>
          );
        })}
      </div>
      {items.some((a) => !a.startDate) && (
        <p className="helper">날짜 미정 활동은 리스트에서 확인할 수 있습니다.</p>
      )}
    </div>
  );
}
function Venues({ data, refresh, notify }) {
  const [editing, setEditing] = useState(() => {
      const saved = readView('venue');
      return saved === 'new' ? newVenue() : data.venues.find(v => v.id === saved) || null;
    }),
    [query, setQuery] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => { writeView('venue', editing ? editing.id || 'new' : null); }, [editing]);
  const change = (k, v) => setEditing({ ...editing, [k]: v });
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api(
        '/venues' + (editing.id ? '/' + editing.id : ''),
        editing.id ? 'PUT' : 'POST',
        editing,
      );
      await refresh();
      setEditing(null);
      notify('후보지를 저장했습니다.');
    } catch (e) {
      notify(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">PLACES & CONNECTIONS</span>
          <h1>함께할 장소를 모아두세요</h1>
          <p>연락처와 협의 내용을 다음 활동에 연결합니다.</p>
        </div>
        {!editing && (
          <Button kind="primary" onClick={() => setEditing(newVenue())}>
            <Plus size={18} />
            후보지 등록
          </Button>
        )}
      </div>
      {editing ? (
        <form className="panel form-panel" onSubmit={save}>
          <div className="section-heading">
            <h2>{editing.id ? '후보지 수정' : '새 후보지'}</h2>
            <Button type="button" onClick={() => setEditing(null)}>
              목록
            </Button>
          </div>
          <div className="form-grid">
            <Field
              label="후보지 이름"
              required
              value={editing.name}
              onChange={(e) => change('name', e.target.value)}
            />
            <Field label="협의 상태">
              <select value={editing.status} onChange={(e) => change('status', e.target.value)}>
                {['미연락', '협의 중', '활동 가능', '보류', '진행 불가'].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
            <Field
              label="담당자명"
              value={editing.contact}
              onChange={(e) => change('contact', e.target.value)}
            />
            <Field
              label="연락처"
              type="tel"
              value={editing.phone}
              onChange={(e) => change('phone', e.target.value)}
            />
            <Field label="도로명 주소" wide>
              <div className="input-action">
                <input value={editing.address} readOnly placeholder="다음 주소 검색으로 선택" />
                <Button
                  type="button"
                  onClick={async () => {
                    try {
                      const a = await searchAddress();
                      if (a) {
                        if (!a.address) return notify('도로명 주소가 있는 결과를 선택해 주세요.');
                        setEditing({ ...editing, ...a });
                      }
                    } catch (e) {
                      notify(e.message);
                    }
                  }}
                >
                  주소 검색
                </Button>
              </div>
            </Field>
            <Field
              label="상세 주소"
              value={editing.detailAddress}
              onChange={(e) => change('detailAddress', e.target.value)}
            />
            <Field label="우편번호" value={editing.postcode} readOnly />
            <Field
              label="마지막 연락일"
              type="date"
              value={editing.lastContact}
              onChange={(e) => change('lastContact', e.target.value)}
            />
            <Field
              label="다음 연락 예정일"
              type="date"
              value={editing.nextContact}
              onChange={(e) => change('nextContact', e.target.value)}
            />
            <Field label="활동 가능 조건" wide>
              <textarea
                value={editing.conditions}
                onChange={(e) => change('conditions', e.target.value)}
                placeholder="가능한 요일, 시간, 수용 인원, 준비물 등"
              />
            </Field>
            <Field label="내부 협의 메모" wide hint="홍보물에는 기본적으로 포함되지 않습니다.">
              <textarea value={editing.memo} onChange={(e) => change('memo', e.target.value)} />
            </Field>
          </div>
          {editing.address && (
            <VenueMap address={editing.address} mapsKey={data.settings.mapsKey} />
          )}
          <div className="form-footer">
            {editing.id && (
              <Button
                kind="danger"
                type="button"
                onClick={async () => {
                  if (!confirm('후보지를 삭제할까요?')) return;
                  try {
                    await api('/venues/' + editing.id, 'DELETE');
                    await refresh();
                    setEditing(null);
                  } catch (e) {
                    notify(e.message);
                  }
                }}
              >
                삭제
              </Button>
            )}
            <Button kind="primary" busy={busy} type="submit">
              후보지 저장
            </Button>
          </div>
        </form>
      ) : (
        <>
          <label className="search standalone">
            <Search size={17} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="후보지 이름, 주소 검색"
              aria-label="후보지 검색"
            />
          </label>
          <div className="venue-grid">
            {data.venues
              .filter((v) => (v.name + v.address).includes(query))
              .map((v) => (
                <button className="panel venue-card" onClick={() => setEditing(v)} key={v.id}>
                  <div className="section-heading">
                    <span className="venue-icon">
                      <MapPin size={22} />
                    </span>
                    <Badge status={v.status} />
                  </div>
                  <h3>{v.name}</h3>
                  <p>{v.address || '주소 미등록'}</p>
                  <div className="venue-contact">
                    {v.contact || '담당자 미등록'}
                    <span>{v.phone || '연락처 미등록'}</span>
                  </div>
                  {v.nextContact && <small>다음 연락 · {v.nextContact}</small>}
                </button>
              ))}
          </div>
          {!data.venues.length && (
            <section className="panel">
              <Empty icon={MapPin} title="새로운 연결을 기록하세요">
                발굴한 봉사 후보지와 연락 내용을 한곳에 모아두세요.
              </Empty>
            </section>
          )}
        </>
      )}
    </>
  );
}
export function VenueMap({ address, mapsKey }) {
  return (
    <div className="map-wrap">
      {mapsKey ? (
        <iframe
          title="구글 지도"
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          src={
            'https://www.google.com/maps/embed/v1/place?key=' +
            encodeURIComponent(mapsKey) +
            '&q=' +
            encodeURIComponent(address)
          }
        />
      ) : (
        <p className="helper">
          지도 표시는 단체 관리에서 Google Maps 키를 설정하면 사용할 수 있습니다.
        </p>
      )}
      <a
        target="_blank"
        rel="noreferrer"
        href={'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(address)}
      >
        구글 지도에서 위치 보기 <ArrowUpRight size={14} />
      </a>
    </div>
  );
}
createRoot(document.getElementById('root')).render(<App />);
