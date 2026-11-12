import React, { useEffect, useMemo, useState } from 'react';
import { Badge } from '@astryxdesign/core/Badge';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Boxes, HardDrive, Monitor, Search } from 'lucide-react';
import type { CollectionInfo, DeviceInfo, DisplayInfo, DriveInfo } from '../shared/contracts.ts';
import { formatBytes } from '../shared/format.ts';
import { collectionFreshness } from '../shared/freshness.ts';
function PanelHead({ icon, title, count }: { icon: React.ReactNode; title: string; count?: number }) {
  return <div className="panel-heading"><div>{icon}<h2>{title}</h2>{count != null && <span className="count">{count}</span>}</div></div>;
}
function Empty({ state, children }: { state?: CollectionInfo; children: React.ReactNode }) {
  return <p className="panel-empty">{!state || state.status === 'loading' ? '정보를 불러오고 있어요.' : state.status === 'error' ? '정보를 가져오지 못했어요. 새로고침해 주세요.' : children}</p>;
}
function UpdateNotice({ info, now, maxAge = 45000 }: { info?: CollectionInfo; now: number; maxAge?: number }) {
  const freshness = collectionFreshness(info, now, maxAge);
  return freshness === 'error' || freshness === 'stale' ? <p className="section-warning">{info?.updatedAt ? '마지막으로 확인한 정보예요. 갱신이 지연되고 있어요.' : 'Windows에서 정보를 읽지 못했어요.'}</p> : null;
}
export function StoragePanel({ drives, info, now }: { drives: DriveInfo[]; info?: CollectionInfo; now: number }) {
  return <section className="panel storage-panel"><PanelHead icon={<HardDrive size={19} />} title="저장공간" count={info?.status === 'ready' ? drives.length : undefined} /><UpdateNotice info={info} now={now} maxAge={15000} />
    {!drives.length ? <Empty state={info}>표시할 드라이브가 없어요.</Empty> : <div className="drive-list">{drives.map((drive) => {
      const percent = drive.totalBytes && drive.usedBytes != null ? Math.max(0, Math.min(100, drive.usedBytes / drive.totalBytes * 100)) : null;
      return <div className="drive" key={drive.id}><div className="drive-heading"><div><strong>{drive.name}</strong><span title={drive.label}>{drive.label}</span></div><strong className={percent != null && percent >= 90 ? 'warning-text' : ''}>{percent == null ? '—' : `${Math.round(percent)}%`}</strong></div><div className={`capacity-track ${percent != null && percent >= 90 ? 'almost-full' : ''}`} role="meter" aria-label={`${drive.name} 사용량`} aria-valuenow={percent ?? undefined} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${percent ?? 0}%` }} /></div><div className="drive-meta"><span>{formatBytes(drive.usedBytes)} / {formatBytes(drive.totalBytes)}</span><span>남음 {formatBytes(drive.freeBytes)}</span></div></div>;
    })}</div>}
  </section>;
}
export function DisplaysPanel({ displays, info, now }: { displays: DisplayInfo[]; info?: CollectionInfo; now: number }) {
  return <section className="panel displays-panel"><PanelHead icon={<Monitor size={19} />} title="디스플레이" count={info?.status === 'ready' ? displays.length : undefined} /><UpdateNotice info={info} now={now} />
    {!displays.length ? <Empty state={info}>표시할 디스플레이가 없어요.</Empty> : <div className="display-list">{displays.map((display) => <div className="display-row" key={display.id}><span className="monitor-glyph" aria-hidden="true"><Monitor size={32} strokeWidth={1.4} /></span><div><div className="display-name"><strong>{display.name || '모델 정보 없음'}</strong>{display.primary && <Badge className="primary-label" label="메인" />}</div><p>{display.width && display.height ? `${display.width.toLocaleString()} × ${display.height.toLocaleString()}` : '해상도 정보 없음'}<span className="text-separator">·</span>{display.refreshRate ? `${display.refreshRate.toLocaleString('ko-KR', { maximumFractionDigits: 2 })} Hz` : '주사율 정보 없음'}</p></div></div>)}</div>}
  </section>;
}
export function DevicesPanel({ devices, info, now }: { devices: DeviceInfo[]; info?: CollectionInfo; now: number }) {
  const [search, setSearch] = useState(''), [type, setType] = useState('all');
  const types = useMemo(() => [...new Set(devices.map((item) => item.type))].sort((a, b) => a.localeCompare(b, 'ko')), [devices]);
  useEffect(() => { if (type !== 'all' && !types.includes(type)) setType('all'); }, [types, type]);
  const filtered = useMemo(() => devices.filter((item) => (type === 'all' || item.type === type) && `${item.name} ${item.type} ${item.manufacturer || ''}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())), [devices, search, type]);
  return <section className="panel devices-panel"><div className="device-top"><div><PanelHead icon={<Boxes size={19} />} title="장치" count={info?.status === 'ready' ? devices.length : undefined} /><p className="supporting">Windows가 현재 인식한 장치와 상태예요.</p></div><div className="device-filters"><TextInput label="장치 검색" isLabelHidden type="search" size="lg" value={search} onChange={setSearch} placeholder="장치 검색" startIcon={<Search size={17} aria-hidden="true" />} hasClear containerClassName="device-search-field" controlClassName="device-search" /><select aria-label="장치 종류" value={type} onChange={(e) => setType(e.target.value)}><option value="all">모든 종류</option>{types.map((label) => <option key={label} value={label}>{label}</option>)}</select></div></div><UpdateNotice info={info} now={now} />
    {!devices.length ? <Empty state={info}>현재 표시할 장치가 없어요.</Empty> : <><div className="device-table-scroll" tabIndex={0} role="region" aria-label="장치 목록"><table><caption className="sr-only">종류, 장치명, 제조사, Windows 상태</caption><thead><tr><th scope="col">종류</th><th scope="col">장치명</th><th scope="col">제조사</th><th scope="col">상태</th></tr></thead><tbody>{filtered.map((device) => <tr key={device.id}><td>{device.type}</td><td className="device-name">{device.name}</td><td>{device.manufacturer || '정보 없음'}</td><td><Badge className={`device-status ${device.errorCode != null && device.errorCode > 0 ? 'has-problem' : ''}`} variant={device.errorCode != null && device.errorCode > 0 ? 'warning' : 'neutral'} label={device.status} /></td></tr>)}</tbody></table>{!filtered.length && <p className="panel-empty">검색 조건에 맞는 장치가 없어요.</p>}</div><p className="device-results">{filtered.length}개 표시{type !== 'all' || search.trim() ? ` / 전체 ${devices.length}개` : ''}</p></>}
  </section>;
}
