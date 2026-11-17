import type {
  BookableTreatmentDto,
  BookingAuditEntryDto,
  BookingAvailabilityDto,
  BookingCalendarDto,
  BookingDto,
  BookingResourceDto,
  BookingSettingsBundleDto,
  BookingSettingsDto,
  CalendarSyncStatusDto,
  CancelBookingRequestDto,
  CreateBookingResponseDto,
  CreateClosureRequestDto,
  CreateClosureResponseDto,
  CreateStaffBookingRequestDto,
  CreateStaffWaitlistRequestDto,
  GuestBookingProfileDto,
  GuestLoginResponseDto,
  HolidayOverrideDto,
  PublicBookingCatalogDto,
  PublicCreateBookingRequestDto,
  PublicCreateBookingResponseDto,
  PublicManageBookingDto,
  PublicWaitlistAcceptResponseDto,
  PublicWaitlistOfferDto,
  PublicWaitlistRequestDto,
  RescheduleBookingRequestDto,
  UpdateBookingStatusRequestDto,
  UpdateBookingStatusResponseDto,
  UpsertHolidayOverrideRequestDto,
  WaitlistEntryDto,
} from '@reform/shared';
import { request } from './client';
import { mockBookingEngine } from './mock-booking';

/** A nyilvános foglaló vendég munkamenetének fejléce (kódos belépés után). */
const GUEST_SESSION_HEADER = 'x-guest-session';

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  body: body === undefined ? undefined : JSON.stringify(body),
});

const withSession = (session: string | null | undefined, init: RequestInit = {}): RequestInit =>
  session ? { ...init, headers: { [GUEST_SESSION_HEADER]: session } } : init;

const ids = (treatmentIds: readonly string[]) => encodeURIComponent(treatmentIds.join(','));

export interface StaffAvailabilityQuery {
  dayKey: string;
  treatmentIds: string[];
  guestId?: string | null;
  /** A 30 napos és 30 perces korlát felülírása (a kapacitás marad). */
  override?: boolean;
  excludeBookingId?: string;
}

/**
 * Időpontfoglalás (TICKET-57): a recepciós naptár és beállítások (`/bookings`) és a nyilvános
 * foglaló (`/public/booking`) hívásai. Demó módban, API nélkül a `mock-booking` motor felel.
 */
