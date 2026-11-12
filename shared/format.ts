export function formatBytes(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value < 0) return '정보 없음';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const unit = value === 0 ? 0 : Math.min(4, Math.floor(Math.log(value) / Math.log(1024)));
  return `${(value / 1024 ** unit).toLocaleString('ko-KR', { maximumFractionDigits: unit < 2 ? 0 : 1 })} ${units[unit]}`;
}
export function formatPercent(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? '—' : `${value.toLocaleString('ko-KR', { maximumFractionDigits: 1 })}%`;
}
export function formatUptime(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value < 0) return '정보 없음';
  const minutes = Math.floor(value / 60), hours = Math.floor(minutes / 60), days = Math.floor(hours / 24);
  return days > 0 ? `${days}일 ${hours % 24}시간 ${minutes % 60}분` : `${hours}시간 ${minutes % 60}분`;
}
