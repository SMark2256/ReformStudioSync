import type {
  BookingPassWarning,
  BookingRuleSettings,
  BookingStatusValue,
  DayClosedReason,
  DayHours,
} from './booking-rules';
import { PassStatus, PassType } from './enums';

/** Online időpontfoglalás szerződései (TICKET-57). */

export enum BookingStatus {
  CONFIRMED = 'CONFIRMED',
  LATE = 'LATE',
  ARRIVED = 'ARRIVED',
  NO_SHOW = 'NO_SHOW',
  CANCELLED = 'CANCELLED',
}

export enum BookingSource {
  ONLINE = 'ONLINE',
  RECEPTION = 'RECEPTION',
  WAITLIST = 'WAITLIST',
}

export enum WaitlistStatus {
  WAITING = 'WAITING',
  OFFERED = 'OFFERED',
  BOOKED = 'BOOKED',
  DECLINED = 'DECLINED',
  EXPIRED = 'EXPIRED',
  CANCELLED = 'CANCELLED',
}

export const BOOKING_STATUS_LABELS: Record<BookingStatusValue, string> = {
  CONFIRMED: 'Visszaigazolva',
  LATE: 'Késik',
  ARRIVED: 'Megérkezett',
  NO_SHOW: 'Nem jelent meg',
  CANCELLED: 'Lemondva',
};

export const DAY_CLOSED_REASON_LABELS: Record<DayClosedReason, string> = {
  WEEKLY_CLOSED: 'Zárva (hétvége)',
  HOLIDAY: 'Munkaszüneti nap',
  OVERRIDE_CLOSED: 'Zárva (recepciós beállítás)',
};

// ---------------------------------------------------------------------------
// Recepció
// ---------------------------------------------------------------------------

export interface BookingResourceDto {
  id: string;
  name: string;
  capacity: number;
  isActive: boolean;
  sortOrder: number;
}

export interface BookableTreatmentDto {
  id: string;
  name: string;
  resourceId: string;
  resourceName: string;
  /** A bérletillesztéshez használt szolgáltatás (`Service`). */
  serviceId: string | null;
  durationMinutes: number;
  bufferMinutes: number;
  /** A többkezeléses foglalás sorrendje. */
  sortOrder: number;
  isActive: boolean;
  /** Online (a `/foglalas` oldalon) foglalható. */
  isOnline: boolean;
}

export interface BookingDto {
  id: string;
  /** A többkezeléses foglalás közös azonosítója. */
  groupId: string;
  guestId: string;
  guestName: string;
  guestPhone: string | null;
  guestEmail: string | null;
  guestBarcode: string;
  treatmentId: string;
  treatmentName: string;
  resourceId: string;
  resourceName: string;
  startsAt: string;
  endsAt: string;
  /** A kezelés vége + a gép szünete. */
  blockedUntil: string;
  status: BookingStatus;
  source: BookingSource;
  passWarning: BookingPassWarning | null;
  /** Levonás történt (megérkezés vagy „Nem jelent meg”), és nincs visszavonva. */
  deducted: boolean;
  passUsageId: string | null;
  note: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  createdAt: string;
}

export interface BookingSettingsDto extends BookingRuleSettings {
  /** Helyszín az e-mailekben (cím, megközelítés). */
  locationText: string;
}

export interface BookingClosureDto {
  id: string;
  startsAt: string;
  endsAt: string;
  /** `null`: rendkívüli zárvatartás; egyébként a letiltott gép. */
  resourceId: string | null;
  resourceName: string | null;
  reason: string | null;
  createdAt: string;
}

export interface HolidayOverrideDto {
  id: string;
  dayKey: string;
  isOpen: boolean;
  note: string | null;
}

export interface BookingDayDto {
  dayKey: string;
  hours: DayHours | null;
  closedReason: DayClosedReason | null;
  holidayName: string | null;
}

/** Várólistás ajánlat ideiglenes helyfoglalása (beszámít a kapacitásba). */
export interface BookingHoldDto {
  waitlistEntryId: string;
  resourceId: string;
  treatmentName: string;
  guestName: string;
  startsAt: string;
  blockedUntil: string;
  expiresAt: string;
}