export const bookingApi = {
  // -------------------------------------------------------------------------
  // Recepció
  // -------------------------------------------------------------------------

  getCalendar(from: string, to: string): Promise<BookingCalendarDto> {
    return request(`/bookings/calendar?from=${from}&to=${to}`, {}, () =>
      mockBookingEngine.calendar(from, to),
    );
  },

  getAvailability(query: StaffAvailabilityQuery): Promise<BookingAvailabilityDto> {
    const params = [
      `day=${query.dayKey}`,
      `treatmentIds=${ids(query.treatmentIds)}`,
      query.guestId ? `guestId=${encodeURIComponent(query.guestId)}` : '',
      query.override ? 'override=true' : '',
      query.excludeBookingId ? `excludeBookingId=${encodeURIComponent(query.excludeBookingId)}` : '',
    ].filter(Boolean);
    return request(`/bookings/availability?${params.join('&')}`, {}, () =>
      mockBookingEngine.availability(query),
    );
  },

  createBooking(dto: CreateStaffBookingRequestDto): Promise<CreateBookingResponseDto> {
    return request('/bookings', json('POST', dto), () => mockBookingEngine.createStaffBooking(dto));
  },

  rescheduleBooking(id: string, dto: RescheduleBookingRequestDto): Promise<BookingDto> {
    return request(`/bookings/${id}/reschedule`, json('PATCH', dto), () =>
      mockBookingEngine.reschedule(id, dto),
    );
  },

  cancelBooking(id: string, dto: CancelBookingRequestDto): Promise<BookingDto> {
    return request(`/bookings/${id}/cancel`, json('POST', dto), () => mockBookingEngine.cancel(id, dto));
  },

  setBookingStatus(id: string, dto: UpdateBookingStatusRequestDto): Promise<UpdateBookingStatusResponseDto> {
    return request(`/bookings/${id}/status`, json('PATCH', dto), () =>
      mockBookingEngine.setStatus(id, dto),
    );
  },

  getBookingAudit(id: string): Promise<BookingAuditEntryDto[]> {
    return request(`/bookings/${id}/audit`, {}, () => mockBookingEngine.audit(id));
  },

  getSettings(): Promise<BookingSettingsBundleDto> {
    return request('/bookings/settings', {}, () => mockBookingEngine.settingsBundle());
  },

  updateSettings(patch: Partial<BookingSettingsDto>): Promise<BookingSettingsDto> {
    return request('/bookings/settings', json('PATCH', patch), () => mockBookingEngine.updateSettings(patch));
  },

  reorderTreatments(treatmentIds: string[]): Promise<BookableTreatmentDto[]> {
    return request('/bookings/treatments/order', json('PUT', { treatmentIds }), () =>
      mockBookingEngine.reorderTreatments(treatmentIds),
    );
  },

  updateTreatment(id: string, patch: { isActive?: boolean; isOnline?: boolean }): Promise<BookableTreatmentDto> {
    return request(`/bookings/treatments/${id}`, json('PATCH', patch), () =>
      mockBookingEngine.updateTreatment(id, patch),
    );
  },

  updateResource(id: string, isActive: boolean): Promise<BookingResourceDto> {
    return request(`/bookings/resources/${id}`, json('PATCH', { isActive }), () =>
      mockBookingEngine.updateResource(id, isActive),
    );
  },

  createClosure(dto: CreateClosureRequestDto): Promise<CreateClosureResponseDto> {
    return request('/bookings/closures', json('POST', dto), () => mockBookingEngine.createClosure(dto));
  },

  deleteClosure(id: string): Promise<{ deletedId: string }> {
    return request(`/bookings/closures/${id}`, json('DELETE'), () => mockBookingEngine.deleteClosure(id));
  },

  upsertHolidayOverride(dto: UpsertHolidayOverrideRequestDto): Promise<HolidayOverrideDto> {
    return request('/bookings/holidays', json('PUT', dto), () => mockBookingEngine.upsertHolidayOverride(dto));
  },

  deleteHolidayOverride(dayKey: string): Promise<{ dayKey: string }> {
    return request(`/bookings/holidays/${dayKey}`, json('DELETE'), () =>
      mockBookingEngine.deleteHolidayOverride(dayKey),
    );
  },

  getWaitlist(): Promise<WaitlistEntryDto[]> {
    return request('/bookings/waitlist', {}, () => mockBookingEngine.listWaitlist());
  },

  joinWaitlist(dto: CreateStaffWaitlistRequestDto): Promise<{ id: string }> {
    return request('/bookings/waitlist', json('POST', dto), () => mockBookingEngine.joinWaitlistStaff(dto));
  },

  cancelWaitlistEntry(id: string): Promise<{ ok: true }> {
    return request(`/bookings/waitlist/${id}`, json('DELETE'), () => mockBookingEngine.cancelWaitlist(id));
  },

  getSyncStatus(): Promise<CalendarSyncStatusDto> {
    return request('/bookings/sync', {}, () => mockBookingEngine.syncStatus());
  },

  retrySync(): Promise<{ retried: number }> {
    return request('/bookings/sync/retry', json('POST'), () => ({ retried: 0 }));
  },

  // -------------------------------------------------------------------------
  // Nyilvános foglaló
  // -------------------------------------------------------------------------

  getPublicCatalog(): Promise<PublicBookingCatalogDto> {
    return request('/public/booking/catalog', {}, () => mockBookingEngine.catalog());
  },

  getPublicAvailability(
    dayKey: string,
    treatmentIds: string[],
    session?: string | null,
  ): Promise<BookingAvailabilityDto> {
    return request(
      `/public/booking/availability?day=${dayKey}&treatmentIds=${ids(treatmentIds)}`,
      withSession(session),
      () => mockBookingEngine.publicAvailability(dayKey, treatmentIds, session),
    );
  },

  createPublicBooking(
    dto: PublicCreateBookingRequestDto,
    session?: string | null,
  ): Promise<PublicCreateBookingResponseDto> {
    return request('/public/booking/bookings', withSession(session, json('POST', dto)), () =>
      mockBookingEngine.publicCreate(dto, session),
    );
  },

  /** Demó módban a válasz a kódot is tartalmazza (nincs levél). */
  requestGuestCode(email: string): Promise<{ ok: true; demoCode?: string }> {
    return request('/public/booking/guest/code', json('POST', { email }), () =>
      mockBookingEngine.requestGuestCode(email),
    );
  },

  verifyGuestCode(email: string, code: string): Promise<GuestLoginResponseDto> {
    return request('/public/booking/guest/verify', json('POST', { email, code }), () =>
      mockBookingEngine.verifyGuestCode(email, code),
    );
  },

  getGuestProfile(session: string): Promise<GuestBookingProfileDto> {
    return request('/public/booking/guest/profile', withSession(session), () =>
      mockBookingEngine.guestProfile(session),
    );
  },

  getManagedBooking(token: string): Promise<PublicManageBookingDto> {
    return request(`/public/booking/manage/${encodeURIComponent(token)}`, {}, () =>
      mockBookingEngine.getManaged(token),
    );
  },

  getManagedAvailability(token: string, dayKey: string): Promise<BookingAvailabilityDto> {
    return request(`/public/booking/manage/${encodeURIComponent(token)}/availability?day=${dayKey}`, {}, () =>
      mockBookingEngine.managedAvailability(token, dayKey),
    );
  },

  rescheduleManagedBooking(token: string, startsAt: string): Promise<PublicManageBookingDto> {
    return request(
      `/public/booking/manage/${encodeURIComponent(token)}/reschedule`,
      json('POST', { startsAt }),
      () => mockBookingEngine.rescheduleManaged(token, startsAt),
    );
  },

  cancelManagedBooking(token: string): Promise<PublicManageBookingDto> {
    return request(`/public/booking/manage/${encodeURIComponent(token)}/cancel`, json('POST'), () =>
      mockBookingEngine.cancelManaged(token),
    );
  },

  joinPublicWaitlist(dto: PublicWaitlistRequestDto, session?: string | null): Promise<{ ok: true }> {
    return request('/public/booking/waitlist', withSession(session, json('POST', dto)), () =>
      mockBookingEngine.publicJoinWaitlist(dto, session),
    );
  },

  getWaitlistOffer(token: string): Promise<PublicWaitlistOfferDto> {
    return request(`/public/booking/waitlist/${encodeURIComponent(token)}`, {}, () =>
      mockBookingEngine.getWaitlistOffer(token),
    );
  },

  acceptWaitlistOffer(token: string): Promise<PublicWaitlistAcceptResponseDto> {
    return request(`/public/booking/waitlist/${encodeURIComponent(token)}/accept`, json('POST'), () =>
      mockBookingEngine.acceptWaitlistOffer(token),
    );
  },

  declineWaitlistOffer(token: string): Promise<{ ok: true }> {
    return request(`/public/booking/waitlist/${encodeURIComponent(token)}/decline`, json('POST'), () =>
      mockBookingEngine.declineWaitlistOffer(token),
    );
  },
};
