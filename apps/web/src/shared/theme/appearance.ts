import type { SurfaceColor } from './surface';
import { useSurfaceStore } from './surfaceStore';
import { useThemeStore, type ReceptionTheme } from './themeStore';

export const THEME_LABELS: Record<ReceptionTheme, string> = {
  light: 'Világos',
  dark: 'Sötét',
};

// A téma és a felületszín váltása azonnal látszik, ezért nincs hozzá toast.

/** Téma váltása a felületről (fiókpanel, fejléc, Beállítások). */
export function saveTheme(theme: ReceptionTheme) {
  useThemeStore.getState().setTheme(theme);
}

/** Felületszín váltása a Beállításokban. */
export function saveSurface(surface: SurfaceColor) {
  useSurfaceStore.getState().setSurface(surface);
}
