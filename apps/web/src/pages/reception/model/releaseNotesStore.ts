import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { countUnseenReleaseNotes } from './releaseNotes';

interface ReleaseNotesState {
  seenIds: string[];
  markSeen: (ids: string[]) => void;
}

export const useReleaseNotesStore = create<ReleaseNotesState>()(
  persist(
    (set, get) => ({
      seenIds: [],
      markSeen: (ids) => {
        const merged = Array.from(new Set([...get().seenIds, ...ids]));
        if (merged.length !== get().seenIds.length) set({ seenIds: merged });
      },
    }),
    {
      name: 'reform_studio_release_notes_seen',
    },
  ),
);

/** Olvasatlan újdonságok száma (az Újdonságok menüpont számlálója). */
export const useUnseenReleaseNotesCount = (): number =>
  useReleaseNotesStore((s) => countUnseenReleaseNotes(s.seenIds));
