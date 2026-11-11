// A futó verzió (TICKET-44). Egyetlen forrása a gyökér `package.json`; a build `__APP_VERSION__`-ként
// adja át. A felületen és az Újdonságokban a kiadás verziója látszik: major.minor (`0.3`).

/** Teljes verzió a `package.json`-ból, pl. `0.3.0`. */
export const APP_VERSION: string = __APP_VERSION__;

/** `0.3.0` → `0.3`. */
export const toReleaseVersion = (version: string): string =>
  version.split('.').slice(0, 2).join('.');

/** Két kiadási verzió (`0.3`, `0.10`) számszerű összevetése; negatív, ha `a` a régebbi. */
export const compareReleaseVersions = (a: string, b: string): number => {
  const [aMajor = 0, aMinor = 0] = a.split('.').map(Number);
  const [bMajor = 0, bMinor = 0] = b.split('.').map(Number);
  return aMajor - bMajor || aMinor - bMinor;
};

/** A futó kiadás verziója, pl. `0.3` (az Újdonságok `version` mezőjével egyező alak). */
export const APP_RELEASE_VERSION = toReleaseVersion(APP_VERSION);

/** A felületen megjelenő verzió, pl. `v0.3`. */
export const APP_VERSION_LABEL = `v${APP_RELEASE_VERSION}`;
