import type { ReactNode } from 'react';
import { Theme } from '@astryxdesign/core/theme';
import { neutralTheme } from '@astryxdesign/theme-neutral/built';
import type { Appearance } from '../../shared/contracts.ts';

/** Use the precompiled theme with esbuild; no runtime StyleX compilation. */
export function AstryxProvider({ appearance, children }: { appearance: Appearance; children: ReactNode }) {
  return <Theme theme={neutralTheme} mode={appearance}>{children}</Theme>;
}
