import { APP_ROUTES, normalizePathname } from '@/shared/config';
import type { ReceptionMainTab } from './releaseNotes';

export type ReceptionTab = ReceptionMainTab | 'news';

// A recepció fülei útvonalként: a menü, a fülek közötti gombok és az Újdonságok linkjei
// ezekre navigálnak. Ugyanaz a `ReceptionPage` rajzolja mindet.
export const RECEPTION_TAB_ROUTES: Record<
  ReceptionTab,
  { path: string; title: string }
> = {
  desk: APP_ROUTES.reception,
  guests: APP_ROUTES.guests,
  admin: APP_ROUTES.passes,
  finance: APP_ROUTES.finance,
  news: APP_ROUTES.news,
};

export const RECEPTION_PATHS = Object.values(RECEPTION_TAB_ROUTES).map(
  (route) => route.path,
);

export const getReceptionTab = (pathname: string): ReceptionTab => {
  const path = normalizePathname(pathname);
  return (
    (Object.keys(RECEPTION_TAB_ROUTES) as ReceptionTab[]).find(
      (tab) => RECEPTION_TAB_ROUTES[tab].path === path,
    ) ?? 'desk'
  );
};
