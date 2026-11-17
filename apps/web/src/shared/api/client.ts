import {
  appError,
  CheckInResultPayload,
  CheckInRevokedPayload,
  CheckInStatus,
  DailyFinanceSummaryDto,
  DeductPassUsageRequestDto,
  DisplayDeviceDto,
  DocumentType,
  EmailAudienceFilterDto,
  EmailAudiencePreviewDto,
  EmailAutomationDto,
  EmailAutomationKind,
  EmailMessageListDto,
  EmailMessageListQueryDto,
  EmailTemplateDto,
  Gender,
  GuestDocumentDto,
  GuestDto,
  GuestNoteDto,
  GuestPassDto,
  GuestPhotoDto,
  GuestStatus,
  LoggedCheckInDto,
  LoginResponseDto,
  MailStatusDto,
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
  SaveEmailTemplateDto,
  SendBulkEmailDto,
  SendBulkEmailResultDto,
  SendGuestEmailDto,
  SendTestEmailDto,
  ServiceCategory,
  ServiceDto,
  TodayDashboardDto,
  toAppError,
  TourEventDto,
  TourStateDto,
  UnsubscribeInfoDto,
  UpdateEmailAutomationDto,
  VisitType,
  CreateIntakeSessionRequestDto,
  DEVICE_TOKEN_HEADER,
  DisplayDeviceKind,
  INTAKE_TOKEN_HEADER,
  IntakeAnswers,
  IntakeDeviceAssignmentDto,
  IntakeDocumentLinkDto,
  IntakeDocumentSnapshotDto,
  IntakeDuplicateCandidateDto,
  IntakeGuestExitResponseDto,
  IntakeGuestTokenDto,
  IntakeGuestViewDto,
  IntakeHealthDto,
  IntakePackageDto,
  IntakeProfileDraft,
  IntakeSendToDeviceResponseDto,
  IntakeSessionDetailDto,
  IntakeSessionSummaryDto,
  IntakeWarning,
  UpdateIntakeSessionRequestDto,
} from '@reform/shared';
import { broadcastToLocalMonitors } from '@/shared/lib/monitor-channel';
import { useAuthStore } from '@/shared/auth';
import { isDemoMode } from './demo-mode';
import { mockStudioEngine } from './mock-engine';
import { mockIntakeEngine } from './mock-intake';
import { mockMailEngine } from './mock-mail';

const API_BASE_URL =
  import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

/** Demó módban, API nélkül ezzel a kóddal lehet belépni (a mock nem küld levelet). */
const DEMO_LOGIN_CODE = '123456';

/** Vendégfelvétel recepciós műveletei (`POST /intake/sessions/:id/<művelet>`). */
export type IntakeSessionAction = 'release' | 'return' | 'approve' | 'retry' | 'cancel';

type RequestOptions = RequestInit & {
  /** Munkatársi token nélkül (a tablet vendégmódja és az eszköztokenes hívások). */
  anonymous?: boolean;
};

/** A vendégmód kérése: csak a kitöltéshez kötött token. */
function intakeGuestInit(
  guestToken: string,
  method: 'GET' | 'PUT' | 'POST' = 'GET',
  body?: unknown,
): RequestOptions {
  return {
    method,
    headers: { [INTAKE_TOKEN_HEADER]: guestToken },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    anonymous: true,
  };
}
/** A mock jogosultság-ellenőrzéséhez: a bejelentkezett munkatárs. */
const currentUser = () => useAuthStore.getState().user;

function isNetworkError(err: unknown): err is TypeError {
  return err instanceof TypeError && err.message.toLowerCase().includes('fetch');
}

