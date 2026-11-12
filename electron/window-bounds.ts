export interface Bounds { x: number; y: number; width: number; height: number }
export function restoreBounds(saved: Partial<Bounds> | null, areas: Bounds[]): Bounds {
  const primary = areas[0] || { x: 0, y: 0, width: 1280, height: 860 };
  const size = (value: unknown, fallback: number) => typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value) : fallback;
  const candidate = { x: typeof saved?.x === 'number' && Number.isFinite(saved.x) ? saved.x : primary.x + (primary.width - 1280) / 2,
    y: typeof saved?.y === 'number' && Number.isFinite(saved.y) ? saved.y : primary.y + (primary.height - 860) / 2,
    width: size(saved?.width, 1280), height: size(saved?.height, 860) };
  const intersect = (area: Bounds) => Math.max(0, Math.min(candidate.x + candidate.width, area.x + area.width) - Math.max(candidate.x, area.x)) *
    Math.max(0, Math.min(candidate.y + candidate.height, area.y + area.height) - Math.max(candidate.y, area.y));
  const visible = areas.filter((area) => intersect(area) >= 80 * 40).sort((a, b) => intersect(b) - intersect(a));
  const area = visible[0] || primary;
  const width = Math.min(area.width, Math.max(960, candidate.width)), height = Math.min(area.height, Math.max(640, candidate.height));
  const x = visible.length ? Math.max(area.x, Math.min(candidate.x, area.x + area.width - width)) : area.x + (area.width - width) / 2;
  const y = visible.length ? Math.max(area.y, Math.min(candidate.y, area.y + area.height - height)) : area.y + (area.height - height) / 2;
  return { x: Math.round(x), y: Math.round(y), width, height };
}
