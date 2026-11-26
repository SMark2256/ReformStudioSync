import {
  addDaysToDayKey,
  appError,
  AppErrorCode,
  APP_ERROR_CATALOG,
  BookableTreatmentDto,
  BookingAuditEntryDto,
  BookingAvailabilityDto,
  BookingCalendarDto,
  BookingClosureDto,
  BookingContext,
  BookingDayDto,
  BookingDeductionOutcome,
  BookingDto,
  BookingPassInput,
  BookingPassWarning,
  bookingPassWarning,
  BookingPassWarningItem,
  BookingResourceDto,
  BookingSettingsBundleDto,
  BookingSettingsDto,
  BookingSource,
  BookingStatus,
  BookingStatusValue,
  bookingsAffectedByClosure,
  bookingTransition,
  BookingWindowError,
  CalendarSyncStatusDto,
  CancelBookingRequestDto,
  changeDeadline,
  checkBookingWindow,
  checkChangeWindow,
  checkSequence,
  COSMETIC_RESOURCE_NAME,
  COSMETIC_TREATMENTS,
  CreateBookingResponseDto,
  CreateClosureRequestDto,
  CreateClosureResponseDto,
  CreateStaffBookingRequestDto,
  CreateStaffWaitlistRequestDto,
  dayKeysBetween,
  DEFAULT_BOOKING_SETTINGS,
  findSequenceSlots,
  Gender,
  GuestBookingProfileDto,
  GuestDto,
  GuestLoginResponseDto,
  HolidayOverrideDto,
  hungarianPublicHolidays,
  isDayKey,
  normalizeOpeningHours,
  OccupancyItem,
  orderTreatments,
  parseTimeOfDay,
  pickBookingPass,
  PlacementError,
  planItem,
  planSequence,
  PublicBookingCatalogDto,
  PublicBookingSummaryDto,
  PublicContactDto,
  PublicCreateBookingRequestDto,
  PublicCreateBookingResponseDto,
  PublicManageBookingDto,
  PublicWaitlistAcceptResponseDto,
  PublicWaitlistOfferDto,
  PublicWaitlistRequestDto,
  RescheduleBookingRequestDto,
  resolveDayHours,
  studioDateTime,
  studioMinutesOfDay,
  toStudioDayKey,
  UpdateBookingStatusRequestDto,
  UpdateBookingStatusResponseDto,
  UpsertHolidayOverrideRequestDto,
  WaitlistEntryDto,
  WaitlistStatus,
  walkInStart,
} from '@reform/shared';
import { mockStudioEngine } from './mock-engine';

// Az időpontfoglalás (TICKET-57) kliensoldali párja: ugyanazokkal a `@reform/shared`
// szabályokkal (nyitvatartás, kapacitás, 30 nap / 30 perc / 24 óra, sorrend), mint az API. A
// vendégek és a bérletek a mock motorban élnek, a foglalások saját tárolóban. Demóban nincs
// levél: a vendég belépőkódja a válaszban jön vissza. A v2 (TICKET-59) a „Kozmetikus 1”-et és az
// utolsó kezdést hozza: a régi demóállapot helyett a friss kiinduló adat töltődik be.
const BOOKING_STORAGE_KEY = 'reform-studio-mock-booking-v2';
/** A kozmetikai kezelések a mock motor kozmetikai szolgáltatására (és bérletére) szólnak. */
const COSMETIC_SERVICE_NAME = 'Hialuronos Arckezelés & Rádiófrekvencia';
const DEMO_GUEST_CODE = '123456';
const MINUTE_MS = 60_000;

interface TreatmentRow extends Omit<BookableTreatmentDto, 'resourceName' | 'serviceId'> {
  /** A mock motor szolgáltatása (név szerint); nincs ilyen szolgáltatás: nincs rá bérlet. */
  serviceName: string | null;
}

interface BookingRow {
  id: string;
  groupId: string;
  guestId: string;
  treatmentId: string;
  resourceId: string;
  startsAt: string;
  endsAt: string;
  blockedUntil: string;
  status: BookingStatus;
  source: BookingSource;
  passWarning: BookingPassWarning | null;
  passUsageId: string | null;
  deductionSeq: number;
  note: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  createdAt: string;
  manageToken: string;
}

interface WaitlistRow {
  id: string;
  guestId: string;
  treatmentId: string;
  dayKey: string;
  fromMinutes: number;
  toMinutes: number;
  status: WaitlistStatus;
  offerStartsAt: string | null;
  offerExpiresAt: string | null;
  offerToken: string | null;
  createdAt: string;
}

interface ClosureRow {
  id: string;
  startsAt: string;
  endsAt: string;
  resourceId: string | null;
  reason: string | null;
  createdAt: string;
}

interface AuditRow extends BookingAuditEntryDto {
  entityId: string;
}

interface MockBookingState {
  settings: BookingSettingsDto;
  resources: BookingResourceDto[];
  treatments: TreatmentRow[];
  bookings: BookingRow[];
  closures: ClosureRow[];
  holidayOverrides: HolidayOverrideDto[];
  waitlist: WaitlistRow[];
  audit: AuditRow[];
  codes: { email: string; code: string; expiresAt: string; attempts: number }[];
}

const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const randomToken = () =>
  Array.from({ length: 4 }, () => Math.random().toString(36).slice(2, 12)).join('').padEnd(40, 'x');
const iso = (d: Date) => d.toISOString();

/** A nap (vagy a következő nyitott nap), a demóadatokhoz. */
function nextOpenDay(from: string, settings: BookingSettingsDto): string {
  let day = from;
  for (let i = 0; i < 14 && !resolveDayHours(day, settings).hours; i++) day = addDaysToDayKey(day, 1);
  return day;
}

