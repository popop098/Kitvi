import type { Appearance } from '../shared/contracts.ts';
import type { ThemeCatalogEntry, ThemeSectionId } from '../shared/themes.ts';

export const defaultSections: ThemeSectionId[] = ['summary', 'performance', 'storage', 'displays', 'devices', 'bgm'];
export const pretendardFamily = "'Pretendard Variable', Pretendard, 'Segoe UI', sans-serif";
export const themeFontFamily = (entry: ThemeCatalogEntry) => `KitviTheme_${entry.contentHash.slice(0, 24)}`;
export const themeAssetUrl = (entry: ThemeCatalogEntry, path: string) => `kitvi-plugin://${encodeURIComponent(entry.pluginId)}/${path.split('/').map(encodeURIComponent).join('/')}?v=${encodeURIComponent(entry.contentHash)}`;

/** Only validated semantic values become host properties; theme packages cannot supply CSS. */
export function themeStyle(entry: ThemeCatalogEntry | null, appearance: Appearance): Record<string, string | number> {
  if (!entry) return {};
  const { definition } = entry, colors = definition.modes[appearance];
  const family = definition.typography?.fontFamily === 'system' ? "'Segoe UI', system-ui, sans-serif" : definition.typography?.fontFamily === 'custom' ? `'${themeFontFamily(entry)}', ${pretendardFamily}` : pretendardFamily;
  const style: Record<string, string | number> = {
    '--canvas':colors.canvas, '--panel':colors.panel, '--surface':colors.surface,
    '--ink':colors.text, '--muted':colors.muted, '--line':colors.border,
    '--accent':colors.accent, '--accent-soft':colors.accentSoft,
    '--color-background-body':colors.canvas, '--color-background-surface':colors.panel, '--color-background-muted':colors.surface,
    '--color-background-card':colors.panel, '--color-background-popover':colors.panel,
    '--color-text-primary':colors.text, '--color-text-secondary':colors.muted, '--color-border':colors.border,
    '--color-text-accent':colors.accent, '--color-text-disabled':colors.muted, '--color-border-emphasized':colors.border,
    '--color-icon-primary':colors.text, '--color-icon-secondary':colors.muted, '--color-icon-accent':colors.accent, '--color-icon-disabled':colors.muted,
    '--color-accent':colors.accent, '--color-on-accent':colors.accentText, '--color-accent-muted':colors.accentSoft, '--color-neutral':colors.surface,
    '--chart-cpu':colors.cpu, '--chart-memory':colors.memory, '--chart-gpu':colors.gpu,
    '--font-family-body':family, '--font-family-heading':family,
    '--theme-font-scale':(definition.typography?.baseSize ?? 16) / 16,
    '--font-size-base':`${definition.typography?.baseSize ?? 16}px`,
    '--font-size-sm':`${14 * (definition.typography?.baseSize ?? 16) / 16}px`, '--font-size-xs':`${14 * (definition.typography?.baseSize ?? 16) / 16}px`, '--font-size-lg':`${18 * (definition.typography?.baseSize ?? 16) / 16}px`,
  };
  if (definition.shape?.radius != null) {
    style['--theme-radius'] = `${definition.shape.radius}px`;
    style['--radius-container'] = `${definition.shape.radius}px`;
    style['--radius-element'] = `${Math.max(0, definition.shape.radius - 4)}px`;
    style['--radius-inner'] = `${Math.max(0, definition.shape.radius - 8)}px`;
  }
  if (definition.shape?.spacing != null) style['--theme-spacing-scale'] = definition.shape.spacing;
  if (definition.background) {
    style['--theme-background'] = `url("${themeAssetUrl(entry, definition.background.asset)}")`;
    style['--theme-background-opacity'] = definition.background.opacity;
    style['--theme-background-fit'] = definition.background.fit;
  }
  return style;
}

export function dashboardLayout(entry: ThemeCatalogEntry | null) {
  const layout = entry?.definition.layout;
  const order = [...(layout?.order ?? []), ...defaultSections.filter(id => !layout?.order.includes(id))].filter(id => !layout?.hidden.includes(id));
  return { order, columns:layout?.columns ?? 2, custom:!!layout };
}

export interface ViewportRect { x: number; y: number; width: number; height: number }
export function viewportWithinClips(rect: ViewportRect, clips: ViewportRect[], modalOpen: boolean) {
  return !modalOpen && rect.width >= 200 && rect.height >= 200 && clips.every(clip => rect.x >= clip.x && rect.y >= clip.y && rect.x + rect.width <= clip.x + clip.width && rect.y + rect.height <= clip.y + clip.height);
}