export interface BookingCalendarDto {
  from: string;
  to: string;
  days: BookingDayDto[];
  resources: BookingResourceDto[];
  treatments: BookableTreatmentDto[];
  bookings: BookingDto[];
  closures: BookingClosureDto[];
  holds: BookingHoldDto[];
}

export interface SequenceSlotItemDto {
  treatmentId: string;
  treatmentName: string;
  resourceId: string;
  startsAt: string;
  endsAt: string;
}

export interface SequenceSlotDto {
  startsAt: string;
  endsAt: string;
  items: SequenceSlotItemDto[];
  /** A legszűkebb kezelés szabad helyei. */
  remaining: number;
}

export interface BookingAvailabilityDto {
  dayKey: string;
  day: BookingDayDto;
  slots: SequenceSlotDto[];
}

export interface BookingPassWarningItem {
  treatmentId: string;
  treatmentName: string;
  warning: BookingPassWarning;
}

export interface CreateStaffBookingRequestDto {
  guestId: string;
  treatmentIds: string[];
  /** A kezdés; helyben beengedésnél (`walkIn`) nem kell, a szerver számolja. */
  startsAt?: string;
  /** A 30 napos és 30 perces korlát felülírása (a kapacitás nem írható felül). */
  overrideRules?: boolean;
  /**
   * Helyben beengedés, „Most kezdődik” (TICKET-59): a kezdés a mostani idő 5 percre lefelé
   * kerekítve (`walkInStart`). Az időablakot felülírja, a nyitvatartást és a kapacitást nem.
   */
  walkIn?: boolean;
  note?: string;
}

export interface CreateBookingResponseDto {
  groupId: string;
  bookings: BookingDto[];
  warnings: BookingPassWarningItem[];
}

export interface RescheduleBookingRequestDto {
  startsAt: string;
  /** A 30 napos, 30 perces és 24 órás korlát felülírása. */
  overrideRules?: boolean;
}

export interface CancelBookingRequestDto {
  reason?: string;
  /** A 24 órás korlát felülírása (recepció). */
  overrideRules?: boolean;
}

export interface UpdateBookingStatusRequestDto {
  status: BookingStatus;
  reason?: string;
}

/** Mi történt a bérlettel az állapotváltáskor. */
export type BookingDeductionOutcome =
  | 'DEDUCTED'
  | 'ALREADY_DEDUCTED'
  /** A vendégnek ma már levonták ezt a kezelést (pl. beolvasáskor); a foglalás ehhez kapcsolódott. */
  | 'LINKED_EXISTING'
  | 'NO_USABLE_PASS'
  | 'REVERSED'
  | 'NONE';

export interface UpdateBookingStatusResponseDto {
  booking: BookingDto;
  deduction: BookingDeductionOutcome;
  passName: string | null;
  remainingPasses: number | 'Korlátlan' | null;
}

export interface CreateClosureRequestDto {
  startsAt: string;
  endsAt: string;
  resourceId?: string | null;
  reason?: string;
}

/** A zárvatartás csak figyelmeztet: az érintett foglalások változatlanok maradnak. */
export interface CreateClosureResponseDto {
  closure: BookingClosureDto;
  affectedBookings: BookingDto[];
}

export interface UpsertHolidayOverrideRequestDto {
  dayKey: string;
  isOpen: boolean;
  note?: string;
}

export interface UpdateTreatmentRequestDto {
  sortOrder?: number;
  isActive?: boolean;
  isOnline?: boolean;
}

export interface UpdateResourceRequestDto {
  isActive?: boolean;
}

export interface BookingSettingsBundleDto {
  settings: BookingSettingsDto;
  resources: BookingResourceDto[];
  treatments: BookableTreatmentDto[];
  closures: BookingClosureDto[];
  holidayOverrides: HolidayOverrideDto[];
  /** Az idei és a jövő évi munkaszüneti napok a felülírással. */
  holidays: { dayKey: string; name: string; isOpen: boolean }[];
}

