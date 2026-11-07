import { AppError, toAppError } from '@reform/shared';
import type { QueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/shared/auth';
import { notify } from '../notify';

const DEFAULT_TITLE = 'Hiba történt a művelet végrehajtása közben';

// A bejelentkezés és a Vendégmonitor (kioszk, eszköztokennel fut) oldaláról
// nem irányítunk át a bejelentkezésre.
const NO_LOGIN_REDIRECT_PATHS = ['/login', '/monitor'];

let queryClient: QueryClient | null = null;

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

export interface HandleAppErrorOptions {
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

  if (appErr.action === 'reload') {
    void queryClient?.invalidateQueries();
  }

  notify.error(title, appErr.message);
  return appErr;
}

/**
 * Lekérdezési (useQuery) hibák: ezeknél eddig sem jelent meg toast, ezért csak
 * a lejárt munkamenetre reagálunk átirányítással.
 */
export function handleQueryError(error: unknown): void {
  if (toAppError(error).action === 'login') redirectToLogin();
}
