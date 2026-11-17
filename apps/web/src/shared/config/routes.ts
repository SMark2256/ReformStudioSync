// Az alkalmazáskeret oldalai: útvonal és oldalnév (menü, morzsamenü, `document.title`).
// UI-specifikáció 4.2.
export const APP_ROUTES = {
  reception: { path: '/reception', title: 'Recepció' },
  monitor: { path: '/monitor', title: 'Vendégmonitor' },
  guests: { path: '/guests', title: 'Vendégek' },
  intake: { path: '/intake', title: 'Vendégfelvétel' },
  passes: { path: '/passes', title: 'Bérletek és termékek' },
  finance: { path: '/finance', title: 'Pénzügy' },
  news: { path: '/news', title: 'Újdonságok' },
  demo: { path: '/demo', title: 'Demó mód' },
  monitors: { path: '/monitors', title: 'Monitorok' },
  settings: { path: '/settings', title: 'Beállítások' },
} as const;

export type AppRouteKey = keyof typeof APP_ROUTES;

/** A tablet vendégmódja (TICKET-56): keret nélkül, a vendég tölti ki és írja alá. */
export const TABLET_INTAKE_PATH = '/tablet/intake';

// A react-router kis- és nagybetűtől, illetve a záró perjeltől függetlenül illeszt; az
// útvonal szerinti keresések (oldalnév, recepciós fül) ugyanígy hasonlítsanak.
export const normalizePathname = (pathname: string): string =>
  pathname.replace(/\/+$/, '').toLowerCase() || '/';
