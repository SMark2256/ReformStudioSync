import { Role } from '@reform/shared';
import { ChevronUp, LogOut, Moon, Settings, Sun } from 'lucide-react';
import React, { useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/shared/auth';
import { APP_ROUTES } from '@/shared/config';
import { notify } from '@/shared/lib/notify';
import { cn } from '@/shared/lib/utils';
import { saveTheme, useThemeStore } from '@/shared/theme';
import { Avatar, Separator, SidebarItem } from '@/shared/ui';

const ROLE_LABELS: Record<Role, string> = {
  [Role.ADMIN]: 'Admin',
  [Role.RECEPTIONIST]: 'Recepciós',
};

// Világos vagy sötét téma; a Beállításokban ugyanez a választás. A panel nyitva marad, így a
// kapcsoló vissza is állítható.
const ThemeSwitch: React.FC = () => {
  const isDark = useThemeStore((state) => state.theme === 'dark');
  const segmentClassName =
    'grid place-items-center px-1.5 py-0.5 transition-colors motion-reduce:transition-none [&_svg]:size-[13px]';

  return (
    <SidebarItem
      role="switch"
      aria-checked={isDark}
      aria-label="Sötét téma"
      onClick={() => saveTheme(isDark ? 'light' : 'dark')}
    >
      {isDark ? (
        <Moon aria-hidden strokeWidth={1.75} />
      ) : (
        <Sun aria-hidden strokeWidth={1.75} />
      )}
      Téma
      <span
        aria-hidden
        className="ml-auto flex overflow-hidden rounded-md border border-sidebar-border"
      >
        <span
          className={cn(
            segmentClassName,
            isDark
              ? 'text-sidebar-muted'
              : 'bg-sidebar-hover text-sidebar-highlight',
          )}
        >
          <Sun strokeWidth={1.75} />
        </span>
        <span
          className={cn(
            segmentClassName,
            isDark
              ? 'bg-sidebar-hover text-sidebar-highlight'
              : 'text-sidebar-muted',
          )}
        >
          <Moon strokeWidth={1.75} />
        </span>
      </span>
    </SidebarItem>
  );
};

interface SidebarAccountProps {
  isVisuallyExpanded: boolean;
  /** A futó verzió (pl. „0.3”), az Újdonságokra visz. */
  version: string;
  /** Menüpont választásakor (mobilon a kihúzott menü bezárása). */
  onItemSelect?: () => void;
}

/**
 * Az oldalsáv lábrésze (UI-specifikáció 4.2): a munkatárs sora a mögüle felcsúszó fiókpanelt
 * nyitja (Beállítások, Téma, Kijelentkezés), alatta a futó verzió. Ugyanez a sor, a kívüli
 * kattintás és az Esc zárja a panelt, ahogy a navigálás és az oldalsáv csukódása is.
 */
export const SidebarAccount: React.FC<SidebarAccountProps> = ({
  isVisuallyExpanded,
  version,
  onItemSelect,
}) => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  // Billentyűzettel nyitva a fókusz a panelbe kerül: a DOM-ban a sor előtt van, és máskülönben
  // csak visszafelé lenne elérhető.
  const focusPanelOnOpen = useRef(false);
  const staffName = user?.name ?? 'Recepciós munkatárs';
  const roleLabel = user ? ROLE_LABELS[user.role] : undefined;

  // Navigáláskor és az oldalsáv csukódásakor a panel bezárul.
  useEffect(() => setIsOpen(false), [pathname, isVisuallyExpanded]);

  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setIsOpen(false);
      toggleRef.current?.focus();
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !focusPanelOnOpen.current) return;
    focusPanelOnOpen.current = false;
    panelRef.current?.querySelector<HTMLElement>('a, button')?.focus();
  }, [isOpen]);

  const handleLogout = () => {
    logout();
    notify.info('Sikeres kijelentkezés', 'A munkamenet lezárult.');
    navigate('/login');
  };

  return (
    <section
      ref={rootRef}
      aria-label="Bejelentkezett felhasználó"
      data-account-panel={isOpen ? 'open' : 'closed'}
      className="relative shrink-0"
    >
      {/* Csukva a sor mögött és a kártya alja alatt van (a kártya levágja); onnan csúszik fel. */}
      <div
        ref={panelRef}
        id={panelId}
        className={cn(
          'absolute inset-x-2 bottom-full z-0 -mb-1.5 origin-bottom rounded-t-lg border border-b-0 border-sidebar-border bg-sidebar-raised px-1.5 pb-3 pt-1.5 shadow-[0_-6px_24px_rgba(0,0,0,0.35)] motion-reduce:[transition:none]',
          isOpen
            ? 'visible translate-y-0 scale-100 [transition:transform_300ms_cubic-bezier(0.22,1,0.36,1)]'
            : 'invisible translate-y-[105%] scale-[0.94] [transition:transform_240ms_cubic-bezier(0.4,0,0.6,1),visibility_0s_linear_240ms]',
        )}
      >
        <p className="truncate px-2.5 pb-1.5 pt-1 text-xs text-sidebar-muted">
          {user?.email ?? roleLabel}
        </p>
        <SidebarItem asChild>
          <Link to={APP_ROUTES.settings.path} onClick={onItemSelect}>
            <Settings aria-hidden strokeWidth={1.75} />
            {APP_ROUTES.settings.title}
          </Link>
        </SidebarItem>
        <ThemeSwitch />
        <Separator className="mx-1 my-1 w-auto bg-sidebar-border" />
        <SidebarItem onClick={handleLogout}>
          <LogOut aria-hidden strokeWidth={1.75} />
          Kijelentkezés
        </SidebarItem>
      </div>

      {/* A panel fölött, hogy a panel mögüle csússzon elő. */}
      <div className="relative z-10 border-t border-sidebar-border bg-sidebar px-2 pb-1.5 pt-2">
        <SidebarItem
          ref={toggleRef}
          aria-expanded={isOpen}
          aria-controls={panelId}
          aria-label={`Fiók és beállítások: ${staffName}`}
          className={cn(
            'h-11 gap-2.5 px-2 coarse:h-11',
            isOpen && 'bg-sidebar-hover',
            isVisuallyExpanded ? 'w-full' : 'w-12',
          )}
          onClick={(event) => {
            // Billentyűzetes aktiválásnál (Enter, szóköz) a `detail` 0.
            focusPanelOnOpen.current = !isOpen && event.detail === 0;
            setIsOpen(!isOpen);
          }}
        >
          <Avatar
            name={staffName}
            className="border-sidebar-border bg-sidebar-raised text-sidebar-foreground"
          />
          <span
            className={cn(
              'min-w-0 flex-1 transition-opacity duration-200 motion-reduce:transition-none',
              !isVisuallyExpanded && 'opacity-0',
            )}
          >
            <span className="block truncate text-[13px] font-semibold text-sidebar-foreground">
              {staffName}
            </span>
            {roleLabel && (
              <span className="block truncate text-xs text-sidebar-muted">
                {roleLabel}
              </span>
            )}
          </span>
          <ChevronUp
            aria-hidden
            strokeWidth={1.75}
            className={cn(
              'text-sidebar-muted transition-transform duration-200 motion-reduce:transition-none',
              isOpen && 'rotate-180',
            )}
          />
        </SidebarItem>

        <SidebarItem
          asChild
          className={cn(
            'mt-0.5 h-6 text-xs tabular-nums text-sidebar-muted hover:bg-transparent hover:text-sidebar-foreground coarse:h-6',
            isVisuallyExpanded ? 'w-full px-2' : 'w-12 justify-center px-0',
          )}
        >
          <Link
            to={APP_ROUTES.news.path}
            title={`Verzió ${version} · ${APP_ROUTES.news.title}`}
            onClick={onItemSelect}
          >
            {isVisuallyExpanded ? `Verzió ${version}` : `v${version}`}
          </Link>
        </SidebarItem>
      </div>
    </section>
  );
};
