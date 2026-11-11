import React, { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useThemeStore } from '@/shared/theme';
import {
  PageContainer,
  SidebarInset,
  SidebarProvider,
  SkipLink,
} from '@/shared/ui';
import { getPageTitle } from '../model/navigation';
import { AppHeader } from './AppHeader';
import { AppSidebar } from './AppSidebar';

const APP_NAME = 'ReformStudio Sync';
// Tableten (768–1279 px) az oldalsáv alapból ikonsáv, amíg a felhasználó nem választ.
const TABLET_QUERY = '(max-width: 1279px)';

interface AppShellProps {
  /** Olvasatlan újdonságok száma (az Újdonságok menüpont számlálója). */
  newsCount: number;
  children: React.ReactNode;
}

// Alkalmazáskeret (UI-specifikáció 4., 8., 9.): oldalsáv, fejléc és a `<main>` tartalom.
// A DOM-ban pontosan egy `header`, egy fő `nav` és egy `main` van.
export const AppShell: React.FC<AppShellProps> = ({ newsCount, children }) => {
  const { pathname } = useLocation();
  const theme = useThemeStore((state) => state.theme);
  const title = getPageTitle(pathname) ?? APP_NAME;
  const [defaultOpen] = useState(
    () => !window.matchMedia(TABLET_QUERY).matches,
  );
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

  return (
    // A régi oldalak sötét témája (`dark:` változatok) a `.reception-theme-dark` alatt él.
    <div className={theme === 'dark' ? 'reception-theme-dark' : undefined}>
      <SkipLink />
      <SidebarProvider defaultOpen={defaultOpen}>
        <AppSidebar newsCount={newsCount} />
        <SidebarInset>
          <AppHeader title={title} />
          <PageContainer asChild>
            <main
              id="main"
              ref={mainRef}
              tabIndex={-1}
              className="flex-1 outline-none"
            >
              {children}
            </main>
          </PageContainer>
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
};
