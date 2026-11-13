import { ALL_TOURS, TourEventDto } from '@reform/shared';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api } from '@/shared/api';
import { findTarget, type Tour, type TourStep } from '../config/tours';

type LoadStatus = 'loading' | 'ready';

interface TourStoreState {
  /**
   * Fiókonként a látott bemutatók: a szerverről betöltve, plusz a helyben látottak. Helyi
   * gyorsítótár is: a szerver válasza előtt és nélküle (hálózati hiba) is ebből dolgozunk.
   */
  seenByAccount: Record<string, string[]>;
  /** Melyik fiók állapotát kértük már le ebben a munkamenetben (nem tárolódik). */
  status: Record<string, LoadStatus>;
  /** A futó bemutató (a felajánlás és a fejléc „?” gombja indítja). */
  active: { tourId: string; steps: TourStep[] } | null;
  load: (account: string) => void;
  /** Bezárta (végignézte, kihagyta, vagy a felajánlást elvetette); `step`: ahol bezárta. */
  markSeen: (account: string, tourId: string, step: number) => void;
  /** „Többet ne mutass bemutatót”. */
  markAllSeen: (account: string) => void;
  /** A bemutató indítása (ha nem fut már egy); a most nem látható célpontú lépések kimaradnak. */
  start: (tour: Tour) => void;
  stop: () => void;
}

// Ebben a munkamenetben látottak: a szerver válasza (ami még nem tartalmazhatja őket) mellé.
const sessionSeen = new Map<string, Set<string>>();

// A mentés nem zavarja a felhasználót: a helyi állapot azonnal frissül, a hiba csendes.
const send = (event: TourEventDto) => {
  void api.recordTourEvent(event).catch(() => undefined);
};

const withId = (list: string[] | undefined, id: string) =>
  list?.includes(id) ? list : [...(list ?? []), id];

export const useTourStore = create<TourStoreState>()(
  persist(
    (set, get) => {
      const add = (account: string, id: string) => {
        sessionSeen.set(
          account,
          new Set(sessionSeen.get(account)).add(id),
        );
        set((state) => ({
          seenByAccount: {
            ...state.seenByAccount,
            [account]: withId(state.seenByAccount[account], id),
          },
        }));
      };
      const setStatus = (account: string, status: LoadStatus) =>
        set((state) => ({ status: { ...state.status, [account]: status } }));

      return {
        seenByAccount: {},
        status: {},
        active: null,
        load: (account) => {
          if (get().status[account]) return;
          setStatus(account, 'loading');
          void api
            .getTourState()
            .then(({ seen }) => {
              const local = [...(sessionSeen.get(account) ?? [])];
              set((state) => ({
                seenByAccount: {
                  ...state.seenByAccount,
                  [account]: [...new Set([...seen, ...local])],
                },
              }));
            })
            .catch(() => undefined)
            .finally(() => setStatus(account, 'ready'));
        },
        markSeen: (account, tourId, step) => {
          add(account, tourId);
          send({ kind: 'seen', id: tourId, step });
        },
        markAllSeen: (account) => {
          add(account, ALL_TOURS);
          send({ kind: 'all' });
        },
        start: (tour) => {
          if (get().active) return;
          const steps = tour.steps.filter(
            (step) => !step.target || findTarget(step.target),
          );
          if (steps.length > 0) set({ active: { tourId: tour.id, steps } });
        },
        stop: () => {
          if (get().active) set({ active: null });
        },
      };
    },
    {
      name: 'reform-studio-tours',
      partialize: (state) => ({ seenByAccount: state.seenByAccount }),
    },
  ),
);

/** Látta-e már a fiók a bemutatót (vagy kérte, hogy többet ne mutassunk). */
export const isTourSeen = (seen: string[] | undefined, tourId: string) =>
  !!seen && (seen.includes(ALL_TOURS) || seen.includes(tourId));
