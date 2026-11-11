import React, { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useIsMobile } from '@/shared/lib/hooks';
import { useThemeStore } from '@/shared/theme';
import { PageContainer, SkipLink } from '@/shared/ui';
import { getPageTitle } from '../model/navigation';
import { useSidebarState } from '../model/sidebarState';
import { AppHeader } from './AppHeader';
import { AppSidebar } from './AppSidebar';
import { MobileSidebar } from './MobileSidebar';

const APP_NAME = 'ReformStudio Sync';
const SIDEBAR_KEYBOARD_SHORTCUT = 'b';

interface AppShellProps {
  /** Olvasatlan újdonságok száma (az Újdonságok menüpont számlálója). */
  newsCount: number;
  /** A futó verzió (pl. „0.3”) az oldalsáv alján. */
  version: string;
  children: React.ReactNode;
}

// Alkalmazáskeret (UI-specifikáció 4., 8., 9.): lebegő oldalsáv, fejléc és a `<main>` tartalom.
// A DOM-ban pontosan egy `header`, egy fő `nav` és egy `main` van.
export const AppShell: React.FC<AppShellProps> = ({
  newsCount,
  version,
  children,
}) => {
  const { pathname } = useLocation();
  const theme = useThemeStore((state) => state.theme);
  const isMobile = useIsMobile();
  const sidebar = useSidebarState();
  const { togglePinned } = sidebar;
  const [mobileOpen, setMobileOpen] = useState(false);
  const title = getPageTitle(pathname) ?? APP_NAME;
  const mainRef = useRef<HTMLElement>(null);
  const lastPathname = useRef(pathname);

  // A keretből kilépve (pl. kijelentkezés) az eredeti cím áll vissza.
  useEffect(() => {
    const originalTitle = document.title;
    return () => {
      document.title = originalTitle;
    };
  }, []);

  useEffect(() => {
    document.title = `${title} · ${APP_NAME}`;
  }, [title]);

  // Oldalváltáskor az új oldal tetejéről indulunk, és a fókusz a tartalomra kerül.
  useEffect(() => {
    if (lastPathname.current === pathname) return;
    lastPathname.current = pathname;
    window.scrollTo({ top: 0 });
    mainRef.current?.focus({ preventScroll: true });
  }, [pathname]);

  // Asztalra váltva a kihúzott mobil menü bezárul.
  useEffect(() => {
    if (!isMobile) setMobileOpen(false);
  }, [isMobile]);

  // Ctrl+B: asztalin összecsukja / kinyitja az oldalsávot, mobilon a menüt nyitja-zárja.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Szövegmezőben a Ctrl+B nem a menüé.
      const inField =
        event.target instanceof HTMLElement &&
        event.target.closest(
          'input, textarea, select, [contenteditable="true"]',
        );
      if (
        event.key !== SIDEBAR_KEYBOARD_SHORTCUT ||
        !(event.metaKey || event.ctrlKey) ||
        inField
      ) {
        return;
      }
      event.preventDefault();
      if (isMobile) setMobileOpen((open) => !open);
      else togglePinned();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMobile, togglePinned]);

  return (
    // A régi oldalak sötét témája (`dark:` változatok) a `.reception-theme-dark` alatt él.
    <div className={theme === 'dark' ? 'reception-theme-dark' : undefined}>
      <SkipLink />
      {/* A kártya a szélektől `--sidebar-inset`-re lebeg; a tartalom `--sidebar-offset`-nél indul. */}
      <div
        className="min-h-svh bg-background [--sidebar-inset:0.5rem] md:[--sidebar-inset:0.75rem]"
        style={
          {
            '--sidebar-offset': isMobile
              ? '0px'
              : `calc(${sidebar.layoutWidth}px + 2 * var(--sidebar-inset))`,
          } as React.CSSProperties
        }
      >
        {isMobile ? (
          <MobileSidebar
            open={mobileOpen}
            onOpenChange={setMobileOpen}
            newsCount={newsCount}
            version={version}
          />
        ) : (
          <AppSidebar
            isLayoutExpanded={sidebar.isLayoutExpanded}
            isVisuallyExpanded={sidebar.isVisuallyExpanded}
            onPeekChange={sidebar.setPeeked}
            onTogglePinned={togglePinned}
            newsCount={newsCount}
            version={version}
          />
        )}
        <AppHeader
          title={title}
          menuOpen={mobileOpen}
          onOpenMenu={() => setMobileOpen(true)}
        />
        <div className="ml-[var(--sidebar-offset)] transition-[margin] duration-200 ease-in-out motion-reduce:transition-none">
          <PageContainer asChild>
            <main
              id="main"
              ref={mainRef}
              tabIndex={-1}
              className="outline-none"
            >
              {children}
            </main>
          </PageContainer>
        </div>
      </div>
    </div>
  );
};
