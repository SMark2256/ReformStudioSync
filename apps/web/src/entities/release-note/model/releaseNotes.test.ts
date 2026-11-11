import { describe, expect, it } from 'vitest';
import {
  APP_RELEASE_VERSION,
  APP_VERSION,
  compareReleaseVersions,
} from '@/shared/config';
import { groupReleaseNotesByVersion } from './releaseNoteGroups';
import { RELEASE_NOTES } from './releaseNotes';

// TICKET-44: a verzió egyetlen forrása a gyökér `package.json` (Vite/Vitest `define`).
describe('Újdonságok és verziószám', () => {
  it('a package.json verziója major.minor.patch alakú', () => {
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    expect(APP_RELEASE_VERSION).toMatch(/^\d+\.\d+$/);
  });

  it('egy bejegyzés verziója sem nagyobb a package.json verziójánál', () => {
    const ahead = RELEASE_NOTES.filter(
      (note) => compareReleaseVersions(note.version, APP_RELEASE_VERSION) > 0,
    ).map((note) => `${note.id} (v${note.version})`);
    expect(ahead).toEqual([]);
  });

  it('a 0.3-tól kezdődő bejegyzéseknek van Jira kulcsa', () => {
    const missing = RELEASE_NOTES.filter(
      (note) =>
        compareReleaseVersions(note.version, '0.3') >= 0 && !note.jiraKey,
    ).map((note) => note.id);
    expect(missing).toEqual([]);
  });

  it('az azonosítók egyediek', () => {
    const ids = RELEASE_NOTES.map((note) => note.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('compareReleaseVersions', () => {
  it('számként hasonlít, nem szövegként', () => {
    expect(compareReleaseVersions('0.10', '0.9')).toBeGreaterThan(0);
    expect(compareReleaseVersions('0.3', '0.3')).toBe(0);
    expect(compareReleaseVersions('0.2', '1.0')).toBeLessThan(0);
  });
});

describe('groupReleaseNotesByVersion', () => {
  it('verziónként csoportosít, a legújabb verzió elöl', () => {
    const groups = groupReleaseNotesByVersion(RELEASE_NOTES);
    const versions = groups.map((g) => g.version);
    expect(versions).toEqual(
      [...versions].sort((a, b) => compareReleaseVersions(b, a)),
    );
    for (const version of ['0.3', '0.2', '0.1']) {
      expect(versions).toContain(version);
    }
    expect(groups.reduce((sum, g) => sum + g.notes.length, 0)).toBe(
      RELEASE_NOTES.length,
    );
  });
});
