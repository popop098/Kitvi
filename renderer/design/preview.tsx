import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Badge } from '@astryxdesign/core/Badge';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Switch } from '@astryxdesign/core/Switch';
import { ArrowUpRight, Check, Maximize2, Minimize2, Minus, Moon, Sun, X } from 'lucide-react';
import type { Appearance } from '../../shared/contracts.ts';
import { AstryxProvider } from './AstryxProvider.tsx';
import './preview.css';

const componentNames = ['Button', 'Card', 'Badge', 'TextInput', 'Switch'];
function DesignPreview() {
  const [appearance, setAppearance] = useState<Appearance>(document.documentElement.dataset.appearance === 'dark' ? 'dark' : 'light');
  const [maximized, setMaximized] = useState(false);
  const [query, setQuery] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [feedback, setFeedback] = useState('버튼과 입력 요소를 조작해 보세요.');
  const [error, setError] = useState<string | null>(null);
  const api = window.kitvi;
  const fail = () => setError('창 설정을 저장하지 못했어요. 다시 시도해 주세요.');
  useEffect(() => {
    void api.getWindow().then((info) => setMaximized(info.maximized)).catch(fail);
    return api.onWindow((info) => setMaximized(info.maximized));
  }, [api]);
  async function changeAppearance() {
    const next = appearance === 'light' ? 'dark' : 'light';
    try {
      await api.setAppearance(next);
      document.documentElement.dataset.appearance = next;
      setAppearance(next); setError(null);
    } catch { fail(); }
  }
  return <AstryxProvider appearance={appearance}>
    <div className={`workbench${maximized ? ' is-maximized' : ''}`}>
      <header className="workbench-header">
        <div className="workbench-brand"><img className="workbench-brand-icon" src="kitvi-icon.png" width="30" height="30" alt="" draggable={false} /><strong>Kitvi</strong><span>0.6.0</span></div>
        <span className="header-context">디자인 작업실</span>
        <div className="header-controls">
          <button className="appearance-control" aria-label={appearance === 'light' ? '다크 모드로 전환' : '화이트 모드로 전환'} title="화면 모드 전환" onClick={() => void changeAppearance()}>
            {appearance === 'light' ? <Moon size={18} /> : <Sun size={18} />}
          </button>
          <div className="window-controls">
            <button aria-label="최소화" title="최소화" onClick={() => void api.minimize().catch(fail)}><Minus size={16} /></button>
            <button aria-label={maximized ? '복원' : '최대화'} title={maximized ? '복원' : '최대화'} onClick={() => void api.toggleMaximize().catch(fail)}>{maximized ? <Minimize2 size={15} /> : <Maximize2 size={15} />}</button>
            <button className="close-control" aria-label="닫기" title="닫기" onClick={() => void api.close().catch(fail)}><X size={18} /></button>
          </div>
        </div>
      </header>
      <main className="workbench-body">
        <div className="page-intro">
          <div><p className="eyebrow">ASTRYX / NEUTRAL</p><h1>디자인 작업실</h1><p className="intro-copy">PC 상태 대시보드에 적용할 글자, 표면과 조작 요소를 살펴보세요.</p></div>
          <Badge label="컴포넌트 미리보기" />
        </div>
        <div className="preview-notice"><span className="notice-rule" /><p>디자인을 확인하는 별도 화면이에요. PC 정보는 수집하지 않아요.</p></div>
        {error && <p className="error-notice" role="alert">{error}</p>}
        <div className="workbench-grid">
          <section aria-labelledby="type-title" className="typography-section">
            <div className="section-heading"><span>01</span><h2 id="type-title">읽기 쉬운 정보</h2></div>
            <Card padding={6} className="type-card">
              <span className="sample-label">PRETENDARD VARIABLE</span>
              <p className="type-heading">내 PC를 한눈에.</p>
              <p className="type-body">지금 필요한 상태는 또렷하게,<br />자세한 정보는 차분하게 정리해요.</p>
              <div className="number-sample"><span>0123456789</span><small>숫자 너비를 일정하게</small></div>
              <div className="type-specs"><span>본문 16 px</span><span>설명 14 px 이상</span><span>행간 1.5</span></div>
            </Card>
            <div className="section-heading palette-heading"><span>02</span><h2>조용한 표면과 분명한 상태</h2></div>
            <div className="palette" aria-label="Neutral 테마 색상">
              <div><span className="swatch canvas-swatch" /><strong>바탕</strong><small>Body</small></div>
              <div><span className="swatch surface-swatch" /><strong>표면</strong><small>Surface</small></div>
              <div><span className="swatch ink-swatch" /><strong>강조</strong><small>Accent</small></div>
              <div><span className="swatch coral-swatch" /><strong>코랄 제안</strong><small>Kitvi</small></div>
            </div>
            <p className="supporting-copy">Neutral을 기본으로 사용하고, 코랄은 브랜드 강조색으로 검토해요.</p>
          </section>
          <section aria-labelledby="controls-title">
            <div className="section-heading"><span>03</span><h2 id="controls-title">실제로 조작해 보기</h2></div>
            <Card padding={6} className="controls-card">
              <div className="control-group"><h3>버튼</h3><div className="button-row">
                <Button label="기본 동작" variant="primary" size="lg" onClick={() => setFeedback('기본 버튼을 눌렀어요.')} />
                <Button label="보조 동작" size="lg" onClick={() => setFeedback('보조 버튼을 눌렀어요.')} />
                <Button label="사용 불가" size="lg" isDisabled />
              </div></div>
              <div className="control-group">
                <TextInput label="컴포넌트 검색" type="search" size="lg" value={query} onChange={setQuery} hasClear placeholder="Button, Switch…" />
                <p className="search-results" aria-live="polite">{componentNames.filter((name) => name.toLowerCase().includes(query.toLowerCase().trim())).join(' · ') || '일치하는 컴포넌트가 없어요.'}</p>
              </div>
              <div className="control-group switch-group"><Switch label="설정 스위치 예시" description="미리보기 안에서만 변경돼요." value={enabled} onChange={setEnabled} /><span>{enabled ? '켜짐' : '꺼짐'}</span></div>
              <div className="control-group"><h3>상태 표현 예시</h3><div className="badge-row"><Badge label="준비됨" variant="success" /><Badge label="확인 필요" variant="warning" /><Badge label="조회 실패" variant="error" /><Badge label="정보 없음" /></div></div>
              <p className="feedback" role="status"><Check size={16} aria-hidden="true" />{feedback}</p>
            </Card>
          </section>
        </div>
        <section className="migration-summary" aria-labelledby="migration-title">
          <div><p className="eyebrow">다음 디자인 단계</p><h2 id="migration-title">같은 기능, 새로 정돈한 화면</h2></div>
          <ol><li><span>1</span>헤더 · 하드웨어 요약</li><li><span>2</span>CPU · 메모리 · GPU 그래프</li><li><span>3</span>저장공간 · 모니터 · 장치</li></ol>
          <ArrowUpRight size={22} aria-hidden="true" />
        </section>
        <footer className="workbench-footer"><span>Astryx 0.7.14 · Neutral · 로컬 Pretendard</span><span>디자인 계획은 docs/astryx-design-plan.md에서 확인할 수 있어요.</span></footer>
      </main>
    </div>
  </AstryxProvider>;
}

class PreviewBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <main className="preview-failure"><h1>미리보기를 불러오지 못했어요</h1><p>다시 불러오거나 창을 닫아 주세요.</p><button onClick={() => window.location.reload()}>다시 불러오기</button><button onClick={() => void window.kitvi.close()}>닫기</button></main> : this.props.children;
  }
}
createRoot(document.getElementById('root')!).render(<PreviewBoundary><DesignPreview /></PreviewBoundary>);

