import React, { Suspense, lazy } from 'react';
import {
  BrowserRouter,
  Navigate,
  Outlet,
  Route,
  Routes,
} from 'react-router-dom';
import { GlobalScannerChannel } from '@/features/scanner-channel';
import { LoginPage } from '@/pages/login';
import { DemoSandboxPage } from '@/pages/demo-sandbox';
import { MonitorPage } from '@/pages/monitor';
import { MonitorsPage } from '@/pages/monitors';
import {
  CURRENT_VERSION,
  RECEPTION_PATHS,
  ReceptionPage,
  useUnseenReleaseNotesCount,
} from '@/pages/reception';
import { SettingsPage } from '@/pages/settings';
import { TabletDocumentPage } from '@/pages/tablet-document';
import { AppShell } from '@/widgets/app-shell';
import { APP_ROUTES } from '@/shared/config';

// Fejlesztői UI-előnézet (`/dev/ui`): csak `npm run dev:web` alatt, a buildbe nem kerül be.
const UiPreviewPage = import.meta.env.DEV
  ? lazy(() =>
      import('@/pages/ui-preview').then((module) => ({
        default: module.UiPreviewPage,
      })),
    )
  : null;

// Az alkalmazáskeretes oldalak közös elrendezése. A Vendégmonitor, a bejelentkezés és a
// `/tablet` keret nélkül marad.
const AppLayout: React.FC = () => {
  const newsCount = useUnseenReleaseNotesCount();
  return (
    <AppShell newsCount={newsCount} version={CURRENT_VERSION}>
      <Outlet />
    </AppShell>
  );
};

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <GlobalScannerChannel />
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<LoginPage />} />
        <Route element={<AppLayout />}>
          {/* A recepció fülei útvonalak; mindet ugyanaz az oldal rajzolja. */}
          {RECEPTION_PATHS.map((path) => (
            <Route key={path} path={path} element={<ReceptionPage />} />
          ))}
          <Route path={APP_ROUTES.demo.path} element={<DemoSandboxPage />} />
          <Route path={APP_ROUTES.monitors.path} element={<MonitorsPage />} />
          <Route
            path={APP_ROUTES.settings.path}
            element={<SettingsPage />}
          />
          {UiPreviewPage && (
            <Route
              path="/dev/ui"
              element={
                <Suspense fallback={null}>
                  <UiPreviewPage />
                </Suspense>
              }
            />
          )}
        </Route>
        <Route path={APP_ROUTES.monitor.path} element={<MonitorPage />} />
        <Route path="/tablet" element={<TabletDocumentPage />} />
        <Route path="*" element={<Navigate to="/reception" replace />} />
      </Routes>
    </BrowserRouter>
  );
};
