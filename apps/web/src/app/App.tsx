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
import { MailingPage } from '@/pages/mailing';
import { DemoSandboxPage } from '@/pages/demo-sandbox';
import { GuestIntakePage } from '@/pages/guest-intake';
import { MonitorPage } from '@/pages/monitor';
import { MonitorsPage } from '@/pages/monitors';
import {
  RECEPTION_PATHS,
  ReceptionPage,
  useUnseenReleaseNotesCount,
} from '@/pages/reception';
import { SettingsPage } from '@/pages/settings';
import { TabletDocumentPage } from '@/pages/tablet-document';
import { TabletIntakePage } from '@/pages/tablet-intake';
import { UnsubscribePage } from '@/pages/unsubscribe';
import { AppShell } from '@/widgets/app-shell';
import { useIntakeGuestStore } from '@/shared/auth';
import {
  APP_RELEASE_VERSION,
  APP_ROUTES,
  TABLET_INTAKE_PATH,
} from '@/shared/config';

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
// A tablet vendégmódjában (TICKET-56) a munkatársi oldalak nem érhetők el: kilépni csak a
// munkatárs kilépési kódjával lehet.
const GuestModeLock: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const guestToken = useIntakeGuestStore((state) => state.guestToken);
  return guestToken ? <Navigate to={TABLET_INTAKE_PATH} replace /> : <>{children}</>;
};

const AppLayout: React.FC = () => {
  const newsCount = useUnseenReleaseNotesCount();
  return (
    <AppShell newsCount={newsCount} version={APP_RELEASE_VERSION}>
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
        <Route
          path="/login"
          element={
            <GuestModeLock>
              <LoginPage />
            </GuestModeLock>
          }
        />
        <Route
          element={
            <GuestModeLock>
              <AppLayout />
            </GuestModeLock>
          }
        >
          {/* A recepció fülei útvonalak; mindet ugyanaz az oldal rajzolja. */}
          {RECEPTION_PATHS.map((path) => (
            <Route key={path} path={path} element={<ReceptionPage />} />
          ))}
          <Route path={APP_ROUTES.intake.path} element={<GuestIntakePage />} />
          <Route path={APP_ROUTES.demo.path} element={<DemoSandboxPage />} />
          <Route path={APP_ROUTES.monitors.path} element={<MonitorsPage />} />
          <Route path={APP_ROUTES.mailing.path} element={<MailingPage />} />
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
        <Route
          path="/tablet"
          element={
            <GuestModeLock>
              <TabletDocumentPage />
            </GuestModeLock>
          }
        />
        <Route path={TABLET_INTAKE_PATH} element={<TabletIntakePage />} />
        {/* Nyilvános leiratkozó oldal (TICKET-55): belépés nélkül, a levélben kapott tokennel. */}
        <Route path="/leiratkozas/:token" element={<UnsubscribePage />} />
        <Route path="*" element={<Navigate to="/reception" replace />} />
      </Routes>
    </BrowserRouter>
  );
};
