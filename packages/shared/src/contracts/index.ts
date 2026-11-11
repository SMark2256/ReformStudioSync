import {
  CheckInStatus,
  DocumentStatus,
  DocumentType,
  GuestStatus,
  MembershipDueStatus,
  MembershipStatus,
  MessageStatus,
  OverdueBucket,
  PassStatus,
  PassType,
  PaymentMethod,
  Role,
  ServiceCategory,
  VisitType,
} from '../enums';
import { CheckInResultPayload } from '../socket-events';

export interface AuthUserDto {
  id: string;
  studioId: string;
  email: string;
  name: string;
  role: Role;
}

export interface LoginResponseDto {
  accessToken: string;
  user: AuthUserDto;
}

/** E-mailben küldött belépőkód (TICKET-35): 6 számjegy, 10 percig érvényes. */
export const LOGIN_CODE_LENGTH = 6;
export const LOGIN_CODE_TTL_MINUTES = 10;

/** `POST /auth/code` */
export interface RequestLoginCodeDto {
  email: string;
}

/** Ismeretlen vagy inaktív címre is ugyanez a válasz, csak levél nem megy ki. */
export interface RequestLoginCodeResponseDto {
  ok: true;
  /** Csak a böngészős mock tölti ki (demó mód, szerver nélkül): ezzel a kóddal lehet belépni. */
  demoCode?: string;
}

/** `POST /auth/verify` — helyes kódra `LoginResponseDto` a válasz. */
export interface VerifyLoginCodeDto {
  email: string;
  code: string;
}

export interface ServiceDto {
  id: string;
  studioId: string;
  name: string;
  category: ServiceCategory;
  durationMinutes: number;
  priceHuf: number;
  isActive: boolean;
  createdAt: string;
}

export interface PassTemplateDto {
  id: string;
  studioId: string;
  serviceId?: string | null;
  serviceName?: string | null;
  name: string;
  type: PassType;
  totalPasses: number | null;
  durationDays: number;
  price: number;
  isActive: boolean;
  createdAt: string;
}

export interface PassUsageLogDto {
  id: string;
  guestPassId: string;
  guestId?: string;
  guestName?: string;
  serviceId?: string | null;
  serviceName?: string | null;
  passName?: string | null;
  employeeId?: string | null;
  employeeName?: string | null;
  delta: number;
  remainingAfter?: number | null;
  usedAt: string;
  reversedAt?: string | null;
  reversalReason?: string | null;
  /** A levonáshoz tartozó beléptetés (a visszavonás és a sztornó egymást is lezárja). */
  checkInId?: string | null;
  note: string | null;
}

export interface GuestPassDto {
  id: string;
  studioId: string;
  guestId: string;
  passTemplateId: string;
  passTemplateName?: string;
  serviceId?: string | null;
  serviceName?: string | null;
  type: PassType;
  totalPasses: number | null;
  remainingPasses: number | null;
  /** `computeRemainingPasses` eredménye: összes − nem visszavont levonások. */
  calculatedRemainingPasses?: number | null;
  usedPassesCount?: number;
  startDate: string;
  expirationDate: string;
  isActive: boolean;
  isFrozen: boolean;
  frozenAt: string | null;
  /** Az eladás sztornójának időpontja (az eladási befizetés sztornója). */
  cancelledAt?: string | null;
  /** Számolt állapot (`getPassStatus`); a felület ezt mutassa, ne az `isActive` jelzőt. */
  status: PassStatus;
  createdAt: string;
  usageLogs?: PassUsageLogDto[];
}

export interface MembershipDueDto {
  id: string;
  membershipId: string;
  guestId: string;
  guestName?: string;
  period: string; // YYYY-MM
  dueDate: string;
  amountHuf: number;
  paidAmountHuf: number;
  remainingHuf: number;
  status: MembershipDueStatus;
  overdueDays: number;
  overdueBucket: OverdueBucket;
  createdAt: string;
}

export interface MembershipDto {
  id: string;
  studioId: string;
  guestId: string;
  guestName?: string;
  monthlyFeeHuf: number;
  startDate: string;
  dueDay: number;
  status: MembershipStatus;
  pausedAt: string | null;
  terminatedAt: string | null;
  /** Utolsó újraaktiválás ideje (szünet / megszűnés után); a tagdíj innen folytatódik. */
  resumedAt?: string | null;
  createdAt: string;
  dues: MembershipDueDto[];
}

