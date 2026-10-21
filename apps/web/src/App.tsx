import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { GlobalScannerChannel } from './components/GlobalScannerChannel';
import { LoginPage } from './features/auth/LoginPage';
import { DemoSandboxPage } from './features/demo/DemoSandboxPage';
import { MonitorPage } from './features/monitor/MonitorPage';
import { ReceptionPage } from './features/reception/ReceptionPage';
import { TabletDocumentPage } from './features/tablet/TabletDocumentPage';

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
