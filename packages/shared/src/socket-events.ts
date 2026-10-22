import {
  CheckInStatus,
  CheckInWarningCode,
  MonitorEventMode,
  PassType,
} from './enums';

export const SOCKET_NAMESPACE = '/monitor';

export const SOCKET_EVENTS = {
  CHECKIN_RESULT: 'checkin:result',
  CHECKIN_REVOKED: 'checkin:revoked',
  MONITOR_STATE: 'monitor:state',
  MONITOR_PING: 'monitor:ping',
  MONITOR_CONFIG: 'monitor:config',
  MONITOR_TEST_PING: 'monitor:test-ping',
  MONITOR_DEVICE_REVOKED: 'monitor:device-revoked',
  TABLET_DOCUMENT_PUSHED: 'tablet:document_pushed',
  TABLET_DOCUMENT_SIGNED: 'tablet:document_signed',
} as const;

/**
 * Vendégmonitorra és recepcióra küldött esemény.
 * ADATVÉDELMI SZABÁLY: A Vendégmonitoron (MonitorDisplayCard) kizárólag:
 * - Köredzésnél (mode === 'CIRCUIT_GREETING'): "Üdvözlünk, [Név]! Jó edzést kívánunk!" (nincs bérletszám, nincs tartozás)
 * - Alkalmas kezelésnél (mode === 'TREATMENT_GREETING'): "Üdvözlünk, [Név]! [Kezelés neve]. Hátralévő alkalmak: [X]. Kellemes kezelést kívánunk!"
 * jelenhet meg.
 */
export interface CheckInResultPayload {
  checkInId?: string;
  usageId?: string;
  mode?: MonitorEventMode;
  status: CheckInStatus;
  guestId?: string;
  barcode: string;
  guestName: string;
  serviceName?: string;
  passName?: string;
  passType?: PassType;
  remainingPasses?: number | 'Korlátlan';
  totalPasses?: number | null;
  expirationDate?: string | null;
  reason?: string;
  warnings: CheckInWarningCode[];
  overdueAmountHuf?: number;
  overdueDays?: number;
  greetingSeconds?: number;
  suggestedRenewalTemplateId?: string | null;
  timestamp: string;
}

export interface CheckInRevokedPayload {
  checkInId: string;
  guestId: string;
  guestName: string;
  serviceName?: string;
  restoredRemainingPasses?: number | 'Korlátlan';
  timestamp: string;
}

export interface MonitorStatePayload {
  studioId: string;
  connectedDisplays: number;
  greetingDurationSeconds?: number;
  lastHeartbeat: string;
}

export interface TabletDocumentPushPayload {
  documentId: string;
  guestId: string;
  guestName: string;
  title: string;
  documentType: string;
  pushedAt: string;
}

export interface ScannerEventPayload {
  barcode: string;
  rawBarcode?: string;
  sourceRoute?: string;
  scannedAt: string;
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
