import React, { useState, useRef, useEffect } from 'react';
import {
  Sparkles,
  Plus,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Download,
  Save,
  Send,
  ImagePlus,
  Upload,
  RefreshCw,
} from 'lucide-react';
import { api } from './api';
import { Button, Field, Badge } from './ui';
import { drawCard, cardData } from './artwork';
const blankSlide = () => ({ title: '', body: '', visual: '' });
export default function PromotionEditor({
  activity: a,
  settings,
  dirty,
  notify,
  refresh,
  onSaved,
}) {
  const p = a.promotion;
  const [slides, setSlides] = useState(
      p?.slides || [
        {
          title: a.title,
          body: [a.startDate + ' ' + a.startTime, a.location, a.notice].filter(Boolean).join('\n'),
          visual: '',
        },
      ],
    ),
    [caption, setCaption] = useState(p?.caption || ''),
    [hashtags, setHashtags] = useState(p?.hashtags || settings.hashtags),
    [index, setIndex] = useState(0),
    [assetIds, setAssetIds] = useState(p?.assetIds || []),
    [busy, setBusy] = useState(''),
    [changed, setChanged] = useState(false),
    [at, setAt] = useState(''),
    [previewError, setPreviewError] = useState(''),
    [approved, setApproved] = useState(false);
  const canvas = useRef(null);
  const slide = slides[index] || slides[0];
  const contentUrl = (id) => '/api/activities/' + a.id + '/assets/' + id + '/content';
  const changeSlide = (k, v) => {
    setSlides(slides.map((s, i) => (i === index ? { ...s, [k]: v } : s)));
    setAssetIds([]);
    setChanged(true);
    setApproved(false);
  };
  useEffect(() => {
    let cancelled = false;
    if (canvas.current && slide)
      drawCard(
        canvas.current,
        slide,
        settings,
        index,
        slides.length,
        slide.backgroundId ? contentUrl(slide.backgroundId) : null,
        a,
      )
        .then(() => {
          if (!cancelled) setPreviewError('');
        })
        .catch((e) => {
          if (!cancelled) setPreviewError(e.message);
        });
    return () => {
      cancelled = true;
    };
  }, [slides, index, settings.color, settings.name]);
  async function generatePlan() {
    if (changed && !confirm('현재 홍보 초안을 새 AI 추천으로 바꿀까요?')) return;
    setBusy('plan');
    try {
      const { suggestion: v } = await api('/activities/' + a.id + '/ai', 'POST', {
        field: 'promotion',
      });
      if (!Array.isArray(v.slides) || v.slides.length < 1 || v.slides.length > 8)
        throw new Error('AI 구성안이 1~8장 범위를 벗어났습니다. 다시 요청해 주세요.');
      setSlides(
        v.slides.map((s) => ({
          title: String(s.title || '').slice(0, 100),
          body: String(s.body || '').slice(0, 400),
          visual: String(s.visual || '').slice(0, 2000),
        })),
      );
      setCaption(String(v.caption || ''));
      setHashtags(String(v.hashtags || ''));
      setIndex(0);
      setAssetIds([]);
      setChanged(true);
      setApproved(false);
      notify(v.slides.length + '장으로 구성안을 추천했습니다. 문구를 검토해 주세요.');
    } catch (e) {
      notify(e.message);
    } finally {
      setBusy('');
    }
  }
  async function generateBackground() {
    setBusy('background');
    try {
      const asset = await api('/activities/' + a.id + '/background', 'POST', {
        prompt: slide.visual || slide.title,
      });
      changeSlide('backgroundId', asset.id);
      await refresh();
      notify('AI 배경을 만들었습니다.');
    } catch (e) {
      notify(e.message);
    } finally {
      setBusy('');
    }
  }
  async function upload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) return notify('15MB 이하 이미지를 선택해 주세요.');
    setBusy('upload');
    try {
      const data = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = reject;
        r.readAsDataURL(file);
      });
      const asset = await api('/activities/' + a.id + '/assets', 'POST', { data });
      changeSlide('backgroundId', asset.id);
      await refresh();
      notify('배경 사진을 업로드했습니다.');
    } catch (e) {
      notify(e.message);
    } finally {
      setBusy('');
      e.target.value = '';
    }
  }
  async function renderImages() {
    setBusy('render');
    try {
      const ids = [];
      for (let i = 0; i < slides.length; i++) {
        setBusy('render ' + (i + 1) + '/' + slides.length);
        const data = await cardData(
          slides[i],
          settings,
          i,
          slides.length,
          slides[i].backgroundId ? contentUrl(slides[i].backgroundId) : null,
          a,
        );
        const asset = await api('/activities/' + a.id + '/assets', 'POST', { data });
        ids.push(asset.id);
      }
      setAssetIds(ids);
      setChanged(true);
      setApproved(false);
      await refresh();
      notify('게시용 ' + ids.length + '장을 최적화해 R2에 저장했습니다.');
    } catch (e) {
      notify(e.message);
    } finally {
      setBusy('');
    }
  }
  async function save() {
    setBusy('save');
    try {
      const next = await api('/activities/' + a.id + '/promotion', 'PUT', {
        caption,
        hashtags,
        slides,
        assetIds,
        sourceVersion: a.version,
      });
      onSaved(next);
      await refresh();
      setChanged(false);
      setApproved(false);
      notify('홍보 초안을 저장했습니다.');
    } catch (e) {
      notify(e.message);
    } finally {
      setBusy('');
    }
  }
  async function publish() {
    setBusy('publish');
    try {
      const next = await api('/activities/' + a.id + '/publish', 'POST', {
        scheduledAt: at ? new Date(at).toISOString() : undefined,
      });
      onSaved(next);
      await refresh();
      notify(at ? '게시를 예약했습니다.' : '게시 요청을 접수했습니다. 처리 결과를 확인해 주세요.');
      setApproved(false);
    } catch (e) {
      notify(e.message);
    } finally {
      setBusy('');
    }
  }
  function move(delta) {
    const to = index + delta;
    if (to < 0 || to >= slides.length) return;
    const next = [...slides];
    [next[index], next[to]] = [next[to], next[index]];
    setSlides(next);
    setIndex(to);
    setAssetIds([]);
    setChanged(true);
    setApproved(false);
  }
  const disabled =
    !!busy ||
    dirty ||
    p?.status === 'processing' ||
    p?.status === 'attention' ||
    p?.status === 'published';
  return (
    <>
      <div className="promotion-intro">
        <div>
          <h2>활동을 알리는 한 장부터</h2>
          <p>정보량에 맞게 1~8장으로 구성하고, 문구와 이미지를 직접 다듬으세요.</p>
        </div>
        <Button kind="primary" disabled={disabled} busy={busy === 'plan'} onClick={generatePlan}>
          <Sparkles size={17} />
          AI 구성안 추천
        </Button>
      </div>
      {dirty && <div className="warning">기획안 변경 사항을 먼저 저장해 주세요.</div>}
      {p?.stale && (
        <div className="warning">
          기획안이 변경되었습니다. 홍보 문구와 이미지의 날짜·장소를 검토하고 다시 저장해 주세요.
        </div>
      )}
      <div className="promotion-layout">
        <section className="panel form-panel">
          <div className="section-heading">
            <h2>
              이미지 구성 <span className="helper">{slides.length} / 8장</span>
            </h2>
            <Button
              kind="small"
              disabled={disabled || slides.length >= 8}
              onClick={() => {
                setSlides([...slides, blankSlide()]);
                setIndex(slides.length);
                setChanged(true);
                setAssetIds([]);
              }}
            >
              <Plus size={15} />장 추가
            </Button>
          </div>
          <div className="slide-tabs">
            {slides.map((s, i) => (
              <button key={i} className={index === i ? 'active' : ''} onClick={() => setIndex(i)}>
                {String(i + 1).padStart(2, '0')}
              </button>
            ))}
          </div>
          <div className="content-fields">
            <Field label="이 장의 제목">
              <input
                value={slide.title}
                maxLength={100}
                onChange={(e) => changeSlide('title', e.target.value)}
              />
            </Field>
            <Field label="본문" hint="읽기 쉬운 크기를 유지하도록 긴 내용은 여러 장으로 나누세요.">
              <textarea
                value={slide.body}
                maxLength={400}
                rows={5}
                onChange={(e) => changeSlide('body', e.target.value)}
              />
            </Field>
            <div className="inline wrap">
              <Button kind="small" disabled={index === 0 || disabled} onClick={() => move(-1)}>
                <ChevronLeft size={15} />
                앞으로
              </Button>
              <Button
                kind="small"
                disabled={index === slides.length - 1 || disabled}
                onClick={() => move(1)}
              >
                뒤로
                <ChevronRight size={15} />
              </Button>
              <Button
                kind="small danger"
                disabled={slides.length <= 1 || disabled}
                onClick={() => {
                  setSlides(slides.filter((_, i) => i !== index));
                  setIndex(Math.max(0, index - 1));
                  setAssetIds([]);
                  setChanged(true);
                }}
              >
                <Trash2 size={15} />장 삭제
              </Button>
            </div>
            <hr />
            <Field label="AI 배경 이미지 설명">
              <textarea
                value={slide.visual}
                onChange={(e) => changeSlide('visual', e.target.value)}
                placeholder="예: 유기견과 봉사자가 함께 산책하는 따뜻한 일러스트. 글자는 제외."
              />
            </Field>
            <div className="inline wrap">
              <Button
                disabled={
                  disabled || !settings.secrets.aiKey || !settings.secrets.r2SecretAccessKey
                }
                busy={busy === 'background'}
                onClick={generateBackground}
              >
                <Sparkles size={16} />이 장 배경 생성
              </Button>
              <label className={'btn ' + (disabled ? 'disabled' : '')}>
                <Upload size={16} />
                직접 사진 선택
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  hidden
                  disabled={disabled}
                  onChange={upload}
                />
              </label>
              {slide.backgroundId && (
                <Button
                  kind="small"
                  disabled={disabled}
                  onClick={() => changeSlide('backgroundId', undefined)}
                >
                  배경 제거
                </Button>
              )}
            </div>
            <p className="helper">
              AI 배경 생성은 별도 API 비용이 발생합니다. 직접 촬영한 사진은 SNS 공개 가능한 사진을
              사용해 주세요.
            </p>
          </div>
        </section>
        <section className="artwork-preview">
          <canvas ref={canvas} aria-label={'홍보 이미지 ' + (index + 1) + ' 미리보기'} />
          {previewError && <div className="warning">{previewError}</div>}
          <Button
            disabled={!!previewError || !!busy}
            onClick={async () => {
              try {
                const data = await cardData(
                  slide,
                  settings,
                  index,
                  slides.length,
                  slide.backgroundId ? contentUrl(slide.backgroundId) : null,
                  a,
                );
                const link = document.createElement('a');
                link.download = 'MoaPlan-' + (index + 1) + '.jpg';
                link.href = data;
                link.click();
              } catch (e) {
                notify(e.message);
              }
            }}
          >
            <Download size={16} />
            현재 이미지 다운로드
          </Button>
          <p className="helper">
            글자는 편집 가능한 텍스트로 배치합니다.
            <br />
            게시용 저장 시 JPEG 압축을 적용합니다.
          </p>
        </section>
      </div>
      <section className="panel form-panel spaced">
        <div className="section-heading">
          <h2>캡션과 해시태그</h2>
          <small>{caption.length + hashtags.length + 2} / 2,200자</small>
        </div>
        <div className="form-grid">
          <Field label="캡션">
            <textarea
              rows={9}
              value={caption}
              onChange={(e) => {
                setCaption(e.target.value);
                setChanged(true);
                setApproved(false);
              }}
              placeholder="활동 소개와 참가 신청 안내를 작성해 주세요."
            />
          </Field>
          <Field label="해시태그">
            <textarea
              rows={9}
              value={hashtags}
              onChange={(e) => {
                setHashtags(e.target.value);
                setChanged(true);
                setApproved(false);
              }}
            />
          </Field>
        </div>
        <div className="form-footer wrap">
          <span className="helper">
            {assetIds.length === slides.length
              ? '게시용 ' + assetIds.length + '장 저장됨'
              : '이미지 구성을 확정한 뒤 게시용 이미지를 저장하세요.'}
          </span>
          <Button
            disabled={disabled || !settings.secrets.r2SecretAccessKey}
            busy={busy.startsWith('render')}
            onClick={renderImages}
          >
            <ImagePlus size={17} />
            {busy.startsWith('render')
              ? busy.replace('render', '저장 중')
              : '게시용 ' + slides.length + '장 생성·저장'}
          </Button>
          <Button kind="primary" disabled={disabled} busy={busy === 'save'} onClick={save}>
            <Save size={17} />
            홍보 초안 저장
          </Button>
        </div>
      </section>
      <section className="panel form-panel spaced">
        <div className="section-heading">
          <h2>인스타그램 게시</h2>
          {p && <Badge status={p.status} />}
        </div>
        {p?.error && <p className="warning">{p.error}</p>}
        {p?.status === 'attention' && (
          <div className="inline wrap spaced">
            {[
              [true, '게시 완료 확인'],
              [false, '게시되지 않음 확인'],
            ].map(([published, label]) => (
              <Button
                key={label}
                onClick={async () => {
                  if (
                    !confirm(
                      'Instagram에서 실제 게시 여부를 확인했나요? 잘못 확인하면 중복 게시될 수 있습니다.',
                    )
                  )
                    return;
                  try {
                    const next = await api('/activities/' + a.id + '/resolve-publish', 'POST', {
                      published,
                    });
                    onSaved(next);
                    await refresh();
                    notify('확인 결과를 저장했습니다.');
                  } catch (e) {
                    notify(e.message);
                  }
                }}
              >
                {label}
              </Button>
            ))}
          </div>
        )}
        {p?.status === 'published' && (
          <Button
            onClick={async () => {
              if (!confirm('기존 게시 이력을 보관하고 새 홍보물을 만들까요?')) return;
              try {
                const next = await api('/activities/' + a.id + '/new-promotion', 'POST', {});
                onSaved(next);
                await refresh();
              } catch (e) {
                notify(e.message);
              }
            }}
          >
            새 홍보 만들기
          </Button>
        )}
        {p?.permalink && (
          <a href={p.permalink} target="_blank" rel="noreferrer">
            게시된 피드 보기 ↗
          </a>
        )}
        {p?.scheduledAt && (
          <p className="helper">
            게시 요청 시간:{' '}
            {new Date(p.scheduledAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}
          </p>
        )}
        <div className="publish-controls">
          <Field label="예약 시간" hint="비워두면 게시 요청 후 처리합니다.">
            <input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} />
          </Field>
          <div>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={approved}
                onChange={(e) => setApproved(e.target.checked)}
              />
              게시 계정, 이미지, 날짜·장소, 신청 안내를 확인했습니다.
            </label>
            <p className="helper">
              대상 계정 ID: {settings.instagramUserId || '단체 관리에서 설정 필요'}
              <br />
              기획 확정 및 최신 홍보물 저장 후 게시할 수 있습니다.
            </p>
          </div>
        </div>
        <div className="inline wrap">
          <Button
            kind="primary"
            disabled={
              disabled ||
              changed ||
              !approved ||
              a.status !== 'confirmed' ||
              !p ||
              p.stale ||
              p.assets?.length !== slides.length ||
              !settings.secrets.instagramToken ||
              ['published', 'scheduled', 'processing', 'attention'].includes(p.status)
            }
            busy={busy === 'publish'}
            onClick={publish}
          >
            <Send size={17} />
            {at ? '예약 게시' : '지금 게시'}
          </Button>
          {p?.status === 'scheduled' && (
            <Button
              onClick={async () => {
                try {
                  const next = await api('/activities/' + a.id + '/unpublish', 'POST', {});
                  onSaved(next);
                  await refresh();
                  notify('게시 예약을 취소했습니다.');
                } catch (e) {
                  notify(e.message);
                }
              }}
            >
              예약 취소
            </Button>
          )}
          <Button
            onClick={async () => {
              const d = await refresh();
              onSaved(d.activities.find((x) => x.id === a.id));
            }}
          >
            <RefreshCw size={16} />
            게시 상태 확인
          </Button>
        </div>
      </section>
    </>
  );
}
