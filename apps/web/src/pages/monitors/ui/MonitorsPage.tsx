import React from 'react';
import { APP_ROUTES } from '@/shared/config';
import { PageHeader } from '@/shared/ui';
import { MonitorDevicesCard } from './MonitorDevicesCard';

// Monitorok (`/monitors`, a fiókpanelből): a Vendégmonitor és a különálló kijelzők kezelése.
export const MonitorsPage: React.FC = () => (
  <>
    <PageHeader
      title={APP_ROUTES.monitors.title}
      description="A vendég felé néző kijelzők és tabletek párosítása és kezelése."
    />
    <MonitorDevicesCard />
  </>
);
