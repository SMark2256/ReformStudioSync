import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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
