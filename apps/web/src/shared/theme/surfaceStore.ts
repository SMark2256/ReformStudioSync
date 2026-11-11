import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  DEFAULT_SURFACE,
  isSurfaceColor,
  surfaceFromLegacyAccent,
  type SurfaceColor,
} from './surface';

// A felületszín ezen a gépen mentődik (localStorage). Az alkalmazás az `app` rétegben teszi a
// `<html>`-re (`ThemeSync`), az első kirajzolás előtt az `index.html` inline scriptje.
export const SURFACE_STORAGE_KEY = 'reform_studio_surface';
const LEGACY_ACCENT_STORAGE_KEY = 'reform_studio_accent';

// Első indításkor a korábbi kiemelő szín (hexa) a megfelelő palettára fordul.
function readLegacySurface(): SurfaceColor {
  try {
    const stored = window.localStorage.getItem(LEGACY_ACCENT_STORAGE_KEY);
    if (!stored) return DEFAULT_SURFACE;
    return surfaceFromLegacyAccent(JSON.parse(stored)?.state?.accent);
  } catch {
    return DEFAULT_SURFACE;
  }
}

interface SurfaceState {
  surface: SurfaceColor;
  setSurface: (surface: SurfaceColor) => void;
}

export const useSurfaceStore = create<SurfaceState>()(
  persist(
    (set) => ({
      surface: readLegacySurface(),
      setSurface: (surface) => {
        if (isSurfaceColor(surface)) set({ surface });
      },
    }),
    {
      name: SURFACE_STORAGE_KEY,
      // Sérült vagy ismeretlen mentett érték helyett az alapértelmezett.
      merge: (persisted, current) => {
        const surface = (persisted as Partial<SurfaceState> | undefined)
          ?.surface;
        return isSurfaceColor(surface) ? { ...current, surface } : current;
      },
    },
  ),
);