function createInitialBookingState(now = new Date()): MockBookingState {
  const settings: BookingSettingsDto = {
    ...DEFAULT_BOOKING_SETTINGS,
    locationText: 'Re-Form Stúdió, 1234 Budapest, Minta utca 1.',
  };
  const resources: BookingResourceDto[] = [
    { id: 'br-hypoxi', name: 'Hypoxi Trainer', capacity: 3, isActive: true, sortOrder: 1 },
    { id: 'br-nyirok', name: 'Nyirokmasszázs gép', capacity: 2, isActive: true, sortOrder: 2 },
    { id: 'br-hiemt', name: 'HIEMT / Intimpad gép', capacity: 1, isActive: true, sortOrder: 3 },
    { id: 'br-ceragem', name: 'Ceragem', capacity: 1, isActive: true, sortOrder: 4 },
    { id: 'br-flabelos', name: 'Flabelos', capacity: 1, isActive: true, sortOrder: 5 },
    { id: 'br-kozmetikus', name: COSMETIC_RESOURCE_NAME, capacity: 1, isActive: true, sortOrder: 6 },
  ];
  const treatment = (
    id: string,
    name: string,
    resourceId: string,
    durationMinutes: number,
    sortOrder: number,
    serviceName: string | null = null,
    cosmetic = false,
  ): TreatmentRow => ({
    id,
    name,
    resourceId,
    serviceName,
    durationMinutes,
    // A kozmetikai kezelés ideje az előkészítést és az elpakolást is tartalmazza.
    bufferMinutes: cosmetic ? 0 : 5,
    sortOrder,
    isActive: true,
    // Kozmetikai kezelés egyelőre csak a recepción foglalható.
    isOnline: !cosmetic,
  });
  const treatments = [
    treatment('bt-hypoxi', 'Hypoxi Trainer', 'br-hypoxi', 30, 1, 'Hypoxi'),
    treatment('bt-nyirok', 'Gépi nyirokmasszázs', 'br-nyirok', 30, 2),
    treatment('bt-hiemt', 'HIEMT', 'br-hiemt', 30, 3),
    treatment('bt-intimpad', 'Intimpad', 'br-hiemt', 30, 4),
    treatment('bt-ceragem', 'Ceragem', 'br-ceragem', 40, 5),
    treatment('bt-flabelos', 'Flabelos', 'br-flabelos', 10, 6),
    ...COSMETIC_TREATMENTS.map((t, index) =>
      treatment(`bt-cosmetic-${index + 1}`, t.name, 'br-kozmetikus', t.durationMinutes, 7 + index, COSMETIC_SERVICE_NAME, true),
    ),
  ];

  const day = nextOpenDay(toStudioDayKey(now), settings);
  const nextDay = nextOpenDay(addDaysToDayKey(day, 1), settings);
  const seedBooking = (id: string, guestId: string, treatmentId: string, dayKey: string, minutes: number): BookingRow => {
    const t = treatments.find((x) => x.id === treatmentId)!;
    const item = planItem(t, studioDateTime(dayKey, minutes));
    return {
      id,
      groupId: `grp-${id}`,
      guestId,
      treatmentId,
      resourceId: t.resourceId,
      startsAt: iso(item.startsAt),
      endsAt: iso(item.endsAt),
      blockedUntil: iso(item.blockedUntil),
      status: BookingStatus.CONFIRMED,
      source: BookingSource.RECEPTION,
      passWarning: null,
      passUsageId: null,
      deductionSeq: 0,
      note: null,
      cancelledAt: null,
      cancelReason: null,
      createdAt: iso(now),
      manageToken: `demo-manage-${id}-${'0'.repeat(24)}`,
    };
  };
  return {
    settings,
    resources,
    treatments,
    bookings: [
      seedBooking('bk-demo-1', 'guest-1', 'bt-hypoxi', day, 9 * 60),
      seedBooking('bk-demo-2', 'guest-3', 'bt-ceragem', day, 10 * 60),
      seedBooking('bk-demo-3', 'guest-2', 'bt-flabelos', day, 14 * 60),
      seedBooking('bk-demo-4', 'guest-1', 'bt-hiemt', nextDay, 11 * 60),
    ],
    closures: [],
    holidayOverrides: [],
    waitlist: [],
    audit: [],
    codes: [],
  };
}

const PLACEMENT_ERRORS: Record<PlacementError, AppErrorCode> = {
  CLOSED: 'BOOKING.CLOSED',
  OUTSIDE_OPENING_HOURS: 'BOOKING.OUTSIDE_OPENING_HOURS',
  RESOURCE_BLOCKED: 'BOOKING.RESOURCE_BLOCKED',
  CAPACITY_FULL: 'BOOKING.CAPACITY_FULL',
  GUEST_OVERLAP: 'BOOKING.GUEST_OVERLAP',
};

function placementError(error: PlacementError, treatmentName?: string) {
  const code = PLACEMENT_ERRORS[error];
  return appError(code, {
    message: treatmentName ? `${treatmentName}: ${APP_ERROR_CATALOG[code].message}` : undefined,
  });
}

function windowError(error: BookingWindowError | 'CHANGE_CUTOFF', settings: BookingSettingsDto) {
  switch (error) {
    case 'IN_PAST':
      return appError('BOOKING.IN_PAST');
    case 'TOO_LATE':
      return appError('BOOKING.TOO_LATE', {
        message: `Online legalább ${settings.minLeadMinutes} perccel a kezdés előtt lehet foglalni.`,
      });
    case 'TOO_FAR':
      return appError('BOOKING.TOO_FAR', {
        message: `Legfeljebb ${settings.maxAdvanceDays} nappal előre lehet foglalni.`,
      });
    case 'CHANGE_CUTOFF':
      return appError('BOOKING.CHANGE_CUTOFF', {
        message: `Online módosítás és lemondás a kezdés előtt legalább ${settings.changeCutoffHours} órával lehetséges. Ezután a recepció tud segíteni.`,
      });
  }
}

const OPEN_STATUSES: BookingStatus[] = [BookingStatus.CONFIRMED, BookingStatus.LATE];
const SESSION_PREFIX = 'mock-session:';

interface CreateGroupInput {
  guestId: string;
  treatmentIds: string[];
  startsAt: Date;
  override: boolean;
  source: BookingSource;
  onlineOnly?: boolean;
  note?: string;
  excludeRefIds?: string[];
  skipWindow?: boolean;
  walkIn?: boolean;
  userName: string | null;
}

