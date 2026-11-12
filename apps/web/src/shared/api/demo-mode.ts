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

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1']);

/**
 * Tesztkörnyezet (TICKET-49): itt látszanak a recepció tesztkártyái. A demó preview
 * (`demo-…workers.dev`) valódi API-val fut, nem Demó módban, de a seed ugyanazokat a
 * tesztvendégeket tartalmazza, ezért ott is.
 *
 * Tesztkörnyezet, ha
 * - Demó mód van (`isDemoMode()`), vagy
 * - a host `demo-`-val kezdődik (Cloudflare demó preview), vagy
 * - `localhost` / `127.0.0.1` (helyi fejlesztés).
 *
 * Élesben (`reformstudiosync.…workers.dev`) hamis.
 */
export function isTestEnvironment(hostname?: string): boolean {
  if (isDemoMode()) return true;
  const host =
    hostname ?? (typeof window === 'undefined' ? '' : window.location.hostname);
  return host.startsWith('demo-') || LOCAL_HOSTNAMES.has(host);
}
