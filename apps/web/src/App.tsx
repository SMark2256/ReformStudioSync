import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { LoginPage } from './features/auth/LoginPage';
import { DemoSandboxPage } from './features/demo/DemoSandboxPage';
import { MonitorPage } from './features/monitor/MonitorPage';
import { ReceptionPage } from './features/reception/ReceptionPage';

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/reception" element={<ReceptionPage />} />
        <Route path="/monitor" element={<MonitorPage />} />
        <Route path="/demo" element={<DemoSandboxPage />} />
        <Route path="*" element={<Navigate to="/reception" replace />} />
      </Routes>
    </BrowserRouter>
  );
};