class MockBookingEngine {
  private listeners = new Set<() => void>();

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (event) => {
        if (event.key === BOOKING_STORAGE_KEY || event.key === null) this.emit();
      });
    }
  }

  /** A recepciós naptár demóban erre frissül (a valós idejű socket párja). */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit() {
    for (const listener of [...this.listeners]) listener();
  }

  reset(): void {
    if (typeof window !== 'undefined') localStorage.removeItem(BOOKING_STORAGE_KEY);
    this.emit();
  }

  private load(now = new Date()): MockBookingState {
    let state: MockBookingState;
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem(BOOKING_STORAGE_KEY) : null;
      state = raw ? (JSON.parse(raw) as MockBookingState) : createInitialBookingState(now);
    } catch {
      state = createInitialBookingState(now);
    }
    // A lejárt várólistás ajánlatok (az API ütemezőjének párja) olvasáskor járnak le.
    if (this.expireOffers(state, now)) this.save(state);
    return state;
  }

  private save(state: MockBookingState) {
    if (typeof window === 'undefined') return;
    localStorage.setItem(BOOKING_STORAGE_KEY, JSON.stringify(state));
    this.emit();
  }

  // -------------------------------------------------------------------------
  // Segédek
  // -------------------------------------------------------------------------

  private guests(): Map<string, GuestDto> {
    return new Map(mockStudioEngine.getGuests().map((g) => [g.id, g]));
  }

  private serviceIdOf(t: TreatmentRow): string | null {
    if (!t.serviceName) return null;
    return mockStudioEngine.getServices(true).find((s) => s.name === t.serviceName)?.id ?? null;
  }

  private treatmentDto(state: MockBookingState, t: TreatmentRow): BookableTreatmentDto {
    const { serviceName: _serviceName, ...rest } = t;
    return {
      ...rest,
      serviceId: this.serviceIdOf(t),
      resourceName: state.resources.find((r) => r.id === t.resourceId)?.name ?? 'Gép',
    };
  }

  private bookingDto(state: MockBookingState, b: BookingRow, guests = this.guests()): BookingDto {
    const guest = guests.get(b.guestId);
    const { manageToken: _token, deductionSeq: _seq, ...rest } = b;
    return {
      ...rest,
      guestName: guest ? `${guest.lastName} ${guest.firstName}` : 'Ismeretlen vendég',
      guestPhone: guest?.phone ?? null,
      guestEmail: guest?.email ?? null,
      guestBarcode: guest?.barcode ?? '',
      treatmentName: state.treatments.find((t) => t.id === b.treatmentId)?.name ?? 'Kezelés',
      resourceName: state.resources.find((r) => r.id === b.resourceId)?.name ?? 'Gép',
      deducted: Boolean(b.passUsageId),
    };
  }

  private dayDto(state: MockBookingState, dayKey: string): BookingDayDto {
    const day = resolveDayHours(dayKey, state.settings, state.holidayOverrides);
    return { dayKey, hours: day.hours, closedReason: day.closedReason, holidayName: day.holidayName };
  }

  private liveHolds(state: MockBookingState, now: Date) {
    return state.waitlist.filter(
      (w) => w.status === WaitlistStatus.OFFERED && w.offerStartsAt && w.offerExpiresAt && new Date(w.offerExpiresAt) > now,
    );
  }

  private context(state: MockBookingState, now: Date, guestId?: string | null): BookingContext {
    const occupancy: OccupancyItem[] = state.bookings
      .filter((b) => b.status !== BookingStatus.CANCELLED)
      .map((b) => ({ refId: b.id, resourceId: b.resourceId, startsAt: b.startsAt, blockedUntil: b.blockedUntil }));
    for (const hold of this.liveHolds(state, now)) {
      const treatment = state.treatments.find((t) => t.id === hold.treatmentId);
      if (!treatment) continue;
      const item = planItem(treatment, new Date(hold.offerStartsAt!));
      occupancy.push({ refId: `hold:${hold.id}`, resourceId: item.resourceId, startsAt: item.startsAt, blockedUntil: item.blockedUntil });
    }
    return {
      settings: state.settings,
      overrides: state.holidayOverrides,
      closures: state.closures,
      occupancy,
      guestBusy: guestId
        ? state.bookings
            .filter((b) => b.guestId === guestId && b.status !== BookingStatus.CANCELLED)
            .map((b) => ({ refId: b.id, startsAt: b.startsAt, endsAt: b.endsAt }))
        : [],
    };
  }

  private pickTreatments(state: MockBookingState, ids: readonly string[], onlineOnly = false): TreatmentRow[] {
    const unique = [...new Set(ids)];
    if (unique.length === 0) throw appError('BOOKING.NO_TREATMENTS');
    return unique.map((id) => {
      const t = state.treatments.find((x) => x.id === id && x.isActive && (!onlineOnly || x.isOnline));
      if (!t) throw appError('BOOKING.TREATMENT_NOT_FOUND');
      return t;
    });
  }

  private guestPasses(guestId: string, t: TreatmentRow): { passes: BookingPassInput[]; serviceId: string | null } {
    const serviceId = this.serviceIdOf(t);
    // A mock motorban nem létező szolgáltatásra nincs bérlet.
    if (!serviceId) return { passes: [], serviceId: null };
    const passes = mockStudioEngine.getGuestPasses(guestId).map((p) => ({
      id: p.id,
      type: p.type,
      remainingPasses: p.calculatedRemainingPasses ?? p.remainingPasses,
      startDate: p.startDate,
      expirationDate: p.expirationDate,
      validUntil: p.validUntil ?? null,
      isFrozen: p.isFrozen,
      cancelledAt: p.cancelledAt ?? null,
      serviceId: p.serviceId ?? null,
    }));
    return { passes, serviceId };
  }

  private log(state: MockBookingState, entityId: string, action: string, details: string, userName: string | null) {
    state.audit.unshift({ id: uid('aud'), entityId, action, details, userName, createdAt: iso(new Date()) });
  }

  private createGroup(state: MockBookingState, input: CreateGroupInput, now: Date) {
    const treatments = this.pickTreatments(state, input.treatmentIds, input.onlineOnly);
    const timing = checkBookingWindow(input.startsAt, now, state.settings, input.override || input.skipWindow);
    if (timing) throw windowError(timing, state.settings);
    const ordered = orderTreatments(treatments);
    const items = planSequence(ordered, input.startsAt);
    const resources = new Map(state.resources.map((r) => [r.id, r]));
    const failure = checkSequence(items, resources, this.context(state, now, input.guestId), input.excludeRefIds);
    if (failure) {
      throw placementError(failure.error, ordered.length > 1 ? ordered[failure.index].name : undefined);
    }

    const guest = mockStudioEngine.getGuestById(input.guestId);
    const groupId = uid('grp');
    const warnings: BookingPassWarningItem[] = [];
    const rows = items.map((item, index) => {
      const t = ordered[index];
      const { passes, serviceId } = this.guestPasses(input.guestId, t);
      const upcoming = state.bookings.filter(
        (b) =>
          b.guestId === input.guestId &&
          OPEN_STATUSES.includes(b.status) &&
          !b.passUsageId &&
          new Date(b.startsAt) >= now &&
          state.treatments.find((x) => x.id === b.treatmentId)?.serviceName === t.serviceName,
      ).length;
      const inGroup = ordered.filter((x) => x.serviceName === t.serviceName).length;
      const warning = bookingPassWarning(passes, serviceId, upcoming + inGroup, now, guest.gender);
      if (warning) warnings.push({ treatmentId: t.id, treatmentName: t.name, warning });
      const row: BookingRow = {
        id: uid('bk'),
        groupId,
        guestId: input.guestId,
        treatmentId: t.id,
        resourceId: item.resourceId,
        startsAt: iso(item.startsAt),
        endsAt: iso(item.endsAt),
        blockedUntil: iso(item.blockedUntil),
        status: BookingStatus.CONFIRMED,
        source: input.source,
        passWarning: warning,
        passUsageId: null,
        deductionSeq: 0,
        note: input.note?.trim() || null,
        cancelledAt: null,
        cancelReason: null,
        createdAt: iso(now),
        manageToken: randomToken(),
      };
      return row;
    });
    state.bookings.push(...rows);
    this.log(
      state,
      groupId,
      input.source === BookingSource.ONLINE ? 'BOOKING_CREATED_ONLINE' : 'BOOKING_CREATED',
      `${guest.lastName} ${guest.firstName}: ${ordered.map((t) => t.name).join(', ')}${input.walkIn ? ' (helyben beengedés)' : input.override ? ' (időkorlát felülírva)' : ''}`,
      input.userName,
    );
    return { groupId, rows, warnings, ordered };
  }

  private findBooking(state: MockBookingState, id: string): BookingRow {
    const booking = state.bookings.find((b) => b.id === id);
    if (!booking) throw appError('BOOKING.NOT_FOUND');
    return booking;
  }

  private assertChangeable(booking: BookingRow) {
    if (booking.status === BookingStatus.CANCELLED) throw appError('BOOKING.ALREADY_CANCELLED');
    if (!OPEN_STATUSES.includes(booking.status)) {
      throw appError('BOOKING.INVALID_STATUS_CHANGE', {
        message: 'Csak a még meg nem történt (visszaigazolt vagy késő) foglalás módosítható.',
      });
    }
  }

  private doReschedule(state: MockBookingState, booking: BookingRow, startsAt: Date, override: boolean, now: Date) {
    this.assertChangeable(booking);
    const cutoff = checkChangeWindow(booking.startsAt, now, state.settings, override);
    if (cutoff) throw windowError(cutoff, state.settings);
    const timing = checkBookingWindow(startsAt, now, state.settings, override);
    if (timing) throw windowError(timing, state.settings);
    const treatment = state.treatments.find((t) => t.id === booking.treatmentId);
    if (!treatment) throw appError('BOOKING.TREATMENT_NOT_FOUND');
    const item = planItem(treatment, startsAt);
    const resources = new Map(state.resources.map((r) => [r.id, r]));
    const failure = checkSequence([item], resources, this.context(state, now, booking.guestId), [booking.id]);
    if (failure) throw placementError(failure.error);
    const before = { resourceId: booking.resourceId, startsAt: booking.startsAt };
    booking.startsAt = iso(item.startsAt);
    booking.endsAt = iso(item.endsAt);
    booking.blockedUntil = iso(item.blockedUntil);
    booking.resourceId = item.resourceId;
    return before;
  }

  private doCancel(state: MockBookingState, booking: BookingRow, override: boolean, reason: string | null, now: Date) {
    this.assertChangeable(booking);
    const cutoff = checkChangeWindow(booking.startsAt, now, state.settings, override);
    if (cutoff) throw windowError(cutoff, state.settings);
    booking.status = BookingStatus.CANCELLED;
    booking.cancelledAt = iso(now);
    booking.cancelReason = reason;
  }

  /** Felszabadult hely: a legrégebben várakozó, megfelelő vendég kap ajánlatot (tartással). */
  private offerReleased(state: MockBookingState, resourceId: string, dayKey: string, now: Date): number {
    if (dayKey < toStudioDayKey(now)) return 0;
    const treatments = state.treatments.filter((t) => t.resourceId === resourceId && t.isActive);
    const entries = state.waitlist
      .filter((w) => w.dayKey === dayKey && w.status === WaitlistStatus.WAITING && treatments.some((t) => t.id === w.treatmentId))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    let made = 0;
    for (const entry of entries) {
      const treatment = treatments.find((t) => t.id === entry.treatmentId)!;
      const slot = findSequenceSlots({
        dayKey,
        treatments: [treatment],
        resources: state.resources,
        ctx: this.context(state, now, entry.guestId),
        now,
      }).find((s) => {
        const minute = studioMinutesOfDay(s.startsAt);
        return minute >= entry.fromMinutes && minute < entry.toMinutes;
      });
      if (!slot) continue;
      entry.status = WaitlistStatus.OFFERED;
      entry.offerStartsAt = iso(slot.startsAt);
      entry.offerExpiresAt = iso(new Date(now.getTime() + state.settings.holdMinutes * MINUTE_MS));
      entry.offerToken = randomToken();
      this.log(state, entry.id, 'WAITLIST_OFFERED', `Várólistás ajánlat: ${treatment.name}, ${entry.offerStartsAt}`, null);
      made++;
    }
    return made;
  }

  private expireOffers(state: MockBookingState, now: Date): boolean {
    const expired = state.waitlist.filter(
      (w) => w.status === WaitlistStatus.OFFERED && w.offerExpiresAt && new Date(w.offerExpiresAt) <= now,
    );
    for (const entry of expired) {
      entry.status = WaitlistStatus.EXPIRED;
      const treatment = state.treatments.find((t) => t.id === entry.treatmentId);
      if (treatment) this.offerReleased(state, treatment.resourceId, entry.dayKey, now);
    }
    return expired.length > 0;
  }

  private release(state: MockBookingState, resourceId: string, startsAt: string, now: Date) {
    this.offerReleased(state, resourceId, toStudioDayKey(startsAt), now);
  }

  private summary(state: MockBookingState, b: BookingRow, now: Date): PublicBookingSummaryDto {
    return {
      id: b.id,
      groupId: b.groupId,
      treatmentName: state.treatments.find((t) => t.id === b.treatmentId)?.name ?? 'Kezelés',
      startsAt: b.startsAt,
      endsAt: b.endsAt,
      status: b.status,
      canChange: OPEN_STATUSES.includes(b.status) && checkChangeWindow(b.startsAt, now, state.settings) === null,
      changeDeadline: iso(changeDeadline(b.startsAt, state.settings)),
    };
  }

  private availabilityFor(
    state: MockBookingState,
    query: { dayKey: string; treatmentIds: string[]; guestId?: string | null; override?: boolean; excludeRefIds?: string[]; onlineOnly?: boolean },
    now: Date,
  ): BookingAvailabilityDto {
    if (!isDayKey(query.dayKey)) {
      throw appError('COMMON.VALIDATION_FAILED', { message: 'Érvényes napot adj meg (ÉÉÉÉ-HH-NN).' });
    }
    const treatments = this.pickTreatments(state, query.treatmentIds, query.onlineOnly);
    const names = new Map(treatments.map((t) => [t.id, t.name]));
    const slots = findSequenceSlots({
      dayKey: query.dayKey,
      treatments,
      resources: state.resources,
      ctx: this.context(state, now, query.guestId),
      now,
      override: query.override,
      excludeRefIds: query.excludeRefIds,
    });
    return {
      dayKey: query.dayKey,
      day: this.dayDto(state, query.dayKey),
      slots: slots.map((s) => ({
        startsAt: iso(s.startsAt),
        endsAt: iso(s.endsAt),
        remaining: s.remaining,
        items: s.items.map((i) => ({
          treatmentId: i.treatmentId,
          treatmentName: names.get(i.treatmentId) ?? 'Kezelés',
          resourceId: i.resourceId,
          startsAt: iso(i.startsAt),
          endsAt: iso(i.endsAt),
        })),
      })),
    };
  }

  // -------------------------------------------------------------------------
  // Recepció
  // -------------------------------------------------------------------------

  calendar(from: string, to: string): BookingCalendarDto {
    if (!isDayKey(from) || !isDayKey(to) || to < from) {
      throw appError('COMMON.VALIDATION_FAILED', { message: 'Érvényes időszakot adj meg (ÉÉÉÉ-HH-NN).' });
    }
    const now = new Date();
    const state = this.load(now);
    const start = studioDateTime(from, 0).getTime();
    const end = studioDateTime(addDaysToDayKey(to, 1), 0).getTime();
    const inRange = (a: string, b: string) => new Date(a).getTime() < end && new Date(b).getTime() > start;
    const guests = this.guests();
    return {
      from,
      to,
      days: dayKeysBetween(from, to).map((d) => this.dayDto(state, d)),
      resources: state.resources,
      treatments: state.treatments.map((t) => this.treatmentDto(state, t)),
      bookings: state.bookings
        .filter((b) => b.status !== BookingStatus.CANCELLED && inRange(b.startsAt, b.blockedUntil))
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
        .map((b) => this.bookingDto(state, b, guests)),
      closures: state.closures.filter((c) => inRange(c.startsAt, c.endsAt)).map((c) => this.closureDto(state, c)),
      holds: this.liveHolds(state, now).flatMap((h) => {
        const t = state.treatments.find((x) => x.id === h.treatmentId);
        if (!t) return [];
        const item = planItem(t, new Date(h.offerStartsAt!));
        const guest = guests.get(h.guestId);
        return [
          {
            waitlistEntryId: h.id,
            resourceId: t.resourceId,
            treatmentName: t.name,
            guestName: guest ? `${guest.lastName} ${guest.firstName}` : 'Várólistás vendég',
            startsAt: iso(item.startsAt),
            blockedUntil: iso(item.blockedUntil),
            expiresAt: h.offerExpiresAt!,
          },
        ];
      }),
    };
  }

  availability(query: {
    dayKey: string;
    treatmentIds: string[];
    guestId?: string | null;
    override?: boolean;
    excludeBookingId?: string;
  }): BookingAvailabilityDto {
    const now = new Date();
    return this.availabilityFor(
      this.load(now),
      { ...query, excludeRefIds: query.excludeBookingId ? [query.excludeBookingId] : undefined },
      now,
    );
  }

  /** Helyben beengedésnél (`walkIn`) a kezdés most, 5 percre lefelé kerekítve; az időablak nem köti. */
  createStaffBooking(dto: CreateStaffBookingRequestDto): CreateBookingResponseDto {
    const now = new Date();
    const state = this.load(now);
    if (!dto.walkIn && !dto.startsAt) {
      throw appError('COMMON.VALIDATION_FAILED', { message: 'Érvényes kezdési időpontot adj meg.' });
    }
    const created = this.createGroup(
      state,
      {
        guestId: dto.guestId,
        treatmentIds: dto.treatmentIds,
        startsAt: dto.walkIn ? walkInStart(now) : new Date(dto.startsAt!),
        override: Boolean(dto.overrideRules) || Boolean(dto.walkIn),
        walkIn: dto.walkIn,
        source: BookingSource.RECEPTION,
        note: dto.note,
        userName: 'Demó Munkatárs',
      },
      now,
    );
    this.save(state);
    const guests = this.guests();
    return {
      groupId: created.groupId,
      bookings: created.rows.map((b) => this.bookingDto(state, b, guests)),
      warnings: created.warnings,
    };
  }

  reschedule(id: string, dto: RescheduleBookingRequestDto): BookingDto {
    const now = new Date();
    const state = this.load(now);
    const booking = this.findBooking(state, id);
    const before = this.doReschedule(state, booking, new Date(dto.startsAt), Boolean(dto.overrideRules), now);
    this.log(state, booking.id, 'BOOKING_RESCHEDULED', `${before.startsAt} → ${booking.startsAt}`, 'Demó Munkatárs');
    this.release(state, before.resourceId, before.startsAt, now);
    this.save(state);
    return this.bookingDto(state, booking);
  }

  cancel(id: string, dto: CancelBookingRequestDto): BookingDto {
    const now = new Date();
    const state = this.load(now);
    const booking = this.findBooking(state, id);
    this.doCancel(state, booking, dto.overrideRules ?? true, dto.reason?.trim() || null, now);
    this.log(state, booking.id, 'BOOKING_CANCELLED', `Lemondva a recepción${dto.reason ? `: ${dto.reason.trim()}` : ''}`, 'Demó Munkatárs');
    this.release(state, booking.resourceId, booking.startsAt, now);
    this.save(state);
    return this.bookingDto(state, booking);
  }

  /** Megérkezés / „Nem jelent meg”: pontosan egy levonás a mock bérletéből; visszaállítás sztornóz. */
  setStatus(id: string, dto: UpdateBookingStatusRequestDto): UpdateBookingStatusResponseDto {
    const now = new Date();
    const state = this.load(now);
    const booking = this.findBooking(state, id);
    const target = dto.status as string as BookingStatusValue;
    if (target === 'CANCELLED') {
      throw appError('BOOKING.INVALID_STATUS_CHANGE', { message: 'Lemondáshoz a Lemondás műveletet használd.' });
    }
    const from = booking.status as string as BookingStatusValue;
    const transition = bookingTransition(from, target);
    if (!transition.allowed) {
      throw appError(from === 'CANCELLED' ? 'BOOKING.ALREADY_CANCELLED' : 'BOOKING.INVALID_STATUS_CHANGE');
    }
    const treatment = state.treatments.find((t) => t.id === booking.treatmentId)!;

    let deduction: BookingDeductionOutcome = 'NONE';
    let passName: string | null = null;
    let remainingPasses: number | 'Korlátlan' | null = null;
    if (transition.reverse && booking.passUsageId) {
      try {
        mockStudioEngine.reversePassUsage(booking.passUsageId, dto.reason?.trim() || 'Állapot visszaállítva');
      } catch {
        // A levonást közben máshol sztornózták: csak leválik.
      }
      booking.passUsageId = null;
      booking.deductionSeq += 1;
      deduction = 'REVERSED';
    }
    if (transition.deduct) {
      if (booking.passUsageId) {
        deduction = 'ALREADY_DEDUCTED';
      } else {
        const guest = mockStudioEngine.getGuestById(booking.guestId);
        const { passes, serviceId } = this.guestPasses(booking.guestId, treatment);
        const pass = serviceId ? pickBookingPass(passes, serviceId, now, guest.gender) : null;
        if (!pass || !serviceId) {
          deduction = 'NO_USABLE_PASS';
        } else {
          const result = mockStudioEngine.deductPassUsage({
            guestId: booking.guestId,
            passId: pass.id,
            serviceId,
            operationKey: `booking:${booking.id}:${booking.deductionSeq}`,
            note: target === 'NO_SHOW' ? `Nem jelent meg (foglalás): ${treatment.name}` : `Foglalás: ${treatment.name}`,
          });
          booking.passUsageId = result.usageId ?? null;
          deduction = 'DEDUCTED';
          passName = result.passName ?? null;
          remainingPasses = result.remainingPasses ?? null;
        }
      }
    }
    booking.status = target as string as BookingStatus;
    this.log(
      state,
      booking.id,
      `BOOKING_STATUS_${target}`,
      `${treatment.name}: ${from} → ${target}; bérlet: ${deduction}`,
      'Demó Munkatárs',
    );
    this.save(state);
    return { booking: this.bookingDto(state, booking), deduction, passName, remainingPasses };
  }

  audit(id: string): BookingAuditEntryDto[] {
    const state = this.load();
    const booking = this.findBooking(state, id);
    return state.audit
      .filter((a) => a.entityId === booking.id || a.entityId === booking.groupId)
      .map(({ entityId: _entityId, ...entry }) => entry);
  }

  private closureDto(state: MockBookingState, c: ClosureRow): BookingClosureDto {
    return {
      ...c,
      resourceName: c.resourceId ? (state.resources.find((r) => r.id === c.resourceId)?.name ?? null) : null,
    };
  }

  settingsBundle(): BookingSettingsBundleDto {
    const state = this.load();
    const year = Number(toStudioDayKey(new Date()).slice(0, 4));
    const today = toStudioDayKey(new Date());
    return {
      settings: state.settings,
      resources: state.resources,
      treatments: [...state.treatments].sort((a, b) => a.sortOrder - b.sortOrder).map((t) => this.treatmentDto(state, t)),
      closures: state.closures
        .filter((c) => toStudioDayKey(c.endsAt) >= today)
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
        .map((c) => this.closureDto(state, c)),
      holidayOverrides: [...state.holidayOverrides].sort((a, b) => a.dayKey.localeCompare(b.dayKey)),
      holidays: [...hungarianPublicHolidays(year), ...hungarianPublicHolidays(year + 1)].map((h) => ({
        ...h,
        isOpen: state.holidayOverrides.find((o) => o.dayKey === h.dayKey)?.isOpen ?? false,
      })),
    };
  }

  /** A napijegy lejáratához (TICKET-7): a heti nyitvatartás és a munkaszüneti felülírások. */
  studioHours(): [Pick<BookingSettingsDto, 'openingHours'>, HolidayOverrideDto[]] {
    const state = this.load();
    return [state.settings, state.holidayOverrides];
  }

  updateSettings(patch: Partial<BookingSettingsDto>): BookingSettingsDto {
    const state = this.load();
    state.settings = {
      ...state.settings,
      ...patch,
      openingHours: patch.openingHours ? normalizeOpeningHours(patch.openingHours) : state.settings.openingHours,
    };
    this.log(state, 'settings', 'BOOKING_SETTINGS_UPDATED', 'Foglalási beállítások módosítva', 'Demó Munkatárs');
    this.save(state);
    return state.settings;
  }

  reorderTreatments(ids: string[]): BookableTreatmentDto[] {
    const state = this.load();
    ids.forEach((id, index) => {
      const t = state.treatments.find((x) => x.id === id);
      if (t) t.sortOrder = index + 1;
    });
    this.save(state);
    return this.settingsBundle().treatments;
  }

  updateTreatment(id: string, patch: { isActive?: boolean; isOnline?: boolean }): BookableTreatmentDto {
    const state = this.load();
    const t = state.treatments.find((x) => x.id === id);
    if (!t) throw appError('BOOKING.TREATMENT_NOT_FOUND');
    Object.assign(t, patch);
    this.save(state);
    return this.treatmentDto(state, t);
  }

  updateResource(id: string, isActive: boolean): BookingResourceDto {
    const state = this.load();
    const r = state.resources.find((x) => x.id === id);
    if (!r) throw appError('COMMON.NOT_FOUND', { message: 'A gép nem található.' });
    r.isActive = isActive;
    this.save(state);
    return r;
  }

  createClosure(dto: CreateClosureRequestDto): CreateClosureResponseDto {
    const state = this.load();
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    if (!(endsAt > startsAt)) throw appError('BOOKING.CLOSURE_INVALID');
    const closure: ClosureRow = {
      id: uid('cl'),
      startsAt: iso(startsAt),
      endsAt: iso(endsAt),
      resourceId: dto.resourceId || null,
      reason: dto.reason?.trim() || null,
      createdAt: iso(new Date()),
    };
    state.closures.push(closure);
    // Csak jelzés: az érintett foglalások változatlanok maradnak.
    const affected = bookingsAffectedByClosure(state.bookings, closure);
    this.log(state, closure.id, closure.resourceId ? 'BOOKING_RESOURCE_BLOCKED' : 'BOOKING_CLOSURE_CREATED', `Érintett foglalás: ${affected.length}`, 'Demó Munkatárs');
    this.save(state);
    const guests = this.guests();
    return { closure: this.closureDto(state, closure), affectedBookings: affected.map((b) => this.bookingDto(state, b, guests)) };
  }

  deleteClosure(id: string): { deletedId: string } {
    const now = new Date();
    const state = this.load(now);
    const closure = state.closures.find((c) => c.id === id);
    if (!closure) throw appError('BOOKING.CLOSURE_NOT_FOUND');
    state.closures = state.closures.filter((c) => c.id !== id);
    for (const r of state.resources) {
      if (!closure.resourceId || closure.resourceId === r.id) this.release(state, r.id, closure.startsAt, now);
    }
    this.save(state);
    return { deletedId: id };
  }

  upsertHolidayOverride(dto: UpsertHolidayOverrideRequestDto): HolidayOverrideDto {
    if (!isDayKey(dto.dayKey)) throw appError('COMMON.VALIDATION_FAILED', { message: 'Érvényes napot adj meg.' });
    const state = this.load();
    const existing = state.holidayOverrides.find((o) => o.dayKey === dto.dayKey);
    const row: HolidayOverrideDto = existing ?? { id: uid('ho'), dayKey: dto.dayKey, isOpen: dto.isOpen, note: null };
    row.isOpen = dto.isOpen;
    row.note = dto.note?.trim() || null;
    if (!existing) state.holidayOverrides.push(row);
    this.save(state);
    return row;
  }

  deleteHolidayOverride(dayKey: string): { dayKey: string } {
    const state = this.load();
    state.holidayOverrides = state.holidayOverrides.filter((o) => o.dayKey !== dayKey);
    this.save(state);
    return { dayKey };
  }

  private waitlistDto(state: MockBookingState, w: WaitlistRow, guests = this.guests()): WaitlistEntryDto {
    const guest = guests.get(w.guestId);
    return {
      id: w.id,
      guestId: w.guestId,
      guestName: guest ? `${guest.lastName} ${guest.firstName}` : 'Ismeretlen vendég',
      treatmentId: w.treatmentId,
      treatmentName: state.treatments.find((t) => t.id === w.treatmentId)?.name ?? 'Kezelés',
      dayKey: w.dayKey,
      fromMinutes: w.fromMinutes,
      toMinutes: w.toMinutes,
      status: w.status,
      offerStartsAt: w.offerStartsAt,
      offerExpiresAt: w.offerExpiresAt,
      createdAt: w.createdAt,
    };
  }

  listWaitlist(): WaitlistEntryDto[] {
    const state = this.load();
    const today = toStudioDayKey(new Date());
    const guests = this.guests();
    return state.waitlist
      .filter((w) => w.dayKey >= today && (w.status === WaitlistStatus.WAITING || w.status === WaitlistStatus.OFFERED))
      .sort((a, b) => a.dayKey.localeCompare(b.dayKey) || a.createdAt.localeCompare(b.createdAt))
      .map((w) => this.waitlistDto(state, w, guests));
  }

  private joinWaitlist(
    state: MockBookingState,
    input: { guestId: string; treatmentId: string; dayKey: string; fromTime: string; toTime: string; onlineOnly?: boolean },
    now: Date,
  ): WaitlistRow {
    const fromMinutes = parseTimeOfDay(input.fromTime);
    const toMinutes = parseTimeOfDay(input.toTime);
    if (!isDayKey(input.dayKey) || input.dayKey < toStudioDayKey(now)) {
      throw appError('COMMON.VALIDATION_FAILED', { message: 'Érvényes, mai vagy későbbi napot adj meg.' });
    }
    if (fromMinutes === null || toMinutes === null || fromMinutes >= toMinutes) {
      throw appError('COMMON.VALIDATION_FAILED', { message: 'Az idősáv vége a kezdete után legyen.' });
    }
    const [treatment] = this.pickTreatments(state, [input.treatmentId], input.onlineOnly);
    const existing = state.waitlist.find(
      (w) =>
        w.guestId === input.guestId &&
        w.treatmentId === treatment.id &&
        w.dayKey === input.dayKey &&
        (w.status === WaitlistStatus.WAITING || w.status === WaitlistStatus.OFFERED),
    );
    if (existing) return existing;
    const row: WaitlistRow = {
      id: uid('wl'),
      guestId: input.guestId,
      treatmentId: treatment.id,
      dayKey: input.dayKey,
      fromMinutes,
      toMinutes,
      status: WaitlistStatus.WAITING,
      offerStartsAt: null,
      offerExpiresAt: null,
      offerToken: null,
      createdAt: iso(now),
    };
    state.waitlist.push(row);
    this.log(state, row.id, 'WAITLIST_JOINED', `Várólista: ${treatment.name}, ${input.dayKey}`, null);
    this.offerReleased(state, treatment.resourceId, input.dayKey, now);
    return row;
  }

  joinWaitlistStaff(dto: CreateStaffWaitlistRequestDto): { id: string } {
    const now = new Date();
    const state = this.load(now);
    mockStudioEngine.getGuestById(dto.guestId);
    const row = this.joinWaitlist(state, dto, now);
    this.save(state);
    return { id: row.id };
  }

  cancelWaitlist(id: string): { ok: true } {
    const now = new Date();
    const state = this.load(now);
    const entry = state.waitlist.find((w) => w.id === id);
    if (!entry) throw appError('BOOKING.WAITLIST_NOT_FOUND');
    const wasOffered = entry.status === WaitlistStatus.OFFERED;
    entry.status = WaitlistStatus.CANCELLED;
    if (wasOffered) {
      const treatment = state.treatments.find((t) => t.id === entry.treatmentId);
      if (treatment) this.offerReleased(state, treatment.resourceId, entry.dayKey, now);
    }
    this.save(state);
    return { ok: true };
  }

  syncStatus(): CalendarSyncStatusDto {
    return { configured: false, pending: 0, failed: 0, lastSyncedAt: null, failures: [] };
  }

  // -------------------------------------------------------------------------
  // Nyilvános foglaló
  // -------------------------------------------------------------------------

  catalog(): PublicBookingCatalogDto {
    const state = this.load();
    return {
      treatments: state.treatments
        .filter((t) => t.isActive && t.isOnline)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((t) => ({ id: t.id, name: t.name, durationMinutes: t.durationMinutes, sortOrder: t.sortOrder })),
      maxAdvanceDays: state.settings.maxAdvanceDays,
      minLeadMinutes: state.settings.minLeadMinutes,
      changeCutoffHours: state.settings.changeCutoffHours,
      locationText: state.settings.locationText,
      today: toStudioDayKey(new Date()),
    };
  }

  private sessionGuest(session: string | null | undefined): GuestDto | null {
    if (!session?.startsWith(SESSION_PREFIX)) return null;
    try {
      return mockStudioEngine.getGuestById(session.slice(SESSION_PREFIX.length));
    } catch {
      return null;
    }
  }

  private requireSession(session: string | null | undefined): GuestDto {
    const guest = this.sessionGuest(session);
    if (!guest) throw appError('BOOKING.GUEST_SESSION_INVALID');
    return guest;
  }

  private guestByEmail(email: string): GuestDto | null {
    const normalized = email.trim().toLowerCase();
    return mockStudioEngine.getGuests().find((g) => g.isActive && g.email?.toLowerCase() === normalized) ?? null;
  }

  /** A meglévő vendégprofil e-mail szerint (duplikáció nélkül), vagy új profil. */
  private findOrCreateGuest(contact: PublicContactDto): GuestDto {
    return (
      this.guestByEmail(contact.email) ??
      mockStudioEngine.createGuest({
        firstName: contact.firstName.trim(),
        lastName: contact.lastName.trim(),
        email: contact.email.trim().toLowerCase(),
        phone: contact.phone.trim(),
        gender: Gender.UNSPECIFIED,
        notes: 'Online foglaláskor létrehozott profil.',
      })
    );
  }

  publicAvailability(dayKey: string, treatmentIds: string[], session?: string | null): BookingAvailabilityDto {
    const now = new Date();
    return this.availabilityFor(
      this.load(now),
      { dayKey, treatmentIds, guestId: this.sessionGuest(session)?.id ?? null, onlineOnly: true },
      now,
    );
  }

  publicCreate(dto: PublicCreateBookingRequestDto, session?: string | null): PublicCreateBookingResponseDto {
    if (!dto.privacyAccepted) throw appError('BOOKING.PRIVACY_REQUIRED');
    const sessionGuest = session ? this.requireSession(session) : null;
    if (!sessionGuest && !dto.contact) throw appError('BOOKING.CONTACT_REQUIRED');
    const now = new Date();
    const state = this.load(now);
    // Az időablak a vendég létrehozása előtt: hibás kérés ne hozzon létre profilt.
    const timing = checkBookingWindow(dto.startsAt, now, state.settings);
    if (timing) throw windowError(timing, state.settings);
    const guest = sessionGuest ?? this.findOrCreateGuest(dto.contact!);
    const created = this.createGroup(
      state,
      {
        guestId: guest.id,
        treatmentIds: dto.treatmentIds,
        startsAt: new Date(dto.startsAt),
        override: false,
        source: BookingSource.ONLINE,
        onlineOnly: true,
        note: dto.note,
        userName: null,
      },
      now,
    );
    this.save(state);
    return {
      groupId: created.groupId,
      bookings: created.rows.map((b) => ({ ...this.summary(state, b, now), manageToken: b.manageToken })),
      passWarnings: sessionGuest ? created.warnings : [],
    };
  }

  requestGuestCode(email: string): { ok: true; demoCode?: string } {
    const state = this.load();
    const normalized = email.trim().toLowerCase();
    state.codes = state.codes.filter((c) => c.email !== normalized);
    if (!this.guestByEmail(normalized)) {
      this.save(state);
      return { ok: true };
    }
    state.codes.push({
      email: normalized,
      code: DEMO_GUEST_CODE,
      expiresAt: iso(new Date(Date.now() + 10 * MINUTE_MS)),
      attempts: 0,
    });
    this.save(state);
    return { ok: true, demoCode: DEMO_GUEST_CODE };
  }

  verifyGuestCode(email: string, code: string): GuestLoginResponseDto {
    const state = this.load();
    const normalized = email.trim().toLowerCase();
    const row = state.codes.find((c) => c.email === normalized && new Date(c.expiresAt) > new Date());
    if (!row || row.attempts >= 5) throw appError('BOOKING.GUEST_CODE_INVALID');
    if (row.code !== code.trim()) {
      row.attempts += 1;
      this.save(state);
      throw appError('BOOKING.GUEST_CODE_INVALID');
    }
    state.codes = state.codes.filter((c) => c !== row);
    this.save(state);
    const guest = this.guestByEmail(normalized);
    if (!guest) throw appError('BOOKING.GUEST_CODE_INVALID');
    const guestToken = `${SESSION_PREFIX}${guest.id}`;
    return {
      guestToken,
      expiresAt: iso(new Date(Date.now() + 2 * 60 * MINUTE_MS)),
      profile: this.guestProfile(guestToken),
    };
  }

  guestProfile(session: string): GuestBookingProfileDto {
    const guest = this.requireSession(session);
    const now = new Date();
    const state = this.load(now);
    const since = now.getTime() - 30 * 24 * 60 * MINUTE_MS;
    return {
      firstName: guest.firstName,
      lastName: guest.lastName,
      email: guest.email ?? '',
      passes: mockStudioEngine
        .getGuestPasses(guest.id)
        .filter((p) => !p.cancelledAt)
        .map((p) => ({
          id: p.id,
          name: p.passTemplateName ?? 'Bérlet',
          serviceName: p.serviceName ?? null,
          type: p.type,
          remainingPasses: p.calculatedRemainingPasses ?? p.remainingPasses,
          totalPasses: p.totalPasses,
          expirationDate: p.expirationDate,
          validUntil: p.validUntil ?? null,
          status: p.status,
        })),
      bookings: state.bookings
        .filter((b) => b.guestId === guest.id && new Date(b.startsAt).getTime() >= since)
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
        .map((b) => this.summary(state, b, now)),
    };
  }

  private byManageToken(state: MockBookingState, token: string): BookingRow {
    const booking = state.bookings.find((b) => b.manageToken === token);
    if (!booking) throw appError('BOOKING.LINK_INVALID');
    return booking;
  }

  private manageDto(state: MockBookingState, b: BookingRow, now: Date): PublicManageBookingDto {
    const guest = this.guests().get(b.guestId);
    return {
      ...this.summary(state, b, now),
      treatmentId: b.treatmentId,
      guestFirstName: guest?.firstName ?? '',
      locationText: state.settings.locationText,
    };
  }

  getManaged(token: string): PublicManageBookingDto {
    const now = new Date();
    const state = this.load(now);
    return this.manageDto(state, this.byManageToken(state, token), now);
  }

  managedAvailability(token: string, dayKey: string): BookingAvailabilityDto {
    const now = new Date();
    const state = this.load(now);
    const booking = this.byManageToken(state, token);
    return this.availabilityFor(
      state,
      { dayKey, treatmentIds: [booking.treatmentId], guestId: booking.guestId, excludeRefIds: [booking.id] },
      now,
    );
  }

  rescheduleManaged(token: string, startsAt: string): PublicManageBookingDto {
    const now = new Date();
    const state = this.load(now);
    const booking = this.byManageToken(state, token);
    const before = this.doReschedule(state, booking, new Date(startsAt), false, now);
    this.log(state, booking.id, 'BOOKING_RESCHEDULED_ONLINE', `Online áthelyezés: ${before.startsAt} → ${booking.startsAt}`, null);
    this.release(state, before.resourceId, before.startsAt, now);
    this.save(state);
    return this.manageDto(state, booking, now);
  }

  cancelManaged(token: string): PublicManageBookingDto {
    const now = new Date();
    const state = this.load(now);
    const booking = this.byManageToken(state, token);
    this.doCancel(state, booking, false, 'Online lemondás', now);
    this.log(state, booking.id, 'BOOKING_CANCELLED_ONLINE', 'Online lemondás a kezelőlinkkel', null);
    this.release(state, booking.resourceId, booking.startsAt, now);
    this.save(state);
    return this.manageDto(state, booking, now);
  }

  publicJoinWaitlist(dto: PublicWaitlistRequestDto, session?: string | null): { ok: true } {
    if (!dto.privacyAccepted) throw appError('BOOKING.PRIVACY_REQUIRED');
    const sessionGuest = session ? this.requireSession(session) : null;
    if (!sessionGuest && !dto.contact) throw appError('BOOKING.CONTACT_REQUIRED');
    const now = new Date();
    const state = this.load(now);
    const guest = sessionGuest ?? this.findOrCreateGuest(dto.contact!);
    this.joinWaitlist(state, { ...dto, guestId: guest.id, onlineOnly: true }, now);
    this.save(state);
    return { ok: true };
  }

  private byOfferToken(state: MockBookingState, token: string): WaitlistRow {
    const entry = state.waitlist.find((w) => w.offerToken === token);
    if (!entry) throw appError('BOOKING.WAITLIST_OFFER_INVALID');
    return entry;
  }

  getWaitlistOffer(token: string): PublicWaitlistOfferDto {
    const state = this.load();
    const entry = this.byOfferToken(state, token);
    return {
      status: entry.status,
      treatmentName: state.treatments.find((t) => t.id === entry.treatmentId)?.name ?? 'Kezelés',
      guestFirstName: this.guests().get(entry.guestId)?.firstName ?? '',
      offerStartsAt: entry.offerStartsAt,
      offerExpiresAt: entry.offerExpiresAt,
    };
  }

  acceptWaitlistOffer(token: string): PublicWaitlistAcceptResponseDto {
    const now = new Date();
    const state = this.load(now);
    const entry = this.byOfferToken(state, token);
    if (entry.status !== WaitlistStatus.OFFERED || !entry.offerStartsAt) {
      throw appError('BOOKING.WAITLIST_OFFER_INVALID');
    }
    const created = this.createGroup(
      state,
      {
        guestId: entry.guestId,
        treatmentIds: [entry.treatmentId],
        startsAt: new Date(entry.offerStartsAt),
        override: false,
        source: BookingSource.WAITLIST,
        excludeRefIds: [`hold:${entry.id}`],
        skipWindow: true,
        userName: null,
      },
      now,
    );
    entry.status = WaitlistStatus.BOOKED;
    this.save(state);
    const [booking] = created.rows;
    return { booking: { ...this.summary(state, booking, now), manageToken: booking.manageToken } };
  }

  declineWaitlistOffer(token: string): { ok: true } {
    const now = new Date();
    const state = this.load(now);
    const entry = this.byOfferToken(state, token);
    if (entry.status === WaitlistStatus.OFFERED) {
      entry.status = WaitlistStatus.DECLINED;
      const treatment = state.treatments.find((t) => t.id === entry.treatmentId);
      if (treatment) this.offerReleased(state, treatment.resourceId, entry.dayKey, now);
    }
    this.save(state);
    return { ok: true };
  }

  /** Demó és teszt: a várólistás ajánlat tokenje (élesben csak a levélben van meg). */
  offerTokenFor(entryId: string): string | null {
    return this.load().waitlist.find((w) => w.id === entryId)?.offerToken ?? null;
  }
}

export const mockBookingEngine = new MockBookingEngine();

// A napijegy lejárata a foglalási nyitvatartásból jön (TICKET-7), mint az API-n.
mockStudioEngine.setStudioHoursSource(() => mockBookingEngine.studioHours());
