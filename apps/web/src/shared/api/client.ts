import {
  appError,
  CheckInResultPayload,
  CheckInRevokedPayload,
  CheckInStatus,
  DailyFinanceSummaryDto,
  DeductPassUsageRequestDto,
  DisplayDeviceDto,
  DocumentType,
  Gender,
  GuestDocumentDto,
  GuestDto,
  GuestNoteDto,
  GuestPassDto,
  GuestPhotoDto,
  GuestStatus,
  LoggedCheckInDto,
  LoginResponseDto,
  MeasurementDto,
  MembershipDto,
  MembershipDueDto,
  MembershipStatus,
  MessageLogDto,
  MonitorTestPingPayload,
  OfflineScanItemDto,
  OfflineSyncResponseDto,
  OverdueReportDto,
  PairDisplayResponseDto,
  PassTemplateDto,
  PassType,
  PaymentDto,
  PaymentMethod,
  RecordPaymentRequestDto,
  RequestLoginCodeResponseDto,
  Role,
  ServiceCategory,
  ServiceDto,
  TodayDashboardDto,
  toAppError,
  VisitType,
} from '@reform/shared';
import { broadcastToLocalMonitors } from '@/shared/lib/monitor-channel';
import { useAuthStore } from '@/shared/auth';
import { isDemoMode } from './demo-mode';
import { mockStudioEngine } from './mock-engine';

const API_BASE_URL =
  import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

/** Demó módban, API nélkül ezzel a kóddal lehet belépni (a mock nem küld levelet). */
const DEMO_LOGIN_CODE = '123456';

function isNetworkError(err: unknown): err is TypeError {
  return err instanceof TypeError && err.message.toLowerCase().includes('fetch');
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  fallbackFn?: () => T | Promise<T>,
): Promise<T> {
  const token = useAuthStore.getState().accessToken;

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers ?? {}),
      },
    });

    if (!response.ok) {
      const body: unknown = await response
        .json()
        .catch(() => ({ message: `Szerver hiba (${response.status})` }));
      throw toAppError({ status: response.status, response: body });
    }

    return (await response.json()) as T;
  } catch (err) {
    // Elérhetetlen szerver: mock fallback csak demó módban; élesben hibaüzenet.
    if (isNetworkError(err)) {
      if (fallbackFn && isDemoMode()) return await fallbackFn();
      throw appError('COMMON.NETWORK', { cause: err });
    }
    throw err;
  }
}

