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
  /** Szűkített (`MonitorCheckInPayload`) esemény a Vendégmonitoroknak. */
  MONITOR_CHECKIN_RESULT: 'monitor:checkin-result',
  /** Szűkített (`MonitorCheckInRevokedPayload`) esemény a Vendégmonitoroknak. */
  MONITOR_CHECKIN_REVOKED: 'monitor:checkin-revoked',
  MONITOR_STATE: 'monitor:state',
  MONITOR_PING: 'monitor:ping',
  MONITOR_CONFIG: 'monitor:config',
  MONITOR_TEST_PING: 'monitor:test-ping',
  /**
   * A kijelző párosítását visszavonták (törlés vagy új párosító kód). A szerver
   * közvetlenül az eszköz socketjeinek küldi, majd bontja őket.
   */
  MONITOR_DEVICE_REVOKED: 'monitor:device-revoked',
  /**
   * A szerver elutasította a csatlakozó socket tokenjét
   * (`MonitorAuthRejectedPayload`). A bontás előtt megy ki.
   */
  MONITOR_AUTH_REJECTED: 'monitor:auth-rejected',
  TABLET_DOCUMENT_PUSHED: 'tablet:document_pushed',
  TABLET_DOCUMENT_SIGNED: 'tablet:document_signed',
} as const;

/**
 * Teljes beléptetési eredmény, CSAK a recepciónak (munkatársi socket-szoba,
 * recepciós BroadcastChannel). Tartozást, vonalkódot és elutasítási okot is
 * tartalmaz, ezért a Vendégmonitorra soha nem kerülhet: oda a `toMonitorPayload`
 * szűkített változata megy (`MonitorCheckInPayload`).
 */
/** Kezelésválasztásnál (TICKET-39) szóba jöhető bérlet, a kezelésválasztó előtöltéséhez. */
export interface TreatmentSelectionOption {
  passId: string;
  passName: string;
  passType: PassType;
  /** A bérlet szolgáltatása; `null`, ha bármelyik kezelésre levonható. */
  serviceId: string | null;
  serviceName: string | null;
  remainingPasses: number | 'Korlátlan';
  expirationDate: string;
}

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
  /** Sikeres belépésnél: a vendégnek ma (Europe/Budapest) van a születésnapja. */
  isBirthday?: boolean;
  /** Csak `TREATMENT_SELECTION_REQUIRED` esetén: a választható bérletek, a leghamarabb lejáró elöl. */
  treatmentOptions?: TreatmentSelectionOption[];
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

export interface MonitorAuthRejectedPayload {
  /** Az elutasítás hibakódja a katalógusból (pl. `AUTH.DEVICE_TOKEN_INVALID`). */
  code: string;
  /** A katalógus magyar üzenete. */
  message: string;
  timestamp: string;
}
