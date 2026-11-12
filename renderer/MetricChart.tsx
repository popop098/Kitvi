import React from 'react';
import { Card } from '@astryxdesign/core/Card';
import { Activity, CircuitBoard, Cpu } from 'lucide-react';
import type { MetricSample, Reading } from '../shared/contracts.ts';
import { linePath } from '../shared/history.ts';
import { formatPercent } from '../shared/format.ts';
export function MetricChart({ kind, label, detail, toolbar, reading, samples, value, now, stale }: {
  kind: 'cpu' | 'memory' | 'gpu'; label: string; detail?: string; toolbar?: React.ReactNode; reading?: Reading; samples: MetricSample[]; value: (sample: MetricSample) => number | null; now: number; stale: boolean;
}) {
  const Icon = kind === 'cpu' ? Cpu : kind === 'memory' ? CircuitBoard : Activity;
  const path = linePath(samples, value, now);
  const last = samples.at(-1); const current = !stale ? reading?.value ?? null : null;
  const labelText = stale ? '갱신 지연' : reading?.status === 'loading' || !reading ? '수집 중' : reading.status === 'ready' ? '현재 사용률' : '제공되지 않음';
  return <Card className={`metric-chart metric-${kind}`} padding={0} role="region" aria-label={`${label} 사용률`}>
    <div className="metric-heading"><span><Icon size={18} aria-hidden="true" /><h2>{label}</h2></span>{toolbar}</div>
    <p className="metric-detail">{detail}</p>
    <div className="metric-value-row"><div className="metric-number">{formatPercent(current)}</div><span className="metric-state">{labelText}</span></div>
    <div className="plot"><div className="plot-axis" aria-hidden="true"><span>100%</span><span>50%</span><span>0%</span></div><svg viewBox="0 -3 600 126" preserveAspectRatio="none" role="img" aria-label={`${label}, 최근 60초 사용률. 측정하지 못한 구간은 비워서 표시합니다.`}>
      {[0, 60, 120].map((y) => <line key={y} x1="0" x2="600" y1={y} y2={y} className="plot-grid" />)}
      <path d={path} className="plot-line" />
      {last && last.at >= now - 2500 && value(last) != null && <circle cx={Math.min(600, Math.max(0, (last.at - now + 60000) / 100))} cy={(1 - Math.max(0, Math.min(100, value(last)!)) / 100) * 120} r="3" className="plot-dot" />}
    </svg>{!path && <span className="plot-empty">{reading?.status === 'unavailable' ? '이 PC에서 사용률을 제공하지 않아요' : '측정값을 기다리고 있어요'}</span>}</div>
    <div className="plot-labels"><span>60초 전</span><span>현재</span></div>
  </Card>;
}