export interface VisitDto {
  id: string;
  studioId: string;
  guestId: string;
  guestName: string;
  guestBarcode: string;
  checkedInAt: string;
  visitType: VisitType;
  serviceName?: string | null;
  employeeId: string;
  employeeName: string;
}

export interface PaymentAllocationDto {
  id: string;
  paymentId: string;
  membershipDueId: string | null;
  membershipPeriod?: string | null;
  passId: string | null;
  passName?: string | null;
  amountHuf: number;
}

export interface PaymentDto {
  id: string;
  studioId: string;
  guestId: string;
  guestName: string;
  guestPassId: string | null;
  passName: string | null;
  membershipDueId?: string | null;
  membershipPeriod?: string | null;
  recordedByUserId: string;
  recordedByName: string;
  amount: number;
  paymentMethod: PaymentMethod;
  isCancelled: boolean;
  note: string | null;
  createdAt: string;
  allocations?: PaymentAllocationDto[];
}

export interface MeasurementDto {
  id: string;
  guestId: string;
  measuredAt: string;
  weightKg: number | null;
  bodyFatPct: number | null;
  muscleMassKg: number | null;
  visceralFat: number | null;
  waistCm: number | null;
  hipCm: number | null;
  thighCm: number | null;
  armCm: number | null;
  chestCm: number | null;
  note: string | null;
  recordedByName: string;
}

export interface GuestPhotoDto {
  id: string;
  guestId: string;
  serviceId: string | null;
  serviceName: string | null;
  takenAt: string;
  fileUrl: string;
  mimeType: string;
  originalSizeBytes: number;
  compressedSizeBytes: number;
  width: number;
  height: number;
  visibilityRole: Role;
  note: string | null;
}

export interface GuestDocumentDto {
  id: string;
  guestId: string;
  guestName?: string;
  documentType: DocumentType;
  title: string;
  contentText: string;
  fieldsJson?: Record<string, string>;
  signatureDataUrl: string | null;
  signedAt: string | null;
  status: DocumentStatus;
  createdAt: string;
}

export interface GuestNoteDto {
  id: string;
  guestId: string;
  authorId: string;
  authorName: string;
  content: string;
  createdAt: string;
}

export interface MessageLogDto {
  id: string;
  guestId: string;
  guestName?: string;
  recipientEmail: string;
  subject: string;
  messageType: string;
  status: MessageStatus;
  sentAt: string;
  errorDetails?: string | null;
}

export interface AuditLogDto {
  id: string;
  userId: string;
  userName: string;
  action: string;
  entityType: string;
  entityId: string;
  createdAt: string;
  details: string;
}

/** A vendégadatlapon megjelenő belépés állapota: sikeres, sztornózott vagy elutasított. */
export type GuestArrivalStatus =
  | CheckInStatus.SUCCESS
  | CheckInStatus.CANCELLED
  | CheckInStatus.DENIED;

/**
 * Egy belépés a vendégadatlapon (TICKET-40): a beléptetési napló (`logged_check_ins`) sora.
 * A sztornózott belépés látogatása törlődik, a napló sora `CANCELLED` állapotban, a sztornó
 * okával megmarad; az elutasított beolvasás `DENIED` sor az elutasítás okával.
 */
export interface GuestArrivalDto {
  /** A beléptetés (napló) azonosítója. */
  id: string;
  occurredAt: string;
  visitType: VisitType;
  /** Kezelésnél a levont szolgáltatás, köredzésnél a bérlet szolgáltatása (ha van). */
  serviceName: string | null;
  guestPassId: string | null;
  /** A bérlet neve; havi tagsággal történt köredzésnél „Havi köredzés tagság”. */
  passName: string | null;
  staffName: string;
  status: GuestArrivalStatus;
  /** Sztornónál és elutasításnál az ok; sikeres belépésnél nincs. */
  reason: string | null;
}

export interface GuestDto {
  id: string;
  studioId: string;
  barcode: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  birthDate: string | null;
  nameDay: string | null; // MM-DD format e.g. "07-26"
  status: GuestStatus;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  passes?: GuestPassDto[];
  memberships?: MembershipDto[];
  treatmentHistory?: PassUsageLogDto[];
  visits?: VisitDto[];
  /** Belépések (beléptetési napló), legújabb elöl, legfeljebb `GUEST_ARRIVALS_LIMIT` (TICKET-40). */
  arrivals?: GuestArrivalDto[];
  payments?: PaymentDto[];
  measurements?: MeasurementDto[];
  photos?: GuestPhotoDto[];
  documents?: GuestDocumentDto[];
  internalNotes?: GuestNoteDto[];
  messageLogs?: MessageLogDto[];
}

