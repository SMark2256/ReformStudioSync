import { compareReleaseVersions } from '@/shared/config';
import type { ReleaseNote } from './releaseNotes';

export interface ReleaseNoteVersionGroup {
  version: string;
  /** A verzió legfrissebb bejegyzésének dátuma (ISO). */
  date: string;
  notes: ReleaseNote[];
}

/** Verziónként csoportosít, a legújabb verzió elöl; a csoporton belül a tömb sorrendje marad. */
export const groupReleaseNotesByVersion = (
  notes: readonly ReleaseNote[],
): ReleaseNoteVersionGroup[] => {
  const groups = new Map<string, ReleaseNote[]>();
  for (const note of notes) {
    groups.set(note.version, [...(groups.get(note.version) ?? []), note]);
  }
  return Array.from(groups, ([version, items]) => ({
    version,
    date: items[0].date,
    notes: items,
  })).sort((a, b) => compareReleaseVersions(b.version, a.version));
};

/** `2026-11-11` → `2026. nov. 11.` */
export const formatReleaseNoteDate = (isoDate: string): string =>
  new Date(`${isoDate}T12:00:00`).toLocaleDateString('hu-HU', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
