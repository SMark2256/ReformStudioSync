/**
 * Demó mód: csak ilyenkor szabad hálózati hibánál a kliensoldali mock-motorra
 * (`mock-engine.ts`) visszaesni. Élesben egy kitalált adaton alapuló beléptetés,
 * levonás vagy fizetés hibás döntés lenne, ezért ott `COMMON.NETWORK` hiba jön.
 *
 * Demó mód, ha
 * - a build `VITE_DEMO_MODE=true`-val készült (helyi fejlesztés API nélkül, E2E), vagy
 * - a `/demo` sandbox oldalon vagyunk (ott a mock-adatok a lényeg).
 */
export function isDemoMode(): boolean {
  if (import.meta.env.VITE_DEMO_MODE === 'true') return true;
  if (typeof window === 'undefined') return false;
  return window.location.pathname.replace(/\/+$/, '') === '/demo';
}
