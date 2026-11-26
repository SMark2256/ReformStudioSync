import {
  CheckInStatus,
  CheckInWarningCode,
  MonitorEventMode,
  PassType,
  ServiceCategory,
} from './enums';
import type { ArrivalDeniedReason, DebtDeniedReason } from './pass-rules';

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
  /**
   * A foglalási naptár változott (TICKET-57, `BookingChangedPayload`). Csak a munkatársi
   * szobába megy, személyes adat nélkül: a recepciós naptár erre újratölti az érintett napokat.
   */
  BOOKING_CHANGED: 'booking:changed',
  /**
   * Vendégfelvétel (TICKET-56): a recepció egy kitöltést küldött erre a tabletre
   * (`IntakeDevicePayload`). Csak az eszköz socketjei kapják; a token a `claim` hívással jön.
   */
  INTAKE_ASSIGNED: 'intake:assigned',
  /** A recepció lezárta a tablet vendégmódját (`IntakeDevicePayload`). */
  INTAKE_RELEASED: 'intake:released',
  /** Egy kitöltés állapota változott (`IntakeSocketPayload`); csak a munkatársi szoba kapja. */
  INTAKE_UPDATED: 'intake:updated',
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
  /**
   * A belépés szolgáltatásának kategóriája (az üdvözlés szövegéhez, `greetingForCheckIn`);
   * `null`, ha ismeretlen. Nem érzékeny, a monitorra is átmegy (TICKET-43).
   */
  serviceCategory?: ServiceCategory | null;
  /** A szolgáltatás csak nőknek szól („Női Köredzés”). Nem érzékeny, a monitorra is átmegy. */
  womenOnly?: boolean;
  passName?: string;
  passType?: PassType;
  remainingPasses?: number | 'Korlátlan';
  totalPasses?: number | null;
  expirationDate?: string | null;
  reason?: string;
  warnings: CheckInWarningCode[];
  overdueAmountHuf?: number;
  overdueDays?: number;
  /** Bérlet-hátralék összesen (Ft), csak ha van (TICKET-14). Csak a recepción látható. */
  passDebtHuf?: number;
  /** A legkorábbi bérlet-hátralék keletkezése (ISO). */
  passDebtSince?: string;
  /** Legalább egy bérlet hátraléka ismeretlen; csak ha igaz. */
  passDebtUnknown?: boolean;
  /** A legrégebbi hátralékos bérlet vásárlása óta eltelt napok (TICKET-15), csak ha van hátralék. */
  passDebtDays?: number;
  /**
   * Az elutasítás oka gépi kóddal (TICKET-15), csak `DENIED` esetén. Csak a recepción látható,
   * a monitorra nem kerül (`toMonitorPayload`).
   */
  deniedReasonCode?: ArrivalDeniedReason;
  /** Tartozás miatti elutasításnál az összes ok (tagdíj, bérlet-hátralék, ismeretlen hátralék). */
  debtReasons?: DebtDeniedReason[];
  /** Csak ha igaz: az elutasítás kivételes beengedéssel (`forceOverride` + indoklás) feloldható. */
  overrideAllowed?: boolean;
  /** Csak ha igaz: a belépés (vagy a kezelésválasztás) kivételes beengedéssel történt. */
  overridden?: boolean;
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

export type BookingChangeKind =
  | 'CREATED'
  | 'RESCHEDULED'
  | 'CANCELLED'
  | 'STATUS'
  | 'SETTINGS'
  | 'WAITLIST'
  | 'SYNC';

/** A foglalási naptár változásának jelzése (TICKET-57), személyes adat nélkül. */
export interface BookingChangedPayload {
  studioId: string;
  kind: BookingChangeKind;
  /** Az érintett napok (`YYYY-MM-DD`); üres, ha a beállítás minden napot érint. */
  dayKeys: string[];
  timestamp: string;
}
