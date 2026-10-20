import { CheckInStatus, CheckInWarningCode, PassType } from './enums';

export const SOCKET_NAMESPACE = '/monitor';

export const SOCKET_EVENTS = {
  CHECKIN_RESULT: 'checkin:result',
  CHECKIN_REVOKED: 'checkin:revoked',
  MONITOR_STATE: 'monitor:state',
  MONITOR_PING: 'monitor:ping',
  MONITOR_TEST_PING: 'monitor:test-ping',
  MONITOR_DEVICE_REVOKED: 'monitor:device-revoked',
} as const;

export interface CheckInResultPayload {
  checkInId?: string;
  status: CheckInStatus;
  guestId?: string;
  barcode: string;
  guestName: string;
  passName?: string;
  passType?: PassType;
  remainingPasses?: number | 'Korlátlan';
  totalPasses?: number | null;
  expirationDate?: string | null;
  reason?: string;
  warnings: CheckInWarningCode[];
  suggestedRenewalTemplateId?: string | null;
  timestamp: string;
}

export interface CheckInRevokedPayload {
  checkInId: string;
  guestId: string;
  guestName: string;
  restoredRemainingPasses?: number | 'Korlátlan';
  timestamp: string;
}

export interface MonitorStatePayload {
  studioId: string;
  connectedDisplays: number;
  lastHeartbeat: string;
}

export interface MonitorTestPingPayload {
  deviceId?: string | null;
  deviceName?: string | null;
  senderName?: string;
  message: string;
  timestamp: string;
}

export interface MonitorDeviceRevokedPayload {
  deviceId: string;
  reason?: string;
  timestamp: string;
}

