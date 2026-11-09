import { AppError, toAppError } from '@reform/shared';
import type { QueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/shared/auth';
import { notify } from '../notify';

const DEFAULT_TITLE = 'Hiba történt a művelet végrehajtása közben';
const NETWORK_ERROR_TOAST_ID = 'common-network-error';
// Leállás alatt a lekérdezések újra és újra elhasalnak: a hibaüzenet és a hang
// legfeljebb ennyi időnként ismétlődjön.
const NETWORK_ERROR_THROTTLE_MS = 30_000;
let lastNetworkErrorAt = 0;

/** Vendégmonitor (kioszk, eszköztokennel fut): nincs átirányítás, nincs hálózati toast. */
const MONITOR_PATH = '/monitor';

// A bejelentkezés és a Vendégmonitor oldaláról nem irányítunk át a bejelentkezésre.
const NO_LOGIN_REDIRECT_PATHS = ['/login', MONITOR_PATH];

let queryClient: QueryClient | null = null;

// A saját onError és a globális MutationCache is meghívja a kezelőt ugyanarra a
// hibára; a frissítés hibánként egyszer fusson.
const reloadedErrors = new WeakSet<AppError>();

/** Az app indulásakor egyszer hívandó, a `reload` viselkedéshez. */
export function configureErrorHandling(options: { queryClient: QueryClient }) {
  queryClient = options.queryClient;
}

/** Kijelentkeztet és a `/login` oldalra visz; `false`, ha az aktuális oldalon ez tiltott. */
function redirectToLogin(): boolean {
  if (NO_LOGIN_REDIRECT_PATHS.includes(window.location.pathname)) return false;
  useAuthStore.getState().logout();
  window.location.assign('/login');
  return true;
}

interface HandleAppErrorOptions {
  /** A toast címe; a leírás mindig a hiba szövege. */
  title?: string;
}

/**
 * Központi hibakezelő: a hibakód viselkedése (`action`) alapján dönt.
 * - `login`: kijelentkeztetés és átirányítás a `/login` oldalra
 * - `reload`: a react-query adatok frissítése, majd hibaüzenet
 * - egyéb: hibaüzenet
 */
export function handleAppError(
  error: unknown,
  { title = DEFAULT_TITLE }: HandleAppErrorOptions = {},
): AppError {
  const appErr = toAppError(error);

  if (appErr.action === 'login' && redirectToLogin()) return appErr;

  if (appErr.action === 'reload' && !reloadedErrors.has(appErr)) {
    reloadedErrors.add(appErr);
    void queryClient?.invalidateQueries();
  }

  notify.error(title, appErr.message);
  return appErr;
}

/**
 * Lekérdezési (useQuery) hibák: a lejárt munkamenetre átirányítással reagálunk.
 * Elérhetetlen szervernél egyetlen (nem halmozódó) hibaüzenet jelenik meg, hogy
 * élesben egyértelmű legyen: az adatok nem frissek. A Vendégmonitoron nem.
 */
export function handleQueryError(error: unknown): void {
  if (isSessionError(error)) {
    redirectToLogin();
    return;
  }
  const appErr = toAppError(error);
  if (
    appErr.code !== 'COMMON.NETWORK' ||
    window.location.pathname === MONITOR_PATH ||
    Date.now() - lastNetworkErrorAt < NETWORK_ERROR_THROTTLE_MS
  ) {
    return;
  }
  lastNetworkErrorAt = Date.now();
  notify.error('A szerver nem érhető el', appErr.message, {
    id: NETWORK_ERROR_TOAST_ID,
  });
}

/** Lejárt munkamenet / inaktív fiók: ezt nincs értelme újrapróbálni. */
export function isSessionError(error: unknown): boolean {
  return toAppError(error).action === 'login';
}
