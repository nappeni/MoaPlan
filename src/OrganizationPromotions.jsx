import React, { useState, useEffect } from 'react';
import { Plus, ChevronRight } from 'lucide-react';
import { api } from './api';
import { Button, Field, Badge } from './ui';
import PromotionEditor from './PromotionEditor';
import { readView, writeView } from './view-state';
export default function OrganizationPromotions({ data, refresh, notify }) {
  const [selected, setSelected] = useState(() => readView('promotion'));
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [suggestion, setSuggestion] = useState(null);
  const [error, setError] = useState('');
  const [entry, setEntry] = useState(() => (data.promotions || []).find((a) => a.id === selected));
  useEffect(() => {
    writeView('promotion', selected);
  }, [selected]);
  const choose = (a) => {
    setSelected(a?.id || null);
    setEntry(a);
    setCreating(false);
    setSuggestion(null);
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">ORGANIZATION PROMOTION</span>
          <h1>우리 단체를 알려보세요</h1>
          <p>이미지와 게시글을 먼저 만들고, 확인한 피드만 Instagram에 게시합니다.</p>
        </div>
        {!entry && !creating && (
          <Button kind="primary" onClick={() => setCreating(true)}>
            <Plus size={18} />
            단체 홍보 만들기
          </Button>
        )}
        {(entry || creating) && (
          <Button disabled={busy} onClick={() => choose(null)}>
            목록
          </Button>
        )}
      </div>
      {creating ? (
        <form
          className="panel form-panel"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError('');
            try {
              const saveOnly = e.nativeEvent.submitter?.value === 'save';
              const generated = saveOnly
                ? null
                : (
                    await api('/promotions/preview', 'POST', {
                      title,
                      description,
                    })
                  ).suggestion;
              const a = await api('/promotions', 'POST', { title, description });
              await refresh();
              choose(a);
              setSuggestion(generated);
              if (saveOnly)
                notify(
                  '입력 내용을 저장했습니다. AI 생성은 별도로 실행할 수 있습니다.'
                );
              setTitle('');
              setDescription('');
            } catch (e) {
              setError(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field
            label="홍보 제목"
            required
            disabled={busy}
            maxLength={100}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <Field
            label="단체 소개와 홍보 목적·컨셉"
            hint="단체 소개, 홍보 대상과 목적, 원하는 분위기·컨셉을 적어 주세요. 입력 내용을 바탕으로 AI가 이미지 문구와 게시글 초안을 만듭니다."
          >
            <textarea
              required
              disabled={busy}
              maxLength={4000}
              rows={8}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>
          {error && (
            <p className="warning" role="alert">
              {error} 입력 내용은 유지됩니다. 다시 시도해 주세요.
            </p>
          )}
          {!data.settings.secrets?.aiKey && (
            <p className="warning">단체 관리에서 AI 키와 텍스트 모델을 설정해 주세요.</p>
          )}
          <p className="helper">
            AI 생성은 API 비용이 발생합니다. 생성 결과는 검토 후 저장하며 자동으로 게시되지
            않습니다.
          </p>
          <div className="form-footer">
            <Button type="submit" value="save" disabled={busy}>
              입력 내용 저장
            </Button>
            <Button
              type="submit"
              kind="primary"
              busy={busy}
              disabled={busy || !data.settings.secrets?.aiKey}
            >
              {busy ? 'AI 초안 만드는 중' : 'AI 홍보 초안 만들기'}
            </Button>
          </div>
        </form>
      ) : entry ? (
        <>
          <PromotionEditor
            key={entry.id + (entry.promotion?.updatedAt || 'new')}
            activity={entry}
            initialSuggestion={suggestion}
            settings={data.settings}
            dirty={false}
            notify={notify}
            refresh={refresh}
            onSaved={(next) => {
              setSuggestion(null);
              setEntry(next);
            }}
          />
        </>
      ) : (
        <section className="panel activities-panel">
          {(data.promotions || []).length ? (
            <div className="activity-list">
              {[...(data.promotions || [])].reverse().map((a) => (
                <button className="activity-row" key={a.id} onClick={() => choose(a)}>
                  <div className="activity-info">
                    <h3>{a.title}</h3>
                    <p>{new Date(a.createdAt).toLocaleDateString('ko-KR')}</p>
                  </div>
                  <div className="row-end">
                    <Badge status={a.promotion?.status || 'draft'} />
                    <ChevronRight size={18} />
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="form-panel">
              <h2>첫 단체 홍보를 만들어 보세요</h2>
              <p>활동 기획 없이도 단체 소개 이미지와 게시글을 준비할 수 있습니다.</p>
            </div>
          )}
        </section>
      )}
    </>
  );
}
