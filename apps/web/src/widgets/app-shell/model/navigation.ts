import {
  ConciergeBell,
  MonitorSmartphone,
  Ticket,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import {
  APP_ROUTES,
  normalizePathname,
  type AppRouteKey,
} from '@/shared/config';

interface NavItem {
  route: AppRouteKey;
  icon: LucideIcon;
  /** Külön ablakban nyílik (a Vendégmonitor a pult felé néző kijelzőre kerül). */
  opensWindow?: boolean;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

// Főmenü (UI-specifikáció 4.2). A még nem létező oldalak (Órarend, Adminisztráció csoport)
// csak akkor kerülnek be, ha elkészülnek.
export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Napi működés',
    items: [
      { route: 'reception', icon: ConciergeBell },
      { route: 'monitor', icon: MonitorSmartphone, opensWindow: true },
    ],
  },
  {
    label: 'Ügyfelek',
    items: [
      { route: 'guests', icon: Users },
      { route: 'passes', icon: Ticket },
      { route: 'finance', icon: Wallet },
    ],
  },
];

export const getPageTitle = (pathname: string): string | undefined => {
  const path = normalizePathname(pathname);
  return Object.values(APP_ROUTES).find((route) => route.path === path)?.title;
};
