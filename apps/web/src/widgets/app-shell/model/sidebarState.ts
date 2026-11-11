import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Oldalsáv (UI-specifikáció 4.1, 9.): 236 px nyitva, 64 px ikonsáv. 1280 px-től alapból nyitva,
// alatta ikonsáv; a felhasználó választása sávonként (keskeny / széles) mentődik.
export const SIDEBAR_EXPANDED_WIDTH = 236;
export const SIDEBAR_COLLAPSED_WIDTH = 64;
const WIDE_QUERY = '(min-width: 1280px)';

type SidebarBand = 'compact' | 'wide';
type SidebarMode = 'collapsed' | 'expanded';
type SidebarModes = Partial<Record<SidebarBand, SidebarMode>>;

interface SidebarPreferencesState {
  modes: SidebarModes;
  setCollapsed: (band: SidebarBand, collapsed: boolean) => void;
}

const useSidebarPreferences = create<SidebarPreferencesState>()(
  persist(
    (set) => ({
      modes: {},
      setCollapsed: (band, collapsed) =>
        set((state) => ({
          modes: { ...state.modes, [band]: collapsed ? 'collapsed' : 'expanded' },
        })),
    }),
    {
      name: 'reform_studio_sidebar',
      version: 1,
      partialize: (state) => ({ modes: state.modes }),
      // 0. változat (TICKET-21): egy közös `open` minden szélességre; mindkét sávra átvesszük.
      migrate: (persisted) => {
        const open = (persisted as { open?: boolean | null } | undefined)?.open;
        if (typeof open !== 'boolean') return { modes: {} };
        const mode: SidebarMode = open ? 'expanded' : 'collapsed';
        return { modes: { compact: mode, wide: mode } };
      },
    },
  ),
);

let wideQueryList: MediaQueryList | undefined;
const getWideQueryList = () => (wideQueryList ??= window.matchMedia(WIDE_QUERY));

function subscribeWide(onChange: () => void) {
  const mql = getWideQueryList();
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}

function useSidebarBand(): SidebarBand {
  const isWide = useSyncExternalStore(
    subscribeWide,
    () => getWideQueryList().matches,
    () => true,
  );
  return isWide ? 'wide' : 'compact';
}

/** Az aktuális sáv (keskeny / széles) összecsukott állapota; a Beállítások kapcsolója is ez. */
export function useSidebarCollapsed() {
  const band = useSidebarBand();
  const mode = useSidebarPreferences((state) => state.modes[band]);
  const setBandCollapsed = useSidebarPreferences((state) => state.setCollapsed);
  const collapsed = mode ? mode === 'collapsed' : band === 'compact';
  const setCollapsed = useCallback(
    (next: boolean) => setBandCollapsed(band, next),
    [band, setBandCollapsed],
  );
  return { band, collapsed, setCollapsed };
}

/**
 * Az asztali oldalsáv állapota: a mentett elrendezés (nyitva / ikonsáv) és az ikonsáv
 * ideiglenes kinyitása egér vagy billentyűzetes fókusz hatására (peek), amely a tartalom fölött
 * nyílik, és a tartalmat nem tolja el.
 */
export function useSidebarState() {
  const { band, collapsed, setCollapsed } = useSidebarCollapsed();
  const [isPeeked, setIsPeeked] = useState(false);
  const isLayoutExpanded = !collapsed;

  // Sávváltáskor (ablakméret) a peek bezárul.
  useEffect(() => setIsPeeked(false), [band]);

  const setPeeked = useCallback(
    (open: boolean) => setIsPeeked(isLayoutExpanded ? false : open),
    [isLayoutExpanded],
  );

  const togglePinned = useCallback(() => {
    setIsPeeked(false);
    setCollapsed(isLayoutExpanded);
  }, [isLayoutExpanded, setCollapsed]);

  return {
    isLayoutExpanded,
    isVisuallyExpanded: isLayoutExpanded || isPeeked,
    layoutWidth: isLayoutExpanded
      ? SIDEBAR_EXPANDED_WIDTH
      : SIDEBAR_COLLAPSED_WIDTH,
    setPeeked,
    togglePinned,
  };
}