async function request<T>(
  path: string,
  { anonymous, ...options }: RequestOptions = {},
  fallbackFn?: () => T | Promise<T>,
): Promise<T> {
  const token = anonymous ? null : useAuthStore.getState().accessToken;

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
    marketingConsent?: boolean;
  }): Promise<GuestDto> {
    return request(
      '/guests',
      {
        method: 'POST',
        body: JSON.stringify(data),
      },
      () => {
        const created = mockStudioEngine.createGuest(data);
        mockMailEngine.onGuestCreated(created);
        return created;
      },
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
      marketingConsent: boolean;
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
      () =>
        mockStudioEngine.addMeasurement(
          guestId,
          data,
          useAuthStore.getState().user,
        ),
    );
  },

  deleteMeasurement(
    guestId: string,
    measurementId: string,
  ): Promise<{ deletedId: string }> {
    return request(
      `/guests/${guestId}/measurements/${measurementId}`,
      { method: 'DELETE' },
      () =>
        mockStudioEngine.deleteMeasurement(
          guestId,
          measurementId,
          useAuthStore.getState().user,
        ),
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

  // Vendégfelvétel (TICKET-56): recepció, párosított tablet és a tablet vendégmódja.
  getIntakePackages(): Promise<IntakePackageDto[]> {
    return request('/intake/packages', {}, () => mockIntakeEngine.listPackages());
  },

  checkIntakeDuplicates(
    profile: IntakeProfileDraft,
  ): Promise<IntakeDuplicateCandidateDto[]> {
    return request(
      '/intake/duplicates',
      { method: 'POST', body: JSON.stringify(profile) },
      () => mockIntakeEngine.findDuplicates(profile),
    );
  },

  getIntakeSessions(): Promise<IntakeSessionSummaryDto[]> {
    return request('/intake/sessions', {}, () => mockIntakeEngine.listSessions());
  },

  createIntakeSession(
    data: CreateIntakeSessionRequestDto,
  ): Promise<IntakeSessionDetailDto> {
    return request(
      '/intake/sessions',
      { method: 'POST', body: JSON.stringify(data) },
      () => mockIntakeEngine.createSession(data, useAuthStore.getState().user),
    );
  },

  getIntakeSession(id: string): Promise<IntakeSessionDetailDto> {
    return request(`/intake/sessions/${id}`, {}, () =>
      mockIntakeEngine.getDetail(id),
    );
  },

  /** Egészségügyi válaszok: minden olvasás auditnaplóba kerül. */
  getIntakeHealth(id: string): Promise<IntakeHealthDto> {
    return request(`/intake/sessions/${id}/health`, {}, () =>
      mockIntakeEngine.getHealth(id, useAuthStore.getState().user),
    );
  },

  updateIntakeSession(
    id: string,
    data: UpdateIntakeSessionRequestDto,
  ): Promise<IntakeSessionDetailDto> {
    return request(
      `/intake/sessions/${id}`,
      { method: 'PATCH', body: JSON.stringify(data) },
      () =>
        mockIntakeEngine.updateSession(id, data, useAuthStore.getState().user),
    );
  },

  startIntakeGuestMode(id: string): Promise<IntakeGuestTokenDto> {
    return request(`/intake/sessions/${id}/guest-mode`, { method: 'POST' }, () =>
      mockIntakeEngine.startGuestMode(id, useAuthStore.getState().user),
    );
  },

  sendIntakeToDevice(
    id: string,
    deviceId: string,
  ): Promise<IntakeSendToDeviceResponseDto> {
    return request(
      `/intake/sessions/${id}/send-to-device`,
      { method: 'POST', body: JSON.stringify({ deviceId }) },
      () =>
        mockIntakeEngine.sendToDevice(
          id,
          deviceId,
          useAuthStore.getState().user,
        ),
    );
  },

  intakeSessionAction(
    id: string,
    action: IntakeSessionAction,
  ): Promise<IntakeSessionDetailDto> {
    return request(`/intake/sessions/${id}/${action}`, { method: 'POST' }, () => {
      const user = useAuthStore.getState().user;
      switch (action) {
        case 'release':
          return mockIntakeEngine.releaseGuestMode(id, user);
        case 'return':
          return mockIntakeEngine.returnToGuest(id, user);
        case 'approve':
          return mockIntakeEngine.approve(id, user);
        case 'retry':
          return mockIntakeEngine.retry(id, user);
        case 'cancel':
          return mockIntakeEngine.cancel(id, user);
      }
    });
  },

  getGuestIntakeDocuments(guestId: string): Promise<IntakeDocumentSnapshotDto[]> {
    return request(`/guests/${guestId}/intake-documents`, {}, () =>
      mockIntakeEngine.listGuestDocuments(guestId),
    );
  },

  async getIntakeDocumentLink(documentId: string): Promise<IntakeDocumentLinkDto> {
    const link = await request<IntakeDocumentLinkDto>(
      `/intake/documents/${documentId}/link`,
      { method: 'POST' },
      () =>
        mockIntakeEngine.documentLink(documentId, useAuthStore.getState().user),
    );
    // A helyi tároló linkje az API relatív útvonala.
    return link.url.startsWith('/')
      ? { ...link, url: `${API_BASE_URL}${link.url}` }
      : link;
  },

  emailIntakeDocument(documentId: string): Promise<{ sent: true }> {
    return request(
      `/intake/documents/${documentId}/email`,
      { method: 'POST' },
      () =>
        mockIntakeEngine.sendDocumentEmail(
          documentId,
          useAuthStore.getState().user,
        ),
    );
  },

  /** Párosított tablet: a neki küldött kitöltés átvétele (`null`, ha nincs). */
  claimIntakeForDevice(
    deviceToken: string,
  ): Promise<{ assignment: IntakeDeviceAssignmentDto | null }> {
    return request(
      '/intake/device/claim',
      {
        method: 'POST',
        headers: { [DEVICE_TOKEN_HEADER]: deviceToken },
        anonymous: true,
      },
      () => ({ assignment: mockIntakeEngine.claimForDevice(deviceToken) }),
    );
  },

  // A vendégmód hívásai csak a kitöltéshez kötött tokent viszik (munkatársi token nincs).
  getIntakeGuestView(guestToken: string): Promise<IntakeGuestViewDto> {
    return request('/intake/guest/session', intakeGuestInit(guestToken), () =>
      mockIntakeEngine.getGuestView(guestToken),
    );
  },

  saveIntakeGuestAnswers(
    guestToken: string,
    formKey: string,
    answers: IntakeAnswers,
  ): Promise<{ warnings: IntakeWarning[] }> {
    return request(
      '/intake/guest/answers',
      intakeGuestInit(guestToken, 'PUT', { formKey, answers }),
      () => mockIntakeEngine.saveGuestAnswers(guestToken, formKey, answers),
    );
  },

  saveIntakeGuestPhoto(
    guestToken: string,
    dataUrl: string,
  ): Promise<{ saved: true }> {
    return request(
      '/intake/guest/photo',
      intakeGuestInit(guestToken, 'PUT', { dataUrl }),
      () => mockIntakeEngine.saveGuestPhoto(guestToken, dataUrl),
    );
  },

  submitIntakeGuest(
    guestToken: string,
    signatureDataUrl: string,
  ): Promise<IntakeGuestViewDto> {
    return request(
      '/intake/guest/submit',
      intakeGuestInit(guestToken, 'POST', { signatureDataUrl }),
      () => mockIntakeEngine.submitGuest(guestToken, signatureDataUrl),
    );
  },

  exitIntakeGuestMode(
    guestToken: string,
    exitCode: string,
  ): Promise<IntakeGuestExitResponseDto> {
    return request(
      '/intake/guest/exit',
      intakeGuestInit(guestToken, 'POST', { exitCode }),
      () => mockIntakeEngine.exitGuestMode(guestToken, exitCode),
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

  /** Levelezés (TICKET-55): a levélküldés állapota (beállítva-e, korlát, sor). */
  getMailStatus(): Promise<MailStatusDto> {
    return request('/mail/status', {}, () => mockMailEngine.getStatus());
  },

  getEmailTemplates(): Promise<EmailTemplateDto[]> {
    return request('/mail/templates', {}, () => mockMailEngine.getTemplates());
  },

  createEmailTemplate(data: SaveEmailTemplateDto): Promise<EmailTemplateDto> {
    return request(
      '/mail/templates',
      { method: 'POST', body: JSON.stringify(data) },
      () => mockMailEngine.createTemplate(data, currentUser()),
    );
  },

  updateEmailTemplate(
    id: string,
    data: SaveEmailTemplateDto,
  ): Promise<EmailTemplateDto> {
    return request(
      `/mail/templates/${id}`,
      { method: 'PATCH', body: JSON.stringify(data) },
      () => mockMailEngine.updateTemplate(id, data, currentUser()),
    );
  },

  deleteEmailTemplate(id: string): Promise<{ deletedId: string }> {
    return request(`/mail/templates/${id}`, { method: 'DELETE' }, () =>
      mockMailEngine.deleteTemplate(id, currentUser()),
    );
  },

  /** Tesztlevél a bejelentkezett munkatárs címére. */
  sendTestEmail(data: SendTestEmailDto): Promise<MessageLogDto> {
    return request(
      '/mail/test',
      { method: 'POST', body: JSON.stringify(data) },
      () => mockMailEngine.sendTest(data, currentUser()),
    );
  },

  getEmailAutomations(): Promise<EmailAutomationDto[]> {
    return request('/mail/automations', {}, () =>
      mockMailEngine.getAutomations(currentUser()),
    );
  },

  updateEmailAutomation(
    kind: EmailAutomationKind,
    data: UpdateEmailAutomationDto,
  ): Promise<EmailAutomationDto> {
    return request(
      `/mail/automations/${kind}`,
      { method: 'PATCH', body: JSON.stringify(data) },
      () => mockMailEngine.updateAutomation(kind, data, currentUser()),
    );
  },

  /** Csoportos küldés: a szűrőnek megfelelő, hozzájáruló címzettek. */
  previewEmailAudience(
    filter: EmailAudienceFilterDto,
  ): Promise<EmailAudiencePreviewDto> {
    return request(
      '/mail/audience/preview',
      { method: 'POST', body: JSON.stringify({ filter }) },
      () => mockMailEngine.previewAudience(filter, currentUser()),
    );
  },

  sendBulkEmail(data: SendBulkEmailDto): Promise<SendBulkEmailResultDto> {
    return request(
      '/mail/bulk',
      { method: 'POST', body: JSON.stringify(data) },
      () => mockMailEngine.sendBulk(data, currentUser()),
    );
  },

  getEmailMessages(
    query: EmailMessageListQueryDto = {},
  ): Promise<EmailMessageListDto> {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== '') qs.set(key, String(value));
    }
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return request(`/mail/messages${suffix}`, {}, () =>
      mockMailEngine.getMessages(query),
    );
  },

  retryEmailMessage(id: string): Promise<MessageLogDto> {
    return request(`/mail/messages/${id}/retry`, { method: 'POST' }, () =>
      mockMailEngine.retryMessage(id),
    );
  },

  getGuestEmailMessages(guestId: string): Promise<MessageLogDto[]> {
    return request(`/mail/guests/${guestId}/messages`, {}, () =>
      mockMailEngine.getGuestMessages(guestId),
    );
  },

  /** Egyéni levél a vendégadatlapról (recepciós is küldheti). */
  sendGuestEmail(
    guestId: string,
    data: SendGuestEmailDto,
  ): Promise<MessageLogDto> {
    return request(
      `/mail/guests/${guestId}/messages`,
      { method: 'POST', body: JSON.stringify(data) },
      () => mockMailEngine.sendToGuest(guestId, data, currentUser()),
    );
  },

  /** Nyilvános leiratkozó oldal (belépés nélkül, a levélben kapott tokennel). */
  getUnsubscribeInfo(token: string): Promise<UnsubscribeInfoDto> {
    return request(`/public/unsubscribe/${encodeURIComponent(token)}`, {}, () =>
      mockMailEngine.getUnsubscribeInfo(token),
    );
  },

  unsubscribe(token: string): Promise<UnsubscribeInfoDto> {
    return request(
      `/public/unsubscribe/${encodeURIComponent(token)}`,
      { method: 'POST' },
      () => mockMailEngine.unsubscribe(token),
    );
  },

  initDisplayPairing(
    name: string,
    kind: DisplayDeviceKind = 'MONITOR',
  ): Promise<DisplayDeviceDto> {
    return request(
      '/auth/monitor/pair-init',
      {
        method: 'POST',
        body: JSON.stringify({ name, kind }),
      },
      () => mockStudioEngine.initDisplayPairing(name, kind),
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

  /** A bejelentkezett fiók látott oldalbemutatói (TICKET-53). */
  getTourState(): Promise<TourStateDto> {
    return request('/tours', {}, () => mockStudioEngine.getTourState());
  },

  recordTourEvent(event: TourEventDto): Promise<TourStateDto> {
    return request(
      '/tours',
      { method: 'POST', body: JSON.stringify(event), keepalive: true },
      () => mockStudioEngine.recordTourEvent(event),
    );
  },
};
