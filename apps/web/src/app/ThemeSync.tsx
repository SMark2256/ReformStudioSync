import React, { useLayoutEffect } from 'react';
import { applyAccent, useAccentStore, useThemeStore } from '@/shared/theme';

/**
 * A téma és a kiemelő szín a `<html>`-re: `data-theme` (a sötét tokenek a body-ba portált
 * `shared/ui` elemekre is érvényesek) és a `--primary`/`--primary-foreground` változó. Csak
 * tokeneket állít, a régi oldalak `.reception-theme-dark` szabályait nem kapcsolja be.
 */
export const ThemeSync: React.FC = () => {
  const theme = useThemeStore((state) => state.theme);
  const accent = useAccentStore((state) => state.accent);

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useLayoutEffect(() => {
    applyAccent(accent);
  }, [accent]);

  return null;
};
