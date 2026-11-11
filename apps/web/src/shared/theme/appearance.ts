import { notify } from '@/shared/lib/notify';
import { getSurfaceName, type SurfaceColor } from './surface';
import { useSurfaceStore } from './surfaceStore';
import { useThemeStore, type ReceptionTheme } from './themeStore';

export const THEME_LABELS: Record<ReceptionTheme, string> = {
  light: 'Világos',
  dark: 'Sötét',
};

// Egy közös „Megjelenés mentve” toast a témához és a felületszínhez: gyors egymás utáni
// váltásnál ugyanaz frissül, nem halmozódik.
const APPEARANCE_TOAST_ID = 'appearance-saved';

function notifyAppearanceSaved(detail: string) {
  notify.success('Megjelenés mentve', detail, { id: APPEARANCE_TOAST_ID });
}

/** Téma váltása a felületről (fiókpanel, fejléc, Beállítások), visszajelzéssel. */
export function saveTheme(theme: ReceptionTheme) {
  useThemeStore.getState().setTheme(theme);
  notifyAppearanceSaved(`Téma: ${THEME_LABELS[theme]}`);
}

/** Felületszín váltása a Beállításokban, visszajelzéssel. */
export function saveSurface(surface: SurfaceColor) {
  useSurfaceStore.getState().setSurface(surface);
  notifyAppearanceSaved(`Felületszín: ${getSurfaceName(surface)}`);
}