export const api = {
  /** Belépőkód kérése e-mailben (TICKET-35). Ismeretlen címre is `ok` a válasz. */
  requestLoginCode(email: string): Promise<RequestLoginCodeResponseDto> {
    return request<RequestLoginCodeResponseDto>(
      '/auth/code',
      { method: 'POST', body: JSON.stringify({ email }) },
      // Demó módban, API nélkül nincs levél: a felület a rögzített demókódot mutatja.
      () => ({ ok: true, demoCode: DEMO_LOGIN_CODE }),
    );
  },

  verifyLoginCode(email: string, code: string): Promise<LoginResponseDto> {
    return request(
      '/auth/verify',
      { method: 'POST', body: JSON.stringify({ email, code }) },
      // Demó módban, API nélkül helyi munkamenet (a többi hívás a mock-motorra fut).
      () => {
        if (code !== DEMO_LOGIN_CODE) throw appError('AUTH.CODE_INVALID');
        return {
          accessToken: 'local-session-token',
          user: {
            id: 'staff-default-1',
            studioId: 'default-studio',
            email,
            name: 'Demó Munkatárs',
            role: Role.ADMIN,
          },
        };
      },
    );
  },

  getServices(includeInactive = false): Promise<ServiceDto[]> {
    return request(
      `/services?includeInactive=${includeInactive}`,
      {},
      () => mockStudioEngine.getServices(includeInactive),
    );
  },

  createService(data: {
    name: string;
    category: ServiceCategory;
    durationMinutes: number;
    priceHuf: number;
    womenOnly?: boolean;
  }): Promise<ServiceDto> {
    return request(
      '/services',
      {
        method: 'POST',
        body: JSON.stringify(data),
      },
      () => mockStudioEngine.createService(data),
    );
  },

  getGuests(query?: string): Promise<GuestDto[]> {
    const qs = query ? `?search=${encodeURIComponent(query)}` : '';
    return request(`/guests${qs}`, {}, () => mockStudioEngine.getGuests(query));
  },

  getGuest(id: string): Promise<GuestDto> {
    return request(`/guests/${id}`, {}, () =>
      mockStudioEngine.getGuestById(id),
    );
  },

  getGuestPasses(guestId: string): Promise<GuestPassDto[]> {
    return request(`/guests/${guestId}/passes`, {}, () =>
      mockStudioEngine.getGuestPasses(guestId),
    );
  },

  createGuest(data: {
    firstName: string;
    lastName: string;
    barcode?: string;
    email?: string;
    phone?: string;
    birthDate?: string | null;
    nameDay?: string | null;
    gender: Gender;
    status?: GuestStatus;
    notes?: string;
  }): Promise<GuestDto> {
    return request(
      '/guests',
      {
        method: 'POST',
        body: JSON.stringify(data),
      },
      () => mockStudioEngine.createGuest(data),
    );
  },

  updateGuest(
    id: string,
    data: Partial<{
      firstName: string;
      lastName: string;
      barcode: string;
      email: string;
      phone: string;
      birthDate: string | null;
      nameDay: string | null;
      gender: Gender;
      status: GuestStatus;
      notes: string;
    }>,
  ): Promise<GuestDto> {
    return request(
      `/guests/${id}`,
      {
        method: 'PATCH',
        body: JSON.stringify(data),
      },
      () => mockStudioEngine.updateGuest(id, data),
    );
  },

  getPassTemplates(includeInactive = false): Promise<PassTemplateDto[]> {
    return request(
      `/passes/templates?includeInactive=${includeInactive}`,
      {},
      () => mockStudioEngine.getTemplates(includeInactive),
    );
  },

  createPassTemplate(data: {
    name: string;
    serviceId?: string | null;
    type: PassType;
    totalPasses?: number | null;
    durationDays: number;
    price: number;
  }): Promise<PassTemplateDto> {
    return request(
      '/passes/templates',
      {
        method: 'POST',
        body: JSON.stringify(data),
      },
      () => mockStudioEngine.createTemplate(data),
    );
  },

  updatePassTemplate(
    id: string,
    data: Partial<{
      name: string;
      price: number;
      durationDays: number;
      isActive: boolean;
    }>,
  ): Promise<PassTemplateDto> {
    return request(
      `/passes/templates/${id}`,
      {
        method: 'PATCH',
        body: JSON.stringify(data),
      },
      () => mockStudioEngine.updateTemplate(id, data),
    );
  },

  sellPass(data: {
    guestId: string;
    passTemplateId: string;
    paymentMethod: PaymentMethod;
    customAmount?: number;
    note?: string;
  }): Promise<{ pass: GuestPassDto; paymentId: string; amount: number }> {
    return request(
      '/passes/sell',
      {
        method: 'POST',
        body: JSON.stringify(data),
      },
      () => mockStudioEngine.sellPass(data),
    );
  },

  deductPassUsage(
    data: DeductPassUsageRequestDto,
  ): Promise<CheckInResultPayload> {
    return request<CheckInResultPayload>(
      '/pass-usages',
      {
        method: 'POST',
        body: JSON.stringify(data),
      },
      () => mockStudioEngine.deductPassUsage(data),
    ).then((res) => {
      broadcastToLocalMonitors({ type: 'CHECKIN_RESULT', payload: res });
      return res;
    });
  },

  reversePassUsage(
    usageId: string,
    reversalReason: string,
  ): Promise<CheckInRevokedPayload> {
    return request<CheckInRevokedPayload>(
      `/pass-usages/${usageId}/reverse`,
      {
        method: 'POST',
        body: JSON.stringify({ reversalReason }),
      },
      () => mockStudioEngine.reversePassUsage(usageId, reversalReason),
    ).then((res) => {
      broadcastToLocalMonitors({ type: 'CHECKIN_REVOKED', payload: res });
      return res;
    });
  },

  extendPass(
    passId: string,
    additionalDays: number,
    note: string,
  ): Promise<GuestPassDto> {
    return request(
      `/passes/${passId}/extend`,
      {
        method: 'PATCH',
        body: JSON.stringify({ additionalDays, note }),
      },
      () => mockStudioEngine.extendPass(passId, additionalDays, note),
    );
  },

  toggleFreezePass(passId: string, note?: string): Promise<GuestPassDto> {
    return request(
      `/passes/${passId}/toggle-freeze`,
      {
        method: 'PATCH',
        body: JSON.stringify({ note }),
      },
      () => mockStudioEngine.toggleFreezePass(passId, note),
    );
  },

  scanCheckIn(data: {
    barcode: string;
    visitType?: VisitType;
    serviceId?: string;
    forceDuplicate?: boolean;
    idempotencyKey?: string;
  }): Promise<CheckInResultPayload> {
    return request<CheckInResultPayload>(
      '/checkins',
      {
        method: 'POST',
        body: JSON.stringify(data),
      },
      () => mockStudioEngine.scanCheckIn(data),
    ).then((res) => {
      // Kezelésválasztásnál nincs belépés, a monitor sem kap eseményt (TICKET-39).
      if (res.status !== CheckInStatus.TREATMENT_SELECTION_REQUIRED) {
        broadcastToLocalMonitors({ type: 'CHECKIN_RESULT', payload: res });
      }
      return res;
    });
  },

  revokeCheckIn(
    checkInId: string,
    reason?: string,
  ): Promise<CheckInRevokedPayload> {
    return request<CheckInRevokedPayload>(
      `/check-ins/${checkInId}/revoke`,
      {
        method: 'POST',
        body: JSON.stringify({ reason }),
      },
      () => mockStudioEngine.revokeCheckIn(checkInId, reason),
    ).then((res) => {
      broadcastToLocalMonitors({ type: 'CHECKIN_REVOKED', payload: res });
      return res;
    });
  },

  getTodayCheckIns(): Promise<LoggedCheckInDto[]> {
    return request('/check-ins/today', {}, () =>
      mockStudioEngine.getTodayCheckIns(),
    );
  },

  syncOfflineScans(items: OfflineScanItemDto[]): Promise<OfflineSyncResponseDto> {
    return request(
      '/check-ins/sync-offline',
      {
        method: 'POST',
        body: JSON.stringify({ items }),
      },
      () => mockStudioEngine.syncOfflineScans(items),
    );
  },

  getTodayDashboard(): Promise<TodayDashboardDto> {
    return request('/dashboard/today', {}, () =>
      mockStudioEngine.getTodayDashboard(),
    );
  },

  getOverdueMemberships(): Promise<OverdueReportDto> {
    return request('/memberships/overdue', {}, () =>
      mockStudioEngine.getOverdueMemberships(),
    );
  },

  createMembership(data: {
    guestId: string;
    serviceId?: string;
    monthlyFeeHuf: number;
    startDate?: string;
    dueDay?: number;
  }): Promise<MembershipDto> {
    return request(
      '/memberships',
      {
        method: 'POST',
        body: JSON.stringify(data),
      },
      () => mockStudioEngine.createMembership(data),
    );
  },

  updateMembershipStatus(
    membershipId: string,
    data: { status: MembershipStatus; monthlyFeeHuf?: number; dueDay?: number },
  ): Promise<MembershipDto> {
    return request(
      `/memberships/${membershipId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(data),
      },
      () => mockStudioEngine.updateMembershipStatus(membershipId, data),
    );
  },

  addMembershipDue(
    membershipId: string,
    data: { period: string; dueDate: string; amountHuf: number },
  ): Promise<MembershipDueDto> {
    return request(
      `/memberships/${membershipId}/dues`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      },
      () => mockStudioEngine.addMembershipDue(membershipId, data),
    );
  },

  recordPayment(data: RecordPaymentRequestDto): Promise<PaymentDto> {
    return request(
      '/payments',
      {
        method: 'POST',
        body: JSON.stringify(data),
      },
      () => mockStudioEngine.recordPayment(data),
    );
  },

  getDailyFinanceSummary(date?: string): Promise<DailyFinanceSummaryDto> {
    const qs = date ? `?date=${encodeURIComponent(date)}` : '';
    return request(`/finance/daily-summary${qs}`, {}, () =>
      mockStudioEngine.getDailyFinanceSummary(date),
    );
  },

  cancelPayment(paymentId: string, reason?: string): Promise<PaymentDto> {
    return request(
      `/finance/payments/${paymentId}/cancel`,
      {
        method: 'POST',
        body: JSON.stringify({ reason }),
      },
      () => mockStudioEngine.cancelPayment(paymentId, reason),
    );
  },

  // 2. Ütem: Mérések, Fényképek, Dokumentumok, Megjegyzések, E-mail napló
  addMeasurement(
    guestId: string,
    data: Partial<MeasurementDto>,
  ): Promise<MeasurementDto> {
    return request(
      `/guests/${guestId}/measurements`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      },
      () => mockStudioEngine.addMeasurement(guestId, data),
    );
  },

  addPhoto(
    guestId: string,
    data: {
      serviceId?: string | null;
      fileUrl: string;
      mimeType?: string;
      originalSizeBytes?: number;
      compressedSizeBytes?: number;
      width?: number;
      height?: number;
      visibilityRole?: Role;
      note?: string | null;
    },
  ): Promise<GuestPhotoDto> {
    return request(
      `/guests/${guestId}/photos`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      },
      () => mockStudioEngine.addPhoto(guestId, data),
    );
  },

  createDocument(
    guestId: string,
    data: {
      documentType: DocumentType;
      title: string;
      contentText: string;
      fieldsJson?: Record<string, string>;
      signatureDataUrl?: string | null;
    },
  ): Promise<GuestDocumentDto> {
    return request(
      `/guests/${guestId}/documents`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      },
      () => mockStudioEngine.createDocument(guestId, data),
    );
  },

  listPendingDocuments(): Promise<GuestDocumentDto[]> {
    return request('/documents/pending', {}, () =>
      mockStudioEngine.listPendingDocuments(),
    );
  },

  signDocument(
    documentId: string,
    data: { signatureDataUrl: string; fieldsJson?: Record<string, string> },
  ): Promise<GuestDocumentDto> {
    return request(
      `/documents/${documentId}/sign`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      },
      () => mockStudioEngine.signDocument(documentId, data),
    );
  },

  addInternalNote(guestId: string, content: string): Promise<GuestNoteDto> {
    return request(
      `/guests/${guestId}/notes`,
      {
        method: 'POST',
        body: JSON.stringify({ content }),
      },
      () => mockStudioEngine.addInternalNote(guestId, content),
    );
  },

  sendGuestEmailLog(
    guestId: string,
    data: { subject: string; messageType: string },
  ): Promise<MessageLogDto> {
    return request(
      `/guests/${guestId}/messages`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      },
      () => mockStudioEngine.sendGuestEmailLog(guestId, data),
    );
  },

  initDisplayPairing(name: string): Promise<DisplayDeviceDto> {
    return request(
      '/auth/monitor/pair-init',
      {
        method: 'POST',
        body: JSON.stringify({ name }),
      },
      () => mockStudioEngine.initDisplayPairing(name),
    );
  },

  verifyDisplayPairing(pairingCode: string): Promise<PairDisplayResponseDto> {
    return request(
      '/auth/monitor/pair-verify',
      {
        method: 'POST',
        body: JSON.stringify({ pairingCode }),
      },
      () => mockStudioEngine.verifyDisplayPairing(pairingCode),
    );
  },

  getDisplayDevices(): Promise<DisplayDeviceDto[]> {
    return request('/auth/monitor/devices', {}, () =>
      mockStudioEngine.getDisplayDevices(),
    );
  },

  regenerateDisplayPairingCode(deviceId: string): Promise<DisplayDeviceDto> {
    return request<DisplayDeviceDto>(
      `/auth/monitor/devices/${deviceId}/unpair`,
      {
        method: 'POST',
      },
      () => mockStudioEngine.regenerateDisplayPairingCode(deviceId),
    ).then((res) => {
      broadcastToLocalMonitors({
        type: 'DEVICE_REVOKED',
        payload: {
          deviceId,
          reason: 'A recepció új párosító kódot kért ehhez a kijelzőhöz.',
          timestamp: new Date().toISOString(),
        },
      });
      return res;
    });
  },

  renameDisplayDevice(
    deviceId: string,
    name: string,
  ): Promise<DisplayDeviceDto> {
    return request(
      `/auth/monitor/devices/${deviceId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ name }),
      },
      () => mockStudioEngine.renameDisplayDevice(deviceId, name),
    );
  },

  deleteDisplayDevice(deviceId: string): Promise<{ deletedId: string }> {
    return request<{ deletedId: string }>(
      `/auth/monitor/devices/${deviceId}`,
      {
        method: 'DELETE',
      },
      () => mockStudioEngine.deleteDisplayDevice(deviceId),
    ).then((res) => {
      broadcastToLocalMonitors({
        type: 'DEVICE_REVOKED',
        payload: {
          deviceId,
          reason: 'A kijelző párosítását törölték a recepcióról.',
          timestamp: new Date().toISOString(),
        },
      });
      return res;
    });
  },

  unpairSelfDevice(deviceToken: string): Promise<{ unpairedId: string }> {
    return request(
      '/auth/monitor/unpair-self',
      {
        method: 'POST',
        body: JSON.stringify({ deviceToken }),
      },
      () => mockStudioEngine.unpairSelfDevice(deviceToken),
    );
  },

  sendMonitorTestSignal(deviceId?: string): Promise<MonitorTestPingPayload> {
    const senderName =
      useAuthStore.getState().user?.name ?? 'Recepciós Munkatárs';
    return request<MonitorTestPingPayload>(
      '/auth/monitor/test-signal',
      {
        method: 'POST',
        body: JSON.stringify({ deviceId }),
      },
      () => mockStudioEngine.sendMonitorTestSignal(deviceId, senderName),
    ).then((res) => {
      broadcastToLocalMonitors({
        type: 'TEST_PING',
        payload: res,
      });
      return res;
    });
  },
};

