import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { GlobalScannerChannel } from '@/features/scanner-channel';
import { LoginPage } from '@/pages/login';
import { DemoSandboxPage } from '@/pages/demo-sandbox';
import { MonitorPage } from '@/pages/monitor';
import { ReceptionPage } from '@/pages/reception';
import { TabletDocumentPage } from '@/pages/tablet-document';

// Fejlesztői UI-előnézet (`/dev/ui`): csak `npm run dev:web` alatt, a buildbe nem kerül be.
const UiPreviewPage = import.meta.env.DEV
  ? lazy(() =>
      import('@/pages/ui-preview').then((module) => ({
        default: module.UiPreviewPage,
      })),
    )
  : null;

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <GlobalScannerChannel />
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/reception" element={<ReceptionPage />} />
        <Route path="/monitor" element={<MonitorPage />} />
        <Route path="/tablet" element={<TabletDocumentPage />} />
        <Route path="/demo" element={<DemoSandboxPage />} />
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
        <Route path="*" element={<Navigate to="/reception" replace />} />
      </Routes>
    </BrowserRouter>
  );
};
