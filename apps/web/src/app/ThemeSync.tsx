import React, { useLayoutEffect } from 'react';
import { useSurfaceStore, useThemeStore } from '@/shared/theme';

/**
 * A téma és a felületszín a `<html>`-re: `data-theme` (a sötét tokenek a body-ba portált
 * `shared/ui` elemekre is érvényesek) és `data-surface` (a paletta, `styles/index.css`). Csak
 * tokeneket állít, a régi oldalak `.reception-theme-dark` szabályait nem kapcsolja be. Az első
 * kirajzolás előtt ugyanezt az `index.html` inline scriptje teszi meg.
 */
export const ThemeSync: React.FC = () => {
  const theme = useThemeStore((state) => state.theme);
  const surface = useSurfaceStore((state) => state.surface);

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useLayoutEffect(() => {
    document.documentElement.dataset.surface = surface;
  }, [surface]);

  return null;
};