export interface LoggedCheckInDto {
  id: string;
  studioId: string;
  guestId: string;
  guestName: string;
  guestBarcode: string;
  guestPassId: string | null;
  passName?: string | null;
  visitType?: VisitType;
  serviceName?: string | null;
  userId: string;
  staffName?: string;
  status: CheckInStatus;
  reason: string | null;
  reversalReason?: string | null;
  /** A beléptetéshez tartozó látogatás; sztornókor törlődik. */
  visitId?: string | null;
  createdAt: string;
}

export interface DailyFinanceSummaryDto {
  date: string;
  totalRevenue: number;
  monthlyRevenue?: number;
  byMethod: {
    CASH: number;
    POS_CARD: number;
    BANK_TRANSFER: number;
  };
  activeTransactionCount: number;
  cancelledTransactionCount: number;
  payments: PaymentDto[];
}

export interface OverdueSummaryItemDto {
  dueId: string;
  membershipId: string;
  guestId: string;
  guestName: string;
  guestBarcode: string;
  guestPhone: string | null;
  period: string;
  dueDate: string;
  amountHuf: number;
  paidAmountHuf: number;
  remainingHuf: number;
  overdueDays: number;
  overdueBucket: OverdueBucket;
}

export interface OverdueReportDto {
  totalOverdueHuf: number;
  totalOverdueCount: number;
  buckets: {
    DAYS_1_5: OverdueSummaryItemDto[];
    DAYS_6_15: OverdueSummaryItemDto[];
    DAYS_OVER_15: OverdueSummaryItemDto[];
  };
  items: OverdueSummaryItemDto[];
}

export interface TodayDashboardDto {
  date: string;
  arrivalsCount: number;
  circuitArrivalsCount: number;
  treatmentsUsedCount: number;
  passesSoldTodayCount: number;
  todayRevenueHuf: number;
  monthlyRevenueHuf: number;
  overdueTotalHuf: number;
  overdueCount: number;
  overdueByBucket: {
    DAYS_1_5: number;
    DAYS_6_15: number;
    DAYS_OVER_15: number;
  };
  expiringPasses: {
    passId: string;
    guestId: string;
    guestName: string;
    passName: string;
    remainingPasses: number | null;
    expirationDate: string;
    daysLeft: number;
  }[];
  celebrants: {
    guestId: string;
    guestName: string;
    barcode: string;
    type: 'BIRTHDAY' | 'NAMEDAY' | 'BOTH';
    detail: string;
  }[];
  serviceBreakdown: {
    serviceName: string;
    usageCount: number;
  }[];
}

export interface ScanCheckInRequestDto {
  barcode: string;
  visitType?: VisitType;
  forceDuplicate?: boolean;
  idempotencyKey?: string;
}

export interface DeductPassUsageRequestDto {
  guestId: string;
  passId: string;
  serviceId: string;
  operationKey?: string;
  note?: string;
}

export interface ReversePassUsageRequestDto {
  reversalReason: string;
}

export interface RevokeCheckInRequestDto {
  reason?: string;
}

export interface RecordPaymentRequestDto {
  guestId: string;
  amountHuf: number;
  paymentMethod: PaymentMethod;
  membershipDueId?: string | null;
  passId?: string | null;
  note?: string;
}

export interface OfflineScanItemDto {
  idempotencyKey: string;
  barcode: string;
  scannedAt: string;
}

export interface OfflineSyncResponseDto {
  processed: number;
  /** Ennyi tételnél kell kezelésválasztás: nem rögzült belépés (TICKET-39). */
  treatmentSelectionRequired: number;
  results: CheckInResultPayload[];
}

export type DisplayDeviceStatus = 'PENDING_PAIRING' | 'PAIRED' | 'EXPIRED';

export interface DisplayDeviceDto {
  id: string;
  name: string;
  status: DisplayDeviceStatus;
  pairingCode: string | null;
  pairingExpiresAt: string | null;
  pairedAt: string | null;
  isActive: boolean;
  lastSeenAt: string | null;
  lastActivityType: string | null;
  isOnline?: boolean;
  createdAt: string;
}

export interface PairDisplayResponseDto {
  deviceToken: string;
  device: DisplayDeviceDto;
}

