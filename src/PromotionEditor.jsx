import { prepareSlides } from './promotion-slides.js';
import { prepareImage } from './image-upload.js';
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
const blankSlide = () => ({ role: 'content', title: '', body: '', visual: '' });
export default function PromotionEditor({
  activity: a,
  initialSuggestion,
  settings,
  dirty,
  notify,
  refresh,
  onSaved,
}) {
  const p = a.promotion;
  const consentRecorded = !!p && ['scheduled', 'processing', 'published', 'attention'].includes(p.status)
    && !!(p.approval || (p.manual && p.jobId));
  const [briefTitle, setBriefTitle] = useState(a.title);
  const [briefDescription, setBriefDescription] = useState(a.description || '');
  const [generationError, setGenerationError] = useState('');
  const base = (a.kind === 'organization' ? '/promotions/' : '/activities/') + a.id;
  const instagramReady =
    !!settings.secrets?.instagramToken &&
    /^\d+$/.test(settings.instagramUserId || '') &&
    /^v\d+\.\d+$/.test(settings.graphVersion || '');
  const needsCover =
    !!p?.slides?.length &&
    p.slides[0].role !== 'cover' &&
    !['scheduled', 'processing', 'published', 'attention'].includes(p.status);
  const [slides, setSlides] = useState(() => prepareSlides(a, initialSuggestion)),
    [caption, setCaption] = useState(initialSuggestion?.caption || p?.caption || ''),
    [hashtags, setHashtags] = useState(
      initialSuggestion?.hashtags || p?.hashtags || settings.hashtags,
    ),
    [index, setIndex] = useState(0),
    [assetIds, setAssetIds] = useState(initialSuggestion || needsCover ? [] : p?.assetIds || []),
    [busy, setBusy] = useState(''),
    [changed, setChanged] = useState(!!initialSuggestion || needsCover),
    [publishError, setPublishError] = useState(''),
    [previewError, setPreviewError] = useState(''),
    [approved, setApproved] = useState(false);
  const canvas = useRef(null);
  const slide = slides[index] || slides[0];
  const contentUrl = (id) => '/api' + base + '/assets/' + id + '/content';
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
  }, [slides, index, settings.color, settings.name, settings.logoId]);
  async function generatePlan() {
    if (changed && !confirm('현재 홍보 초안을 새 AI 추천으로 바꿀까요?')) return;
    setBusy('plan');
    setGenerationError('');
    try {
      const { suggestion: v } = await api(base + '/ai', 'POST', {
        field: 'promotion',
        ...(a.kind === 'organization'
          ? { brief: { title: briefTitle, description: briefDescription } }
          : {}),
      });
      if (!Array.isArray(v.slides) || v.slides.length < 1 || v.slides.length > 8)
        throw new Error('AI 구성안이 1~8장 범위를 벗어났습니다. 다시 요청해 주세요.');
      setSlides(
        v.slides.map((s, i) => ({
          role: i === 0 ? 'cover' : 'content',
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
      setGenerationError(e.message);
    } finally {
      setBusy('');
    }
  }
  async function generateBackground() {
    setBusy('background');
    try {
      const asset = await api(base + '/background', 'POST', {
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
      const data = await prepareImage(file);
      const asset = await api(base + '/assets', 'POST', { data });
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
        const asset = await api(base + '/assets', 'POST', { data });
        ids.push(asset.id);
      }
      setAssetIds(ids);
      setChanged(true);
      setApproved(false);
      await persistDraft(ids);
      notify('게시용 ' + ids.length + '장과 홍보 초안을 함께 저장했습니다. 아래에서 확인 후 게시해 주세요.');
    } catch (e) {
      notify(e.message);
    } finally {
      setBusy('');
    }
  }
  async function persistDraft(ids) {
      const next = await api(base + '/promotion', 'PUT', {
        caption,
        hashtags,
        slides,
        assetIds: ids,
        sourceVersion: a.version,
        ...(a.kind === 'organization'
          ? { brief: { title: briefTitle, description: briefDescription } }
          : {}),
      });
      onSaved(next);
      await refresh();
      setChanged(false);
      setApproved(false);
  }
  async function save() {
    setBusy('save');
    try {
      await persistDraft(assetIds);
      notify('홍보 초안을 저장했습니다.');
    } catch (e) {
      notify(e.message);
    } finally {
      setBusy('');
    }
  }
  // Resume only this explicitly approved job; saving a draft never enters this flow.
  useEffect(() => {
    if (!p?.manual || !['scheduled', 'processing'].includes(p.status)) return;
    let stopped = false;
    const timer = setTimeout(
      async () => {
        try {
          const next = await api(base + '/publish-step', 'POST', { jobId: p.jobId });
          if (!stopped) {
            setPublishError('');
            onSaved(next);
          }
        } catch (e) {
          if (!stopped) setPublishError(e.message + ' 게시 상태 확인을 눌러 이어서 확인해 주세요.');
        }
      },
      Math.max(1200, Math.min(10000, (p.nextAt || 0) - Date.now())),
    );
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [p, base]);
  async function publish() {
    setBusy('publish');
    setPublishError('');
    try {
      const next = await api(base + '/publish', 'POST', {
        approved: true,
        reviewedAt: p.updatedAt,
      });
      onSaved(next);
      setApproved(false);
      notify('확인한 홍보물을 게시하고 있습니다. 처리 결과를 확인해 주세요.');
    } catch (e) {
      setPublishError(e.message);
    } finally {
      setBusy('');
    }
  }
  function move(delta) {
    const to = index + delta;
    if (index === 0 || to < 1 || to >= slides.length) return;
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
    p?.status === 'scheduled' ||
    p?.status === 'processing' ||
    p?.status === 'attention' ||
    p?.status === 'published';
  const publishBlockReason = busy
    ? '진행 중인 작업이 끝나면 게시할 수 있습니다.'
    : dirty
      ? '활동 기획의 변경 내용을 먼저 저장해 주세요.'
      : !instagramReady
        ? '단체 관리에서 Instagram 연결 설정을 저장해 주세요.'
        : a.status !== 'confirmed'
          ? '활동 기획을 확정한 후 게시할 수 있습니다.'
          : !p
            ? '게시용 이미지 생성·저장을 눌러 홍보 초안을 저장해 주세요.'
            : ['published', 'scheduled', 'processing', 'attention'].includes(p.status)
              ? ({ published: '이미 게시된 홍보물입니다.', scheduled: '게시 요청을 처리하고 있습니다.', processing: '게시 요청을 처리하고 있습니다.', attention: '게시 결과 확인이 필요합니다.' })[p.status]
              : p.stale
                ? '변경된 기획 내용을 검토하고 게시용 이미지 생성·저장을 눌러 주세요.'
                : assetIds.length !== slides.length
                  ? '게시용 이미지가 준비되지 않았습니다. 게시용 이미지 생성·저장을 눌러 주세요.'
                  : changed || p.assets?.length !== slides.length
                    ? '홍보 초안 저장을 눌러 현재 이미지와 게시글을 반영해 주세요.'
                    : !approved
                      ? '저장된 피드를 확인하고 게시 동의에 체크해 주세요.'
                      : '';
  return (
    <>
      {a.kind === 'organization' && (
        <fieldset disabled={disabled} className="panel form-panel spaced">
          <h2>홍보 목적·컨셉 수정</h2>
          <Button
            disabled={disabled || !briefTitle.trim() || !briefDescription.trim()}
            onClick={async () => {
              setBusy('brief');
              try {
                const next = await api(base + '/brief', 'PUT', {
                  title: briefTitle,
                  description: briefDescription,
                  version: a.version,
                });
                onSaved(next);
                await refresh();
                setApproved(false);
                notify(
                  '입력 내용을 저장했습니다. 홍보 문구와 게시글은 별도로 검토하고 저장해 주세요.',
                );
              } catch (e) {
                notify(e.message);
              } finally {
                setBusy('');
              }
            }}
          >
            입력 내용 저장
          </Button>

          <Field label="홍보 제목">
            <input
              maxLength={100}
              value={briefTitle}
              onChange={(e) => {
                setBriefTitle(e.target.value);
                setChanged(true);
                setApproved(false);
              }}
            />
          </Field>
          <Field label="단체 소개와 홍보 목적·컨셉">
            <textarea
              rows={6}
              maxLength={4000}
              value={briefDescription}
              onChange={(e) => {
                setBriefDescription(e.target.value);
                setChanged(true);
                setApproved(false);
              }}
            />
          </Field>
          <p className="helper">
            내용을 수정하고 아래 AI 초안 다시 만들기를 누르세요. 새 결과를 검토하고 홍보 초안을
            저장할 때 기존 저장본을 대체합니다. AI 생성에는 API 비용이 발생합니다.
          </p>
        </fieldset>
      )}
      {generationError && (
        <p className="warning" role="alert">
          {generationError} 기존 초안과 입력 내용은 유지됩니다.
        </p>
      )}
      {changed && a.kind === 'organization' && (
        <p className="warning">
          검토 중인 변경 사항입니다. 저장하기 전까지 기존 저장본은 유지됩니다.
        </p>
      )}
      {needsCover && (
        <p className="warning">
          기존 본문 앞에 표지를 추가했습니다. 표지를 확인하고 게시용 이미지를 다시 생성·저장해
          주세요.
        </p>
      )}
      {slides.length > 8 && (
        <p className="warning">
          표지를 포함해 최대 8장입니다. 기존 내용을 합치거나 본문 한 장을 삭제한 뒤 저장해 주세요.
        </p>
      )}
      <div className="promotion-intro">
        <div>
          <h2>
            {a.kind === 'organization' ? '우리 단체를 소개하는 피드' : '활동을 알리는 한 장부터'}
          </h2>
          <p>첫 장은 표지, 다음 장부터 상세 안내입니다. 표지를 포함해 최대 8장으로 구성합니다.</p>
        </div>
        <Button
          kind="primary"
          disabled={
            disabled ||
            !settings.secrets?.aiKey ||
            (a.kind === 'organization' && (!briefTitle.trim() || !briefDescription.trim()))
          }
          busy={busy === 'plan'}
          onClick={generatePlan}
        >
          <Sparkles size={17} />
          {a.kind === 'organization' ? 'AI 초안 다시 만들기' : 'AI 구성안 추천'}
        </Button>
      </div>
      {dirty && <div className="warning">기획안 변경 사항을 먼저 저장해 주세요.</div>}
      {p?.stale && (
        <div className="warning">
          기획안이 변경되었습니다. 홍보 문구와 이미지의 날짜·장소를 검토하고 다시 저장해 주세요.
        </div>
      )}
      <div className="promotion-layout">
        <fieldset disabled={disabled} className="panel form-panel">
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
                {i === 0 && s.role === 'cover' ? '01 표지' : String(i + 1).padStart(2, '0')}
              </button>
            ))}
          </div>
          <div className="content-fields">
            <Field label={slide.role === 'cover' ? '표지 제목' : '이 장의 제목'}>
              <input
                value={slide.title}
                maxLength={100}
                onChange={(e) => changeSlide('title', e.target.value)}
              />
            </Field>
            <Field
              label={slide.role === 'cover' ? '표지 소개 문구' : '본문'}
              hint={
                slide.role === 'cover'
                  ? '표지는 짧은 제목과 한두 줄 소개로 구성하세요. 상세 안내는 다음 장에 작성합니다.'
                  : '읽기 쉬운 크기를 유지하도록 긴 내용은 여러 장으로 나누세요.'
              }
            >
              <textarea
                value={slide.body}
                maxLength={400}
                rows={5}
                onChange={(e) => changeSlide('body', e.target.value)}
              />
            </Field>
            <div className="inline wrap">
              <Button kind="small" disabled={index <= 1 || disabled} onClick={() => move(-1)}>
                <ChevronLeft size={15} />
                앞으로
              </Button>
              <Button
                kind="small"
                disabled={index === 0 || index === slides.length - 1 || disabled}
                onClick={() => move(1)}
              >
                뒤로
                <ChevronRight size={15} />
              </Button>
              <Button
                kind="small danger"
                disabled={index === 0 || slides.length <= 1 || disabled}
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
        </fieldset>
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
            배경 원본 색감을 유지하며 밝기에 맞춰 글자색을 적용합니다.
            <br />
            게시용 저장 시 JPEG 압축을 적용합니다.
          </p>
        </section>
      </div>
      <fieldset disabled={disabled} className="panel form-panel spaced">
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
            disabled={disabled || slides.length > 8 || !settings.secrets.r2SecretAccessKey}
            busy={busy.startsWith('render')}
            onClick={renderImages}
          >
            <ImagePlus size={17} />
            {busy.startsWith('render')
              ? busy.replace('render', '저장 중')
              : '게시용 ' + slides.length + '장 생성·저장'}
          </Button>
          <Button
            kind="primary"
            disabled={disabled || slides.length > 8}
            busy={busy === 'save'}
            onClick={save}
          >
            <Save size={17} />
            홍보 초안 저장
          </Button>
        </div>
      </fieldset>
      <section className="panel form-panel spaced">
        <div className="section-heading">
          <h2>인스타그램 게시</h2>
          {p && <Badge status={p.status} />}
        </div>
        {!instagramReady && (
          <p className="warning">
            단체 관리에서 Instagram 계정 ID, 액세스 토큰, API 버전을 저장하면 게시 버튼을 사용할 수
            있습니다. 초안과 이미지는 먼저 준비할 수 있습니다.
          </p>
        )}
        {publishError && (
          <p className="warning" role="alert">
            {publishError}
          </p>
        )}
        {p?.error && (
          <p className="warning" role="alert">
            {p.error}
          </p>
        )}
        {p?.status === 'published' && <p role="status">Instagram 게시가 완료되었습니다.</p>}
        {p?.manual && ['scheduled', 'processing'].includes(p.status) && (
          <p role="status">
            Instagram에서 이미지를 준비하고 게시하고 있습니다. 화면을 닫았다면 이 홍보물을 다시 열어
            결과를 확인해 주세요.
          </p>
        )}
        {p?.assets?.length > 0 && (
          <div className="saved-feed-preview">
            <h3>저장된 피드 미리보기</h3>
            <div className="feed-images">
              {p.assets.map((asset, i) => (
                <a key={asset.id} href={contentUrl(asset.id)} target="_blank" rel="noreferrer">
                  <img src={contentUrl(asset.id)} alt={'게시할 이미지 ' + (i + 1)} loading="lazy" />
                </a>
              ))}
            </div>
            <p className="feed-caption">
              {p.caption}
              {'\n\n'}
              {p.hashtags}
            </p>
            {changed && (
              <p className="warning">
                편집 내용이 아직 반영되지 않았습니다. 게시용 이미지와 홍보 초안을 저장한 후 확인해
                주세요.
              </p>
            )}
          </div>
        )}
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
                    const next = await api(base + '/resolve-publish', 'POST', {
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
                const next = await api(base + '/new-promotion', 'POST', {});
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
          <div>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={consentRecorded || approved}
                disabled={consentRecorded || !!busy}
                onChange={(e) => setApproved(e.target.checked)}
              />
              {consentRecorded ? '저장된 이미지와 게시글, 대상 계정에 대한 게시 동의가 완료되었습니다.' : '저장된 이미지와 게시글, 대상 계정을 확인했으며 게시에 동의합니다.'}
            </label>
            <p className="helper">
              대상 계정 ID: {(consentRecorded ? p.targetInstagramId : settings.instagramUserId) || '단체 관리에서 설정 필요'}
              <br />
              {publishBlockReason || '저장된 피드로 게시할 준비가 되었습니다.'}
            </p>
          </div>
        </div>
        <div className="inline wrap">
          <Button
            kind="primary"
            disabled={!!publishBlockReason}
            busy={busy === 'publish'}
            onClick={publish}
          >
            <Send size={17} />
            Instagram에 게시
          </Button>
          {p?.status === 'scheduled' && (
            <Button
              onClick={async () => {
                try {
                  const next = await api(base + '/unpublish', 'POST', {});
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
            disabled={!!busy}
            busy={busy === 'status'}
            onClick={async () => {
              setBusy('status');
              setPublishError('');
              try {
                const d = await refresh();
                const next = (a.kind === 'organization' ? d.promotions : d.activities).find(
                  (x) => x.id === a.id,
                );
                if (!next) throw new Error('홍보물을 찾을 수 없습니다. 목록에서 다시 확인해 주세요.');
                onSaved(next);
                const messages = {
                  published: 'Instagram 게시 완료 상태를 확인했습니다.',
                  scheduled: '게시 요청이 접수되었습니다. 이 화면에서 진행 상태를 확인합니다.',
                  processing: 'Instagram 게시 처리 중입니다.',
                  attention: '게시 결과 확인이 필요합니다. Instagram에서 실제 게시 여부를 확인해 주세요.',
                  failed: '게시 실패 상태입니다. 화면의 오류 안내를 확인해 주세요.',
                  draft: '저장된 초안입니다. 아직 게시되지 않았습니다.',
                };
                notify(messages[next.promotion?.status] || '아직 게시 요청이 없습니다.');
              } catch (e) {
                setPublishError(e.message);
              } finally {
                setBusy('');
              }
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