export interface WaitlistEntryDto {
  id: string;
  guestId: string;
  guestName: string;
  treatmentId: string;
  treatmentName: string;
  dayKey: string;
  fromMinutes: number;
  toMinutes: number;
  status: WaitlistStatus;
  offerStartsAt: string | null;
  offerExpiresAt: string | null;
  createdAt: string;
}

export interface CreateStaffWaitlistRequestDto {
  guestId: string;
  treatmentId: string;
  dayKey: string;
  fromTime: string;
  toTime: string;
}

export interface CalendarSyncFailureDto {
  id: string;
  bookingId: string;
  operation: 'UPSERT' | 'DELETE';
  attempts: number;
  lastError: string | null;
  updatedAt: string;
}

export interface CalendarSyncStatusDto {
  /** A Google Naptár env-változói be vannak állítva. */
  configured: boolean;
  pending: number;
  failed: number;
  lastSyncedAt: string | null;
  failures: CalendarSyncFailureDto[];
}

export interface BookingAuditEntryDto {
  id: string;
  action: string;
  details: string | null;
  userName: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Nyilvános foglaló (`/foglalas`)
// ---------------------------------------------------------------------------

export interface PublicTreatmentDto {
  id: string;
  name: string;
  durationMinutes: number;
  sortOrder: number;
}

export interface PublicBookingCatalogDto {
  treatments: PublicTreatmentDto[];
  maxAdvanceDays: number;
  minLeadMinutes: number;
  changeCutoffHours: number;
  locationText: string;
  /** A stúdió mai napja (Europe/Budapest). */
  today: string;
}

export interface PublicContactDto {
  lastName: string;
  firstName: string;
  email: string;
  phone: string;
}

export interface PublicCreateBookingRequestDto {
  treatmentIds: string[];
  startsAt: string;
  /** Bejelentkezés nélkül kötelező; bejelentkezve a vendégprofil adatai számítanak. */
  contact?: PublicContactDto;
  note?: string;
  privacyAccepted: boolean;
}

export interface PublicBookingSummaryDto {
  id: string;
  groupId: string;
  treatmentName: string;
  startsAt: string;
  endsAt: string;
  status: BookingStatus;
  /** Online még módosítható / lemondható (24 órás szabály). */
  canChange: boolean;
  changeDeadline: string;
}

export interface PublicCreatedBookingDto extends PublicBookingSummaryDto {
  /** Az egyszer megjelenő kezelőlink tokenje (`/foglalas/kezeles/:token`); a szerveren csak a hash-e van. */
  manageToken: string;
}

export interface PublicCreateBookingResponseDto {
  groupId: string;
  bookings: PublicCreatedBookingDto[];
  /** Csak azonosított (bejelentkezett) vendégnek: a bérletadat személyes adat. */
  passWarnings: BookingPassWarningItem[];
}

export interface GuestPassSummaryDto {
  id: string;
  name: string;
  serviceName: string | null;
  type: PassType;
  remainingPasses: number | null;
  totalPasses: number | null;
  expirationDate: string;
  /** Percre pontos lejárat (napijegy, TICKET-7). */
  validUntil?: string | null;
  status: PassStatus;
}

export interface GuestBookingProfileDto {
  firstName: string;
  lastName: string;
  email: string;
  passes: GuestPassSummaryDto[];
  bookings: PublicBookingSummaryDto[];
}

export interface GuestLoginResponseDto {
  guestToken: string;
  expiresAt: string;
  profile: GuestBookingProfileDto;
}

export interface PublicManageBookingDto extends PublicBookingSummaryDto {
  treatmentId: string;
  guestFirstName: string;
  locationText: string;
}

export interface PublicRescheduleRequestDto {
  startsAt: string;
}

export interface PublicWaitlistRequestDto {
  treatmentId: string;
  dayKey: string;
  fromTime: string;
  toTime: string;
  contact?: PublicContactDto;
  privacyAccepted: boolean;
}

export interface PublicWaitlistOfferDto {
  status: WaitlistStatus;
  treatmentName: string;
  guestFirstName: string;
  offerStartsAt: string | null;
  offerExpiresAt: string | null;
}

export interface PublicWaitlistAcceptResponseDto {
  booking: PublicCreatedBookingDto;
}
