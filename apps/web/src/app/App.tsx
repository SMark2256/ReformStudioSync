import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { GlobalScannerChannel } from '@/features/scanner-channel';
import { LoginPage } from '@/pages/login';
import { DemoSandboxPage } from '@/pages/demo-sandbox';
import { MonitorPage } from '@/pages/monitor';
import { ReceptionPage } from '@/pages/reception';
import { TabletDocumentPage } from '@/pages/tablet-document';

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
        <Route path="*" element={<Navigate to="/reception" replace />} />
      </Routes>
    </BrowserRouter>
  );
};
