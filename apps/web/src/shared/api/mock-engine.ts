import {
  appError,
  applyTourEvent,
  ARRIVAL_DENIED_MESSAGES,
  AuditLogDto,
  AuthUserDto,
  canDeleteMeasurement,
  computeRemainingPasses,
  countActiveDeductions,
  getPassStatus,
  isPassOpen,
  passCoversService,
  passDeductionError,
  CheckInResultPayload,
  CheckInRevokedPayload,
  CheckInStatus,
  CheckInWarningCode,
  DailyFinanceSummaryDto,
  DeductPassUsageRequestDto,
  DEFAULT_MONITOR_GREETING_SECONDS,
  DEFAULT_STUDIO_ID,
  DisplayDeviceDto,
  DisplayDeviceStatus,
  DocumentStatus,
  DocumentType,
  DUPLICATE_SCAN_COOLDOWN_SECONDS,
  EXPIRING_SOON_THRESHOLD_DAYS,
  formatPeriod,
  frozenDaysBetween,
  getDueDate,
  getMembershipStatusTimestamps,
  getMissingDues,
  getOverdueBucket,
  getOverdueDays,
  getStudioDate,
  greetingFields,
  inferGenderFromFirstName,
  Gender,
  GuestDocumentDto,
  GuestDto,
  GuestNoteDto,
  GuestPassDto,
  GuestPhotoDto,
  GuestStatus,
  isBirthdayToday,
  isDueRemovableOnStop,
  isPassFreezable,
  LoggedCheckInDto,
  MeasurementDto,
  MembershipDto,
  MembershipDueDto,
  MembershipDueStatus,
  MembershipStatus,
  MessageLogDto,
  MessageStatus,
  MonitorDeviceRevokedPayload,
  MonitorTestPingPayload,
  OfflineScanItemDto,
  OfflineSyncResponseDto,
  OverdueBucket,
  OverdueReportDto,
  OverdueSummaryItemDto,
  PairDisplayResponseDto,
  PassStatus,
  PassTemplateDto,
  PassType,
  PassUsageLogDto,
  PaymentDto,
  PaymentMethod,
  pickCircuitMembershipService,
  RecordPaymentRequestDto,
  readTourState,
  resolveArrivalEntitlement,
  Role,
  ServiceCategory,
  ServiceDto,
  StoredTourState,
  stopsBilling,
  TodayDashboardDto,
  TOUR_ID_PATTERN,
  TOUR_STEP_MAX,
  TourEventDto,
  TourStateDto,
  toGuestArrivals,
  VisitDto,
  VisitType,
  womenOnlyAccess,
} from '@reform/shared';
import { broadcastToLocalMonitors } from '@/shared/lib/monitor-channel';

// v4: havi tagdíj-pótlás (TICKET-13) és naplóból számolt alkalom (TICKET-16); a régi tárolt állapot nem konzisztens vele.
const STORAGE_KEY = 'reform-studio-mock-sandbox-v4';
const MONITOR_CONFIG_KEY = 'reform-studio-monitor-greeting-seconds';
/** A látott oldalbemutatók (`GET/POST /tours` párja); a demó adatbázis visszaállítása nem törli. */
const TOURS_KEY = 'reform-studio-mock-tours';

export interface MockDatabaseState {
  services: ServiceDto[];
  templates: PassTemplateDto[];
  guests: GuestDto[];
  checkIns: LoggedCheckInDto[];
  visits: VisitDto[];
  payments: PaymentDto[];
  auditLogs: AuditLogDto[];
  devices: DisplayDeviceDto[];
}

function addDays(base: Date, days: number): string {
  return new Date(base.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * A bérlet számolt mezői a naplóból, ugyanazzal a szabállyal, mint az API-n (TICKET-16):
 * hátralévő = összes − nem visszavont levonások; aktív = nincs sztornózva és van alkalom.
 */
function syncPassState(pass: GuestPassDto, now = new Date()): GuestPassDto {
  const logs = pass.usageLogs ?? [];
  const remaining = computeRemainingPasses(pass.totalPasses, logs);
  pass.remainingPasses = remaining;
  pass.calculatedRemainingPasses = remaining;
  pass.usedPassesCount = countActiveDeductions(logs);
  pass.isActive = isPassOpen(pass, remaining);
  pass.status = getPassStatus(pass, now);
  return pass;
}

/** Levonás visszavonása és jóváírás — pontosan egyszer (az API `reverseDeduction` párja). */
function reverseDeduction(
  pass: GuestPassDto,
  usage: PassUsageLogDto,
  reason: string,
  now: Date,
): number | 'Korlátlan' {
  if (usage.reversedAt) throw appError('PASS.USAGE_ALREADY_REVERSED');
  usage.reversedAt = now.toISOString();
  usage.reversalReason = reason;
  syncPassState(pass, now);
  return pass.type === PassType.OCCASION_BASED
    ? (pass.remainingPasses ?? 0)
    : 'Korlátlan';
}

/** Sikeres beléptetés sztornója és a látogatás törlése (az API `voidArrival` párja). */
function voidArrival(
  state: MockDatabaseState,
  checkIn: LoggedCheckInDto,
  reason: string,
): boolean {
  if (checkIn.status !== CheckInStatus.SUCCESS) return false;
  checkIn.status = CheckInStatus.CANCELLED;
  checkIn.reason = reason;
  if (checkIn.visitId) {
    state.visits = state.visits.filter((v) => v.id !== checkIn.visitId);
  }
  return true;
}

/**
 * A vendég belépései a beléptetési naplóból, a közös `toGuestArrivals`-szal (az API `mapGuest`
 * párja, TICKET-40): a bérlet és a levonás szolgáltatása a vendég bérleteiből oldódik fel.
 */
function syncGuestArrivals(state: MockDatabaseState, guest: GuestDto) {
  const passes = new Map((guest.passes ?? []).map((p) => [p.id, p]));
  const usageServiceByCheckIn = new Map<string, string | null>();
  for (const p of guest.passes ?? []) {
    for (const u of p.usageLogs ?? []) {
      if (u.checkInId) usageServiceByCheckIn.set(u.checkInId, u.serviceName ?? null);
    }
  }
  guest.arrivals = toGuestArrivals(
    state.checkIns
      .filter((c) => c.guestId === guest.id)
      .map((c) => {
        const pass = c.guestPassId ? passes.get(c.guestPassId) : undefined;
        return {
          id: c.id,
          createdAt: c.createdAt,
          // Az adatbázis alapértéke, ha a napló nem jegyzi (elutasítás).
          visitType: c.visitType ?? VisitType.CIRCUIT_TRAINING,
          status: c.status,
          reason: c.reason ?? null,
          guestPassId: c.guestPassId ?? null,
          passName: pass?.passTemplateName ?? null,
          usageServiceName: usageServiceByCheckIn.get(c.id) ?? null,
          passServiceName: pass?.serviceName ?? null,
          staffName: c.staffName ?? null,
        };
      }),
  );
}

/** Korrekciós napló (az API `logCorrection` párja). */
function logCorrection(
  state: MockDatabaseState,
  entry: Pick<AuditLogDto, 'action' | 'entityType' | 'entityId' | 'details'>,
  now: Date,
) {
  state.auditLogs.unshift({
    id: `audit-${Date.now()}`,
    userId: 'staff-default-1',
    userName: 'Recepciós Munkatárs',
    createdAt: now.toISOString(),
    ...entry,
  });
}

// Kisméretű SVG alapú optimalizált WebP/SVG előtte-utána mintaillusztráció
function createSampleSvgDataUrl(label: string, colorHex: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="320" viewBox="0 0 480 320"><rect width="480" height="320" rx="20" fill="${colorHex}"/><circle cx="240" cy="125" r="46" fill="rgba(255,255,255,0.22)"/><rect x="170" y="185" width="140" height="65" rx="18" fill="rgba(255,255,255,0.22)"/><text x="240" y="285" font-family="sans-serif" font-size="16" font-weight="bold" fill="#ffffff" text-anchor="middle">${label}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function createInitialMockDatabase(): MockDatabaseState {
  const now = new Date();
  const todayMmDd = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  // Tagsági demóadat: a kezdés napja az esedékesség napja, így a havi pótlás
  // (getMembershipDueSchedule) nem gyárt hozzájuk korábbi, fiktív tartozást.
  const seedBilling = (daysAgo: number) => {
    const day = getStudioDate(addDays(now, -daysAgo));
    const dueDate = getDueDate(day.year, day.month, day.day).toISOString();
    return { dueDay: day.day, period: formatPeriod(day.year, day.month), dueDate };
  };
  const billing1 = seedBilling(5);
  const billing2 = seedBilling(3);
  const billing3 = seedBilling(9);
  const billing4 = seedBilling(21);

  const services: ServiceDto[] = [
    {
      id: 'srv-circuit',
      studioId: DEFAULT_STUDIO_ID,
      name: 'Női Köredzés (Havi Tagság)',
      category: ServiceCategory.CIRCUIT,
      durationMinutes: 45,
      priceHuf: 22000,
      womenOnly: true,
      isActive: true,
      createdAt: addDays(now, -60),
    },
    {
      id: 'srv-hypoxi',
      studioId: DEFAULT_STUDIO_ID,
      name: 'Hypoxi',
      category: ServiceCategory.BODY_SHAPING,
      durationMinutes: 30,
      priceHuf: 9500,
      womenOnly: false,
      isActive: true,
      createdAt: addDays(now, -60),
    },
    {
      id: 'srv-reformer',
      studioId: DEFAULT_STUDIO_ID,
      name: 'Reformer Pilates',
      category: ServiceCategory.BODY_SHAPING,
      durationMinutes: 50,
      priceHuf: 6500,
      womenOnly: false,
      isActive: true,
      createdAt: addDays(now, -60),
    },
    {
      id: 'srv-cavitation',
      studioId: DEFAULT_STUDIO_ID,
      name: 'Ultrahangos Kavitációs Zsírbontás',
      category: ServiceCategory.BODY_SHAPING,
      durationMinutes: 40,
      priceHuf: 12000,
      womenOnly: false,
      isActive: true,
      createdAt: addDays(now, -60),
    },
    {
      id: 'srv-facial',
      studioId: DEFAULT_STUDIO_ID,
      name: 'Hialuronos Arckezelés & Rádiófrekvencia',
      category: ServiceCategory.COSMETIC,
      durationMinutes: 60,
      priceHuf: 16500,
      womenOnly: false,
      isActive: true,
      createdAt: addDays(now, -60),
    },
  ];

  const templates: PassTemplateDto[] = [
    {
      id: 'tpl-hypoxi-10',
      studioId: DEFAULT_STUDIO_ID,
      serviceId: 'srv-hypoxi',
      serviceName: 'Hypoxi',
      name: '10 Alkalmas Hypoxi Bérlet',
      type: PassType.OCCASION_BASED,
      totalPasses: 10,
      durationDays: 60,
      price: 79000,
      isActive: true,
      createdAt: addDays(now, -30),
    },
    {
      id: 'tpl-10',
      studioId: DEFAULT_STUDIO_ID,
      serviceId: 'srv-reformer',
      serviceName: 'Reformer Pilates',
      name: '10 Alkalmas Reformer Bérlet',
      type: PassType.OCCASION_BASED,
      totalPasses: 10,
      durationDays: 60,
      price: 54000,
      isActive: true,
      createdAt: addDays(now, -30),
    },
    {
      id: 'tpl-5',
      studioId: DEFAULT_STUDIO_ID,
      serviceId: 'srv-cavitation',
      serviceName: 'Ultrahangos Kavitációs Zsírbontás',
      name: '5 Alkalmas Alakformáló / Kavitációs Bérlet',
      type: PassType.OCCASION_BASED,
      totalPasses: 5,
      durationDays: 45,
      price: 49000,
      isActive: true,
      createdAt: addDays(now, -30),
    },
    {
      id: 'tpl-facial-5',
      studioId: DEFAULT_STUDIO_ID,
      serviceId: 'srv-facial',
      serviceName: 'Hialuronos Arckezelés & Rádiófrekvencia',
      name: '5 Alkalmas Prémium Kozmetikai Bérlet',
      type: PassType.OCCASION_BASED,
      totalPasses: 5,
      durationDays: 60,
      price: 68000,
      isActive: true,
      createdAt: addDays(now, -30),
    },
    {
      id: 'tpl-1',
      studioId: DEFAULT_STUDIO_ID,
      serviceId: 'srv-reformer',
      serviceName: 'Reformer Pilates',
      name: '1 Alkalmas Napijegy',
      type: PassType.OCCASION_BASED,
      totalPasses: 1,
      durationDays: 7,
      price: 6500,
      isActive: true,
      createdAt: addDays(now, -30),
    },
    {
      id: 'tpl-unlimited',
      studioId: DEFAULT_STUDIO_ID,
      serviceId: 'srv-circuit',
      serviceName: 'Női Köredzés (Havi Tagság)',
      name: 'Havi Korlátlan Köredzés Bérlet',
      type: PassType.TIME_BASED,
      totalPasses: null,
      durationDays: 30,
      price: 22000,
      isActive: true,
      createdAt: addDays(now, -30),
    },
  ];

  const guests: GuestDto[] = [
    {
      id: 'guest-1',
      studioId: DEFAULT_STUDIO_ID,
      barcode: '100001',
      firstName: 'Anna',
      lastName: 'Kovács',
      email: 'anna.kovacs@reform.hu',
      phone: '+36 30 412 8891',
      birthDate: `1991-${todayMmDd}`, // Mai születésnapos a KPI teszthez!
      nameDay: '07-26',
      gender: Gender.FEMALE,
      status: GuestStatus.ACTIVE,
      notes: 'Köredzés havi tag + Hypoxi alakformáló kúra (kedd/csütörtök)',
      isActive: true,
      createdAt: addDays(now, -90),
      updatedAt: addDays(now, -1),
      memberships: [
        {
          id: 'mem-1',
          studioId: DEFAULT_STUDIO_ID,
          guestId: 'guest-1',
          guestName: 'Kovács Anna',
          serviceId: 'srv-circuit',
          serviceName: 'Női Köredzés (Havi Tagság)',
          monthlyFeeHuf: 22000,
          startDate: billing1.dueDate,
          dueDay: billing1.dueDay,
          status: MembershipStatus.ACTIVE,
          pausedAt: null,
          terminatedAt: null,
          createdAt: addDays(now, -60),
          dues: [
            {
              id: 'due-1',
              membershipId: 'mem-1',
              guestId: 'guest-1',
              guestName: 'Kovács Anna',
              period: billing1.period,
              dueDate: billing1.dueDate,
              amountHuf: 22000,
              paidAmountHuf: 22000,
              remainingHuf: 0,
              status: MembershipDueStatus.PAID,
              overdueDays: 0,
              overdueBucket: OverdueBucket.NONE,
              createdAt: addDays(now, -15),
            },
          ],
        },
      ],
      passes: [
        {
          id: 'pass-1',
          studioId: DEFAULT_STUDIO_ID,
          guestId: 'guest-1',
          passTemplateId: 'tpl-hypoxi-10',
          passTemplateName: '10 Alkalmas Hypoxi Bérlet',
          serviceId: 'srv-hypoxi',
          serviceName: 'Hypoxi',
          type: PassType.OCCASION_BASED,
          totalPasses: 10,
          remainingPasses: 7,
          calculatedRemainingPasses: 7,
          usedPassesCount: 3,
          startDate: addDays(now, -20),
          expirationDate: addDays(now, 40),
          isActive: true,
          isFrozen: false,
          frozenAt: null,
          status: PassStatus.ACTIVE, // syncPassState számolja
          createdAt: addDays(now, -20),
          usageLogs: [
            {
              id: 'ulog-103',
              guestPassId: 'pass-1',
              guestId: 'guest-1',
              guestName: 'Kovács Anna',
              serviceId: 'srv-hypoxi',
              serviceName: 'Hypoxi',
              passName: '10 Alkalmas Hypoxi Bérlet',
              employeeId: 'staff-default-1',
              employeeName: 'Recepciós Munkatárs',
              delta: -1,
              remainingAfter: 7,
              usedAt: addDays(now, -3),
              reversedAt: null,
              reversalReason: null,
              note: 'Kezelés: Hypoxi (30 perc)',
            },
            {
              id: 'ulog-102',
              guestPassId: 'pass-1',
              guestId: 'guest-1',
              guestName: 'Kovács Anna',
              serviceId: 'srv-hypoxi',
              serviceName: 'Hypoxi',
              passName: '10 Alkalmas Hypoxi Bérlet',
              employeeId: 'staff-default-1',
              employeeName: 'Recepciós Munkatárs',
              delta: -1,
              remainingAfter: 8,
              usedAt: addDays(now, -7),
              reversedAt: null,
              reversalReason: null,
              note: 'Kezelés: Hypoxi (30 perc)',
            },
            {
              id: 'ulog-101',
              guestPassId: 'pass-1',
              guestId: 'guest-1',
              guestName: 'Kovács Anna',
              serviceId: 'srv-hypoxi',
              serviceName: 'Hypoxi',
              passName: '10 Alkalmas Hypoxi Bérlet',
              employeeId: 'staff-default-1',
              employeeName: 'Recepciós Munkatárs',
              delta: -1,
              remainingAfter: 9,
              usedAt: addDays(now, -12),
              reversedAt: null,
              reversalReason: null,
              note: 'Kezelés: Hypoxi (30 perc)',
            },
          ],
        },
        {
          id: 'pass-1b',
          studioId: DEFAULT_STUDIO_ID,
          guestId: 'guest-1',
          passTemplateId: 'tpl-facial-5',
          passTemplateName: '5 Alkalmas Prémium Kozmetikai Bérlet',
          serviceId: 'srv-facial',
          serviceName: 'Hialuronos Arckezelés & Rádiófrekvencia',
          type: PassType.OCCASION_BASED,
          totalPasses: 5,
          remainingPasses: 4,
          calculatedRemainingPasses: 4,
          usedPassesCount: 1,
          startDate: addDays(now, -10),
          expirationDate: addDays(now, 50),
          isActive: true,
          isFrozen: false,
          frozenAt: null,
          status: PassStatus.ACTIVE, // syncPassState számolja
          createdAt: addDays(now, -10),
          usageLogs: [
            {
              id: 'ulog-104',
              guestPassId: 'pass-1b',
              guestId: 'guest-1',
              guestName: 'Kovács Anna',
              serviceId: 'srv-facial',
              serviceName: 'Hialuronos Arckezelés & Rádiófrekvencia',
              passName: '5 Alkalmas Prémium Kozmetikai Bérlet',
              employeeId: 'staff-default-1',
              employeeName: 'Recepciós Munkatárs',
              delta: -1,
              remainingAfter: 4,
              usedAt: addDays(now, -6),
              reversedAt: null,
              reversalReason: null,
              note: 'Kezelés: Hialuronos Arckezelés',
            },
          ],
        },
      ],
      measurements: [
        {
          id: 'ms-2',
          guestId: 'guest-1',
          measuredAt: addDays(now, -2),
          weightKg: 63.4,
          bodyFatPct: 24.8,
          muscleMassKg: 26.2,
          visceralFat: 4,
          waistCm: 71,
          hipCm: 95,
          thighCm: 54,
          armCm: 27,
          chestCm: 89,
          note: '3. Hypoxi kezelés utáni kontroll (-2.1 kg, -3 cm derék)',
          recordedById: null,
          recordedByName: 'Recepciós Munkatárs',
        },
        {
          id: 'ms-1',
          guestId: 'guest-1',
          measuredAt: addDays(now, -20),
          weightKg: 65.5,
          bodyFatPct: 26.9,
          muscleMassKg: 25.8,
          visceralFat: 5,
          waistCm: 74,
          hipCm: 98,
          thighCm: 56,
          armCm: 28,
          chestCm: 90,
          note: 'Kezdő állapotfelmérés a kúra indulásakor',
          recordedById: null,
          recordedByName: 'Recepciós Munkatárs',
        },
      ],
      photos: [
        {
          id: 'ph-1',
          guestId: 'guest-1',
          serviceId: 'srv-hypoxi',
          serviceName: 'Hypoxi',
          takenAt: addDays(now, -20),
          fileUrl: createSampleSvgDataUrl('Kovács Anna • Előtte (1. hét)', '#047857'),
          mimeType: 'image/webp',
          originalSizeBytes: 4820400,
          compressedSizeBytes: 88400,
          width: 1200,
          height: 800,
          visibilityRole: Role.RECEPTIONIST,
          note: 'Hypoxi kúra előtti állapotfotó (WebP optimalizált)',
        },
        {
          id: 'ph-2',
          guestId: 'guest-1',
          serviceId: 'srv-hypoxi',
          serviceName: 'Hypoxi',
          takenAt: addDays(now, -2),
          fileUrl: createSampleSvgDataUrl('Kovács Anna • Kontroll (3. hét)', '#0f766e'),
          mimeType: 'image/webp',
          originalSizeBytes: 5190200,
          compressedSizeBytes: 91200,
          width: 1200,
          height: 800,
          visibilityRole: Role.RECEPTIONIST,
          note: '3. heti kontrollfotó (-3 cm derékbőség)',
        },
      ],
      documents: [
        {
          id: 'doc-1',
          guestId: 'guest-1',
          guestName: 'Kovács Anna',
          documentType: DocumentType.GDPR_CONSENT,
          title: 'GDPR Adatkezelési Nyilatkozat és Házirend Elfogadás',
          contentText:
            'Alulírott Kovács Anna hozzájárulok a RE-FORM Stúdió nyilvántartási rendszerében történő adatkezeléshez, a vonalkódos beléptetéshez és a kezelési előzmények rögzítéséhez.',
          fieldsJson: {
            allergia: 'Nincs',
            ellenjavallat: 'Nincs ismert kontraindikáció',
          },
          signatureDataUrl: createSampleSvgDataUrl('Kovács Anna (Aláírva)', '#1e293b'),
          signedAt: addDays(now, -20),
          status: DocumentStatus.SIGNED,
          createdAt: addDays(now, -20),
        },
        {
          id: 'doc-2',
          guestId: 'guest-1',
          guestName: 'Kovács Anna',
          documentType: DocumentType.HEALTH_QUESTIONNAIRE,
          title: 'Hypoxi & Alakformáló Kezelési Állapotfelmérő Ív',
          contentText:
            'Kijelentem, hogy a Hypoxi vákuumos alakformáló kezelés egészségügyi tájékoztatóját megismertem, terhesség, trombózis vagy akut keringési betegség nem áll fenn.',
          fieldsJson: {
            vernyomas: 'Normál (120/80)',
            napiFolyadek: '2.5 liter',
          },
          signatureDataUrl: null,
          signedAt: null,
          status: DocumentStatus.PENDING_SIGNATURE,
          createdAt: addDays(now, -1),
        },
      ],
      internalNotes: [
        {
          id: 'note-1',
          guestId: 'guest-1',
          authorId: 'staff-default-1',
          authorName: 'Recepciós Munkatárs',
          content: 'Minden alkalommal M-es méretű Hypoxi szoknyát használ.',
          createdAt: addDays(now, -14),
        },
      ],
      messageLogs: [
        {
          id: 'msg-1',
          guestId: 'guest-1',
          guestName: 'Kovács Anna',
          recipientEmail: 'anna.kovacs@reform.hu',
          subject: 'RE-FORM Stúdió — Bérletvásárlás visszaigazolás',
          messageType: 'PASS_PURCHASE_CONFIRMATION',
          status: MessageStatus.DELIVERED,
          sentAt: addDays(now, -20),
          errorDetails: null,
        },
      ],
    },
    {
      id: 'guest-2',
      studioId: DEFAULT_STUDIO_ID,
      barcode: '100002',
      firstName: 'Péter',
      lastName: 'Nagy',
      email: 'peter.nagy@reform.hu',
      phone: '+36 70 331 5520',
      birthDate: '1988-04-12',
      nameDay: todayMmDd, // Mai névnapos a KPI teszthez!
      gender: Gender.MALE,
      status: GuestStatus.ACTIVE,
      notes: '1-5 napos tagdíj késés + utolsó 1 alkalmas bérlet teszteléséhez',
      isActive: true,
      createdAt: addDays(now, -45),
      updatedAt: addDays(now, -1),
      memberships: [
        {
          id: 'mem-2',
          studioId: DEFAULT_STUDIO_ID,
          guestId: 'guest-2',
          guestName: 'Nagy Péter',
          serviceId: 'srv-circuit',
          serviceName: 'Női Köredzés (Havi Tagság)',
          monthlyFeeHuf: 22000,
          startDate: billing2.dueDate,
          dueDay: billing2.dueDay,
          status: MembershipStatus.ACTIVE,
          pausedAt: null,
          terminatedAt: null,
          createdAt: addDays(now, -35),
          dues: [
            {
              id: 'due-2',
              membershipId: 'mem-2',
              guestId: 'guest-2',
              guestName: 'Nagy Péter',
              period: billing2.period,
              dueDate: billing2.dueDate, // 3 napja lejárt -> 1–5 napos késési kategória
              amountHuf: 22000,
              paidAmountHuf: 0,
              remainingHuf: 22000,
              status: MembershipDueStatus.PENDING,
              overdueDays: 3,
              overdueBucket: OverdueBucket.DAYS_1_5,
              createdAt: addDays(now, -10),
            },
          ],
        },
      ],
      passes: [
        {
          id: 'pass-2',
          studioId: DEFAULT_STUDIO_ID,
          guestId: 'guest-2',
          passTemplateId: 'tpl-5',
          passTemplateName: '5 Alkalmas Alakformáló / Kavitációs Bérlet',
          serviceId: 'srv-cavitation',
          serviceName: 'Ultrahangos Kavitációs Zsírbontás',
          type: PassType.OCCASION_BASED,
          totalPasses: 5,
          remainingPasses: 1,
          calculatedRemainingPasses: 1,
          usedPassesCount: 4,
          startDate: addDays(now, -28),
          expirationDate: addDays(now, 2),
          isActive: true,
          isFrozen: false,
          frozenAt: null,
          status: PassStatus.ACTIVE, // syncPassState számolja
          createdAt: addDays(now, -28),
          usageLogs: [
            {
              id: 'ulog-201',
              guestPassId: 'pass-2',
              guestId: 'guest-2',
              guestName: 'Nagy Péter',
              serviceId: 'srv-cavitation',
              serviceName: 'Ultrahangos Kavitációs Zsírbontás',
              passName: '5 Alkalmas Alakformáló / Kavitációs Bérlet',
              employeeId: 'staff-default-1',
              employeeName: 'Recepciós Munkatárs',
              delta: -1,
              remainingAfter: 1,
              usedAt: addDays(now, -4),
              reversedAt: null,
              reversalReason: null,
              note: 'Kezelés: Ultrahangos Kavitációs Zsírbontás',
            },
          ],
        },
      ],
      measurements: [],
      photos: [],
      documents: [],
      internalNotes: [],
      messageLogs: [],
    },
    {
      id: 'guest-3',
      studioId: DEFAULT_STUDIO_ID,
      barcode: '100003',
      firstName: 'Eszter',
      lastName: 'Szabó',
      email: 'eszter.szabo@reform.hu',
      phone: '+36 20 981 1140',
      birthDate: '1995-11-08',
      nameDay: '05-24',
      gender: Gender.FEMALE,
      status: GuestStatus.ACTIVE,
      notes: '6-15 napos részbefizetett tagdíj + 2 maradék alkalmas bérlet',
      isActive: true,
      createdAt: addDays(now, -60),
      updatedAt: addDays(now, -3),
      memberships: [
        {
          id: 'mem-3',
          studioId: DEFAULT_STUDIO_ID,
          guestId: 'guest-3',
          guestName: 'Szabó Eszter',
          serviceId: 'srv-circuit',
          serviceName: 'Női Köredzés (Havi Tagság)',
          monthlyFeeHuf: 20000,
          startDate: billing3.dueDate,
          dueDay: billing3.dueDay,
          status: MembershipStatus.ACTIVE,
          pausedAt: null,
          terminatedAt: null,
          createdAt: addDays(now, -60),
          dues: [
            {
              id: 'due-3',
              membershipId: 'mem-3',
              guestId: 'guest-3',
              guestName: 'Szabó Eszter',
              period: billing3.period,
              dueDate: billing3.dueDate, // 9 napja esedékes -> 6–15 napos kategória (részbefizetéssel)
              amountHuf: 20000,
              paidAmountHuf: 10000,
              remainingHuf: 10000,
              status: MembershipDueStatus.PARTIAL,
              overdueDays: 9,
              overdueBucket: OverdueBucket.DAYS_6_15,
              createdAt: addDays(now, -15),
            },
          ],
        },
      ],
      passes: [
        {
          id: 'pass-3',
          studioId: DEFAULT_STUDIO_ID,
          guestId: 'guest-3',
          passTemplateId: 'tpl-10',
          passTemplateName: '10 Alkalmas Reformer Bérlet',
          serviceId: 'srv-reformer',
          serviceName: 'Reformer Pilates',
          type: PassType.OCCASION_BASED,
          totalPasses: 10,
          remainingPasses: 2,
          calculatedRemainingPasses: 2,
          usedPassesCount: 8,
          startDate: addDays(now, -40),
          expirationDate: addDays(now, 20),
          isActive: true,
          isFrozen: false,
          frozenAt: null,
          status: PassStatus.ACTIVE, // syncPassState számolja
          createdAt: addDays(now, -40),
          usageLogs: [],
        },
      ],
      measurements: [],
      photos: [],
      documents: [],
      internalNotes: [],
      messageLogs: [],
    },
    {
      id: 'guest-4',
      studioId: DEFAULT_STUDIO_ID,
      barcode: '100004',
      firstName: 'Gábor',
      lastName: 'Tóth',
      email: 'gabor.toth@reform.hu',
      phone: '+36 30 774 2019',
      birthDate: '1984-02-19',
      nameDay: '03-24',
      gender: Gender.MALE,
      status: GuestStatus.ACTIVE,
      notes: '15 nap feletti tartozás + lejárt bérlet teszteléséhez',
      isActive: true,
      createdAt: addDays(now, -70),
      updatedAt: addDays(now, -10),
      memberships: [
        {
          id: 'mem-4',
          studioId: DEFAULT_STUDIO_ID,
          guestId: 'guest-4',
          guestName: 'Tóth Gábor',
          serviceId: 'srv-circuit',
          serviceName: 'Női Köredzés (Havi Tagság)',
          monthlyFeeHuf: 24000,
          startDate: billing4.dueDate,
          dueDay: billing4.dueDay,
          status: MembershipStatus.ACTIVE,
          pausedAt: null,
          terminatedAt: null,
          createdAt: addDays(now, -70),
          dues: [
            {
              id: 'due-4',
              membershipId: 'mem-4',
              guestId: 'guest-4',
              guestName: 'Tóth Gábor',
              period: billing4.period,
              dueDate: billing4.dueDate, // 21 napja lejárt -> 15 nap feletti késés
              amountHuf: 24000,
              paidAmountHuf: 0,
              remainingHuf: 24000,
              status: MembershipDueStatus.PENDING,
              overdueDays: 21,
              overdueBucket: OverdueBucket.DAYS_OVER_15,
              createdAt: addDays(now, -25),
            },
          ],
        },
      ],
      passes: [
        {
          id: 'pass-4',
          studioId: DEFAULT_STUDIO_ID,
          guestId: 'guest-4',
          passTemplateId: 'tpl-10',
          passTemplateName: '10 Alkalmas Reformer Bérlet',
          serviceId: 'srv-reformer',
          serviceName: 'Reformer Pilates',
          type: PassType.OCCASION_BASED,
          totalPasses: 10,
          remainingPasses: 3,
          calculatedRemainingPasses: 3,
          usedPassesCount: 7,
          startDate: addDays(now, -65),
          expirationDate: addDays(now, -5),
          isActive: true,
          isFrozen: false,
          frozenAt: null,
          status: PassStatus.ACTIVE, // syncPassState számolja
          createdAt: addDays(now, -65),
          usageLogs: [],
        },
      ],
      measurements: [],
      photos: [],
      documents: [],
      internalNotes: [],
      messageLogs: [],
    },
    {
      id: 'guest-5',
      studioId: DEFAULT_STUDIO_ID,
      barcode: '100005',
      firstName: 'Judit',
      lastName: 'Varga',
      email: 'judit.varga@reform.hu',
      phone: '+36 30 611 9082',
      birthDate: '1993-09-14',
      nameDay: '12-10',
      gender: Gender.FEMALE,
      status: GuestStatus.ACTIVE,
      notes: 'Kimerült bérlet (0 alkalom maradt)',
      isActive: true,
      createdAt: addDays(now, -25),
      updatedAt: addDays(now, -2),
      memberships: [],
      passes: [
        {
          id: 'pass-5',
          studioId: DEFAULT_STUDIO_ID,
          guestId: 'guest-5',
          passTemplateId: 'tpl-5',
          passTemplateName: '5 Alkalmas Alakformáló / Kavitációs Bérlet',
          serviceId: 'srv-cavitation',
          serviceName: 'Ultrahangos Kavitációs Zsírbontás',
          type: PassType.OCCASION_BASED,
          totalPasses: 5,
          remainingPasses: 0,
          calculatedRemainingPasses: 0,
          usedPassesCount: 5,
          startDate: addDays(now, -20),
          expirationDate: addDays(now, 15),
          isActive: false,
          isFrozen: false,
          frozenAt: null,
          status: PassStatus.ACTIVE, // syncPassState számolja
          createdAt: addDays(now, -20),
          usageLogs: [],
        },
      ],
      measurements: [],
      photos: [],
      documents: [],
      internalNotes: [],
      messageLogs: [],
    },
    {
      id: 'guest-6',
      studioId: DEFAULT_STUDIO_ID,
      barcode: '100006',
      firstName: 'Dóra',
      lastName: 'Horváth',
      email: 'dora.horvath@reform.hu',
      phone: '+36 20 449 3210',
      birthDate: '1990-06-05',
      nameDay: '02-06',
      gender: Gender.FEMALE,
      status: GuestStatus.PAUSED,
      notes: 'Síbaleset miatt szüneteltetett tagság és fagyasztott bérlet',
      isActive: true,
      createdAt: addDays(now, -20),
      updatedAt: addDays(now, -4),
      memberships: [
        {
          id: 'mem-6',
          studioId: DEFAULT_STUDIO_ID,
          guestId: 'guest-6',
          guestName: 'Horváth Dóra',
          serviceId: 'srv-circuit',
          serviceName: 'Női Köredzés (Havi Tagság)',
          monthlyFeeHuf: 22000,
          startDate: billing1.dueDate,
          dueDay: billing1.dueDay,
          status: MembershipStatus.PAUSED,
          pausedAt: addDays(now, -4),
          terminatedAt: null,
          createdAt: addDays(now, -40),
          dues: [
            {
              id: 'due-6',
              membershipId: 'mem-6',
              guestId: 'guest-6',
              guestName: 'Horváth Dóra',
              period: billing1.period,
              dueDate: billing1.dueDate,
              amountHuf: 22000,
              paidAmountHuf: 22000,
              remainingHuf: 0,
              status: MembershipDueStatus.PAID,
              overdueDays: 0,
              overdueBucket: OverdueBucket.NONE,
              createdAt: billing1.dueDate,
            },
          ],
        },
      ],
      passes: [
        {
          id: 'pass-6',
          studioId: DEFAULT_STUDIO_ID,
          guestId: 'guest-6',
          passTemplateId: 'tpl-hypoxi-10',
          passTemplateName: '10 Alkalmas Hypoxi Bérlet',
          serviceId: 'srv-hypoxi',
          serviceName: 'Hypoxi',
          type: PassType.OCCASION_BASED,
          totalPasses: 10,
          remainingPasses: 8,
          calculatedRemainingPasses: 8,
          usedPassesCount: 2,
          startDate: addDays(now, -18),
          expirationDate: addDays(now, 42),
          isActive: true,
          isFrozen: true,
          frozenAt: addDays(now, -4),
          status: PassStatus.ACTIVE, // syncPassState számolja
          createdAt: addDays(now, -18),
          usageLogs: [
            {
              id: 'ulog-6',
              guestPassId: 'pass-6',
              guestId: 'guest-6',
              guestName: 'Horváth Dóra',
              serviceId: 'srv-hypoxi',
              serviceName: 'Hypoxi',
              passName: '10 Alkalmas Hypoxi Bérlet',
              employeeId: 'staff-default-1',
              employeeName: 'Recepciós Munkatárs',
              delta: 0,
              usedAt: addDays(now, -4),
              reversedAt: null,
              reversalReason: null,
              note: 'Bérlet fagyasztva: Síbaleset / térdsérülés',
            },
          ],
        },
      ],
      measurements: [],
      photos: [],
      documents: [],
      internalNotes: [],
      messageLogs: [],
    },
  ];

  // Gyorsított kezelési előzmény összerendelés minden vendéghez
  for (const g of guests) {
    g.treatmentHistory = (g.passes ?? [])
      .flatMap((p) => p.usageLogs ?? [])
      .filter((u) => u.delta < 0);
  }

  const payments: PaymentDto[] = [
    {
      id: 'pay-1',
      studioId: DEFAULT_STUDIO_ID,
      guestId: 'guest-1',
      guestName: 'Kovács Anna',
      guestPassId: 'pass-1',
      passName: '10 Alkalmas Hypoxi Bérlet',
      recordedByUserId: 'staff-default-1',
      recordedByName: 'Recepciós Munkatárs',
      amount: 79000,
      paymentMethod: PaymentMethod.POS_CARD,
      isCancelled: false,
      note: '10 Alkalmas Hypoxi Bérlet értékesítés',
      createdAt: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
      allocations: [
        {
          id: 'alloc-1',
          paymentId: 'pay-1',
          membershipDueId: null,
          passId: 'pass-1',
          passName: '10 Alkalmas Hypoxi Bérlet',
          amountHuf: 79000,
        },
      ],
    },
    {
      id: 'pay-2',
      studioId: DEFAULT_STUDIO_ID,
      guestId: 'guest-3',
      guestName: 'Szabó Eszter',
      guestPassId: null,
      passName: null,
      membershipDueId: 'due-3',
      membershipPeriod: billing3.period,
      recordedByUserId: 'staff-default-1',
      recordedByName: 'Recepciós Munkatárs',
      amount: 10000,
      paymentMethod: PaymentMethod.CASH,
      isCancelled: false,
      note: `Havi tagdíj részbefizetés (${billing3.period})`,
      createdAt: new Date(now.getTime() - 90 * 60 * 1000).toISOString(),
      allocations: [
        {
          id: 'alloc-2',
          paymentId: 'pay-2',
          membershipDueId: 'due-3',
          membershipPeriod: billing3.period,
          passId: null,
          amountHuf: 10000,
        },
      ],
    },
  ];

  // Vendégekhez is bekötjük a fizetéseiket
  for (const g of guests) {
    g.payments = payments.filter((p) => p.guestId === g.id);
  }

  // A minta bérletek korábbi (itt nem részletezett) levonásai is a naplóba kerülnek,
  // mert a hátralévő alkalom a naplóból számolódik.
  for (const g of guests) {
    for (const p of g.passes ?? []) {
      const logs = p.usageLogs ?? [];
      const missing = (p.usedPassesCount ?? 0) - countActiveDeductions(logs);
      const start = new Date(p.startDate).getTime();
      const span = now.getTime() - start;
      for (let i = 0; i < missing; i++) {
        logs.push({
          id: `ulog-${p.id}-seed-${i + 1}`,
          guestPassId: p.id,
          guestId: g.id,
          guestName: `${g.lastName} ${g.firstName}`,
          serviceId: p.serviceId ?? null,
          serviceName: p.serviceName ?? null,
          passName: p.passTemplateName ?? 'Bérlet',
          employeeId: 'staff-default-1',
          employeeName: 'Recepciós Munkatárs',
          delta: -1,
          usedAt: new Date(start + (span * (i + 1)) / (missing + 2)).toISOString(),
          reversedAt: null,
          reversalReason: null,
          note: `Kezelés: ${p.serviceName ?? p.passTemplateName ?? 'korábbi alkalom'}`,
        });
      }
      logs.sort((a, b) => new Date(b.usedAt).getTime() - new Date(a.usedAt).getTime());
      p.usageLogs = logs;
      syncPassState(p, now);
    }
  }

  const checkIns: LoggedCheckInDto[] = [
    {
      id: 'chk-initial-1',
      studioId: DEFAULT_STUDIO_ID,
      guestId: 'guest-1',
      guestName: 'Kovács Anna',
      guestBarcode: '100001',
      guestPassId: null,
      passName: 'Köredzés (Havi Tagság)',
      visitType: VisitType.CIRCUIT_TRAINING,
      serviceName: 'Köredzés',
      userId: 'staff-default-1',
      staffName: 'Recepciós Munkatárs',
      status: CheckInStatus.SUCCESS,
      reason: null,
      visitId: 'vis-1',
      createdAt: new Date(now.getTime() - 45 * 60 * 1000).toISOString(),
    },
  ];

  const visits: VisitDto[] = [
    {
      id: 'vis-1',
      studioId: DEFAULT_STUDIO_ID,
      guestId: 'guest-1',
      guestName: 'Kovács Anna',
      guestBarcode: '100001',
      checkedInAt: new Date(now.getTime() - 45 * 60 * 1000).toISOString(),
      visitType: VisitType.CIRCUIT_TRAINING,
      serviceName: 'Köredzés',
      employeeId: 'staff-default-1',
      employeeName: 'Recepciós Munkatárs',
    },
  ];

  return {
    services,
    templates,
    guests,
    checkIns,
    visits,
    payments,
    auditLogs: [
      {
        id: 'audit-1',
        userId: 'staff-default-1',
        userName: 'Recepciós Munkatárs',
        action: 'SYSTEM_INIT',
        entityType: 'Studio',
        entityId: DEFAULT_STUDIO_ID,
        createdAt: addDays(now, -30),
        details: 'RE-FORM Stúdió recepciós rendszer inicializálva.',
      },
    ],
    devices: [],
  };
}

const PAIRING_CODE_TTL_MS = 10 * 60 * 1000; // 10 perc

function normalizeDisplayDevice(d: Partial<DisplayDeviceDto> & { id: string; name: string }): DisplayDeviceDto {
  const now = Date.now();
  const pairingCode = d.pairingCode ?? null;
  const pairingExpiresAt = d.pairingExpiresAt ?? null;
  let status: DisplayDeviceStatus = 'PAIRED';

  if (pairingCode) {
    const expiresMs = pairingExpiresAt
      ? new Date(pairingExpiresAt).getTime()
      : now + PAIRING_CODE_TTL_MS;
    status = expiresMs <= now ? 'EXPIRED' : 'PENDING_PAIRING';
  }

  return {
    id: d.id,
    name: d.name,
    status,
    pairingCode,
    pairingExpiresAt,
    pairedAt: d.pairedAt ?? (pairingCode ? null : d.createdAt ?? new Date().toISOString()),
    isActive: d.isActive ?? true,
    lastSeenAt: pairingCode ? null : (d.lastSeenAt ?? null),
    lastActivityType: pairingCode ? null : (d.lastActivityType ?? 'Sikeresen párosítva'),
    isOnline: !pairingCode && (d.isActive ?? true),
    createdAt: d.createdAt ?? new Date().toISOString(),
  };
}

class MockStudioEngine {
  /** Változás-értesítés (TICKET-3): a feliratkozók és a változásszámláló (`useSyncExternalStore` pillanatképe). */
  private listeners = new Set<() => void>();
  private version = 0;
  private notifyScheduled = false;

  private readonly handleStorage = (event: StorageEvent) => {
    // Más böngészőfül írta át a demó adatbázist (vagy törölte a teljes localStorage-et).
    if (event.key === STORAGE_KEY || event.key === null) this.emitChange();
  };

  /** Feliratkozás a demó adatbázis változására (ez a fül és a többi fül); a visszatérési érték leiratkozik. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    if (this.listeners.size === 1 && typeof window !== 'undefined') {
      window.addEventListener('storage', this.handleStorage);
    }
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0 && typeof window !== 'undefined') {
        window.removeEventListener('storage', this.handleStorage);
      }
    };
  }

  /** Minden változáskor nő; `useSyncExternalStore` pillanatképnek. */
  getVersion(): number {
    return this.version;
  }

  // Mikrotaszkban értesít: render közbeni olvasás (pl. tagdíj-pótlás mentése) ne frissítsen renderelés közben,
  // és az egy művelet alatti több mentés egy értesítés legyen.
  private emitChange() {
    if (this.notifyScheduled) return;
    this.notifyScheduled = true;
    queueMicrotask(() => {
      this.notifyScheduled = false;
      this.version += 1;
      for (const listener of [...this.listeners]) listener();
    });
  }

  private load(): MockDatabaseState {
    if (typeof window === 'undefined') return createInitialMockDatabase();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        const initial = createInitialMockDatabase();
        this.save(initial);
        return initial;
      }
      const parsed = JSON.parse(raw) as MockDatabaseState;
      // Eltávolítjuk a korábbi verzióból bent maradt fiktív "dev-1" ("Recepciós Pult Másodlagos Monitor") rekordot
      parsed.devices = (parsed.devices ?? [])
        .filter((d) => !(d.id === 'dev-1' && d.name === 'Recepciós Pult Másodlagos Monitor'))
        .map((d) => normalizeDisplayDevice(d));
      // TICKET-42 előtti tárolt állapot: ugyanaz a pótlás, mint a migrációban (a nem a keresztnévből,
      // a köredzés csak nőknek, a tagság a stúdió köredzés szolgáltatásához kötve).
      for (const srv of parsed.services) {
        srv.womenOnly ??=
          srv.category === ServiceCategory.CIRCUIT &&
          srv.name
            .toLocaleLowerCase('hu-HU')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .includes('koredzes');
      }
      const circuitService = pickCircuitMembershipService(parsed.services);
      for (const g of parsed.guests) {
        g.gender ??= inferGenderFromFirstName(g.firstName);
        for (const m of g.memberships ?? []) {
          if (m.serviceId === undefined) {
            m.serviceId = circuitService?.id ?? null;
            m.serviceName = circuitService?.name ?? null;
          }
        }
      }
      // A bérletállapot időfüggő (lejárat, kezdés), ezért olvasáskor is frissül.
      const now = new Date();
      for (const g of parsed.guests) {
        for (const p of g.passes ?? []) syncPassState(p, now);
        syncGuestArrivals(parsed, g);
      }
      return parsed;
    } catch {
      return createInitialMockDatabase();
    }
  }

  private save(state: MockDatabaseState) {
    if (typeof window === 'undefined') return;
    // Szinkronban tartjuk a vendégek treatmentHistory és payments tömbjeit
    const now = new Date();
    for (const g of state.guests) {
      for (const p of g.passes ?? []) syncPassState(p, now);
      g.treatmentHistory = (g.passes ?? [])
        .flatMap((p) =>
          (p.usageLogs ?? []).map((u) => ({
            ...u,
            guestId: g.id,
            guestName: `${g.lastName} ${g.firstName}`,
            passName: p.passTemplateName ?? 'Bérlet',
            remainingAfter: u.remainingAfter ?? p.remainingPasses,
          })),
        )
        .filter((u) => u.delta < 0)
        .sort(
          (a, b) => new Date(b.usedAt).getTime() - new Date(a.usedAt).getTime(),
        );
      g.payments = state.payments.filter((p) => p.guestId === g.id);
      syncGuestArrivals(state, g);
    }
    const raw = JSON.stringify(state);
    // Csak tényleges változásnál értesít, így a render közbeni olvasás nem okoz végtelen frissítést.
    if (localStorage.getItem(STORAGE_KEY) === raw) return;
    localStorage.setItem(STORAGE_KEY, raw);
    this.emitChange();
  }

  getMonitorGreetingSeconds(): number {
    if (typeof window === 'undefined') return DEFAULT_MONITOR_GREETING_SECONDS;
    const raw = Number(localStorage.getItem(MONITOR_CONFIG_KEY));
    if (!Number.isFinite(raw) || raw < 3 || raw > 30) {
      return DEFAULT_MONITOR_GREETING_SECONDS;
    }
    return raw;
  }

  setMonitorGreetingSeconds(seconds: number): number {
    const clamped = Math.max(3, Math.min(30, Math.round(seconds)));
    if (typeof window !== 'undefined') {
      localStorage.setItem(MONITOR_CONFIG_KEY, String(clamped));
    }
    return clamped;
  }

  resetDatabase(): MockDatabaseState {
    const initial = createInitialMockDatabase();
    this.save(initial);
    return initial;
  }

  getServices(includeInactive = false): ServiceDto[] {
    const state = this.load();
    return includeInactive
      ? state.services
      : state.services.filter((s) => s.isActive);
  }

  createService(input: {
    name: string;
    category: ServiceCategory;
    durationMinutes: number;
    priceHuf: number;
    womenOnly?: boolean;
  }): ServiceDto {
    const state = this.load();
    const created: ServiceDto = {
      id: `srv-${Date.now()}`,
      studioId: DEFAULT_STUDIO_ID,
      name: input.name.trim(),
      category: input.category,
      durationMinutes: input.durationMinutes,
      priceHuf: input.priceHuf,
      womenOnly: input.womenOnly ?? false,
      isActive: true,
      createdAt: new Date().toISOString(),
    };
    state.services.push(created);
    this.save(state);
    return created;
  }

  getGuests(query?: string): GuestDto[] {
    const state = this.load();
    const q = query?.trim().toLowerCase();
    if (!q) return state.guests;
    return state.guests.filter(
      (g) =>
        g.barcode.toLowerCase().includes(q) ||
        `${g.lastName} ${g.firstName}`.toLowerCase().includes(q) ||
        `${g.firstName} ${g.lastName}`.toLowerCase().includes(q) ||
        (g.phone && g.phone.toLowerCase().includes(q)) ||
        (g.email && g.email.toLowerCase().includes(q)),
    );
  }

  getGuestById(id: string): GuestDto {
    const state = this.load();
    const guest = state.guests.find((g) => g.id === id);
    if (!guest) throw appError('GUEST.NOT_FOUND');
    if (this.syncMembershipDues(guest, new Date())) this.save(state);
    return guest;
  }

  getGuestPasses(guestId: string): GuestPassDto[] {
    const guest = this.getGuestById(guestId);
    return guest.passes ?? [];
  }

  createGuest(input: {
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
  }): GuestDto {
    const state = this.load();
    const barcode =
      input.barcode && input.barcode.trim().length > 0
        ? input.barcode.trim()
        : `RS${Math.floor(100000 + Math.random() * 900000)}`;

    const collision = state.guests.find((g) => g.barcode === barcode);
    if (collision) {
      throw appError('GUEST.BARCODE_TAKEN', {
        message: `A(z) "${barcode}" vonalkód már foglalt (${collision.lastName} ${collision.firstName}).`,
      });
    }

    const now = new Date().toISOString();
    const newGuest: GuestDto = {
      id: `guest-${Date.now()}`,
      studioId: DEFAULT_STUDIO_ID,
      barcode,
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
      birthDate: input.birthDate || null,
      nameDay: input.nameDay?.trim() || null,
      gender: input.gender,
      status: input.status ?? GuestStatus.ACTIVE,
      notes: input.notes?.trim() || null,
      isActive: true,
      createdAt: now,
      updatedAt: now,
      passes: [],
      memberships: [],
      treatmentHistory: [],
      payments: [],
      measurements: [],
      photos: [],
      documents: [],
      internalNotes: [],
      messageLogs: [],
    };

    state.guests.unshift(newGuest);
    this.save(state);
    return newGuest;
  }

  updateGuest(
    id: string,
    input: Partial<{
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
  ): GuestDto {
    const state = this.load();
    const idx = state.guests.findIndex((g) => g.id === id);
    if (idx === -1) throw appError('GUEST.NOT_FOUND');

    const current = state.guests[idx];
    if (input.barcode && input.barcode.trim() !== current.barcode) {
      const collision = state.guests.find(
        (g) => g.barcode === input.barcode!.trim() && g.id !== id,
      );
      if (collision) {
        throw appError('GUEST.BARCODE_TAKEN', {
          message: `A(z) "${input.barcode.trim()}" vonalkód már foglalt (${collision.lastName} ${collision.firstName}).`,
        });
      }
    }

    const updated: GuestDto = {
      ...current,
      firstName: input.firstName?.trim() ?? current.firstName,
      lastName: input.lastName?.trim() ?? current.lastName,
      barcode: input.barcode?.trim() ?? current.barcode,
      email:
        input.email !== undefined ? input.email.trim() || null : current.email,
      phone:
        input.phone !== undefined ? input.phone.trim() || null : current.phone,
      birthDate:
        input.birthDate !== undefined ? input.birthDate : current.birthDate,
      nameDay:
        input.nameDay !== undefined
          ? input.nameDay?.trim() || null
          : current.nameDay,
      gender: input.gender ?? current.gender,
      status: input.status ?? current.status,
      notes:
        input.notes !== undefined ? input.notes.trim() || null : current.notes,
      updatedAt: new Date().toISOString(),
    };

    state.guests[idx] = updated;
    this.save(state);
    return updated;
  }

  getTemplates(includeInactive = false): PassTemplateDto[] {
    const state = this.load();
    // A csak nőknek szóló jelzés a sablon szolgáltatásáé, mint az API-n.
    return (
      includeInactive
        ? state.templates
        : state.templates.filter((t) => t.isActive)
    ).map((t) => ({
      ...t,
      womenOnly: !!state.services.find((s) => s.id === t.serviceId)?.womenOnly,
    }));
  }

  createTemplate(input: {
    name: string;
    serviceId?: string | null;
    type: PassType;
    totalPasses?: number | null;
    durationDays: number;
    price: number;
  }): PassTemplateDto {
    const state = this.load();
    const service = state.services.find((s) => s.id === input.serviceId);
    const tpl: PassTemplateDto = {
      id: `tpl-${Date.now()}`,
      studioId: DEFAULT_STUDIO_ID,
      serviceId: service?.id ?? null,
      serviceName: service?.name ?? null,
      name: input.name.trim(),
      type: input.type,
      totalPasses:
        input.type === PassType.OCCASION_BASED
          ? (input.totalPasses ?? 1)
          : null,
      durationDays: input.durationDays,
      price: input.price,
      isActive: true,
      createdAt: new Date().toISOString(),
    };
    state.templates.push(tpl);
    this.save(state);
    return tpl;
  }

  updateTemplate(
    id: string,
    input: Partial<{
      name: string;
      price: number;
      durationDays: number;
      isActive: boolean;
    }>,
  ): PassTemplateDto {
    const state = this.load();
    const idx = state.templates.findIndex((t) => t.id === id);
    if (idx === -1) throw appError('PASS.TEMPLATE_NOT_FOUND');
    state.templates[idx] = {
      ...state.templates[idx],
      ...input,
    };
    this.save(state);
    return state.templates[idx];
  }

  sellPass(input: {
    guestId: string;
    passTemplateId: string;
    paymentMethod: PaymentMethod;
    customAmount?: number;
    note?: string;
  }) {
    const state = this.load();
    const guest = state.guests.find((g) => g.id === input.guestId);
    if (!guest) {
      throw appError('GUEST.NOT_FOUND', {
        message: 'A kiválasztott vendég nem található.',
      });
    }

    const template = state.templates.find((t) => t.id === input.passTemplateId);
    if (!template) {
      throw appError('PASS.TEMPLATE_NOT_FOUND', {
        message: 'A kiválasztott bérletsablon nem található.',
      });
    }
    // Csak nőknek szóló bérlet férfi vendégnek nem adható el (TICKET-42, mint az API-n).
    const templateService = state.services.find(
      (s) => s.id === template.serviceId,
    );
    if (womenOnlyAccess(guest.gender, templateService?.womenOnly) === 'DENIED') {
      throw appError('PASS.WOMEN_ONLY');
    }

    const now = new Date();
    const exp = new Date(
      now.getTime() + template.durationDays * 24 * 60 * 60 * 1000,
    );
    const amount =
      input.customAmount !== undefined ? input.customAmount : template.price;
    const passId = `pass-${Date.now()}`;

    const newPass: GuestPassDto = {
      id: passId,
      studioId: DEFAULT_STUDIO_ID,
      guestId: guest.id,
      passTemplateId: template.id,
      passTemplateName: template.name,
      serviceId: template.serviceId ?? null,
      serviceName: template.serviceName ?? null,
      type: template.type,
      totalPasses: template.totalPasses,
      remainingPasses: template.totalPasses,
      calculatedRemainingPasses: template.totalPasses,
      usedPassesCount: 0,
      startDate: now.toISOString(),
      expirationDate: exp.toISOString(),
      isActive: true,
      isFrozen: false,
      frozenAt: null,
      status: PassStatus.ACTIVE, // syncPassState számolja
      createdAt: now.toISOString(),
      usageLogs: [
        {
          id: `ulog-${Date.now()}`,
          guestPassId: passId,
          guestId: guest.id,
          guestName: `${guest.lastName} ${guest.firstName}`,
          serviceId: template.serviceId ?? null,
          serviceName: template.serviceName ?? null,
          passName: template.name,
          employeeId: 'staff-default-1',
          employeeName: 'Recepciós Munkatárs',
          delta: template.totalPasses ?? 0,
          usedAt: now.toISOString(),
          note: `Bérlet vásárlás: ${template.name}`,
        },
      ],
    };

    guest.passes = [newPass, ...(guest.passes ?? [])];

    const payId = `pay-${Date.now()}`;
    const payment: PaymentDto = {
      id: payId,
      studioId: DEFAULT_STUDIO_ID,
      guestId: guest.id,
      guestName: `${guest.lastName} ${guest.firstName}`,
      guestPassId: newPass.id,
      passName: template.name,
      recordedByUserId: 'staff-default-1',
      recordedByName: 'Recepciós Munkatárs',
      amount,
      paymentMethod: input.paymentMethod,
      isCancelled: false,
      note: input.note?.trim() || `${template.name} értékesítés`,
      createdAt: now.toISOString(),
      allocations: [
        {
          id: `alloc-${Date.now()}`,
          paymentId: payId,
          membershipDueId: null,
          passId: newPass.id,
          passName: template.name,
          amountHuf: amount,
        },
      ],
    };

    state.payments.unshift(payment);
    this.save(state);

    return {
      pass: newPass,
      paymentId: payment.id,
      amount,
    };
  }

  /**
   * 2.4 Alkalmas kezelés: Recepciós kézzel kiválasztja a kezelést és a megfelelő aktív bérletet.
   */
  deductPassUsage(input: DeductPassUsageRequestDto): CheckInResultPayload {
    const state = this.load();
    const now = new Date();
    const guest = state.guests.find((g) => g.id === input.guestId);
    if (!guest) throw appError('GUEST.NOT_FOUND');

    const pass = (guest.passes ?? []).find((p) => p.id === input.passId);
    if (!pass) {
      throw appError('PASS.NOT_FOUND', {
        message: 'A kiválasztott bérlet nem található.',
      });
    }

    const service = state.services.find((s) => s.id === input.serviceId);
    if (!service) {
      throw appError('COMMON.NOT_FOUND', {
        message: 'A kiválasztott kezelés nem található.',
      });
    }
    const serviceName = service.name;

    // Szolgáltatáshoz kötött bérletről csak az adott kezelés vonható le (mint az API-n).
    if (!passCoversService(pass.serviceId, service.id)) {
      throw appError('PASS.SERVICE_MISMATCH');
    }

    // Csak nőknek szóló kezelés vagy bérlet: férfi vendég nem léptethető be vele (TICKET-42).
    const womenOnly = womenOnlyAccess(
      guest.gender,
      service.womenOnly ||
        !!state.services.find((s) => s.id === pass.serviceId)?.womenOnly,
    );
    if (womenOnly === 'DENIED') throw appError('CHECKIN.WOMEN_ONLY');

    const deductionError = passDeductionError(syncPassState(pass, now).status);
    if (deductionError) throw appError(deductionError);

    const guestName = `${guest.lastName} ${guest.firstName}`;
    const visitId = `vis-${Date.now()}`;
    const checkInLog: LoggedCheckInDto = {
      id: `chk-${Date.now()}`,
      studioId: DEFAULT_STUDIO_ID,
      guestId: guest.id,
      guestName,
      guestBarcode: guest.barcode,
      guestPassId: pass.id,
      passName: `${serviceName} (${pass.passTemplateName})`,
      visitType: VisitType.TREATMENT,
      serviceName,
      userId: 'staff-default-1',
      staffName: 'Recepciós Munkatárs',
      status: CheckInStatus.SUCCESS,
      reason: `Kezelés: ${serviceName}`,
      visitId,
      createdAt: now.toISOString(),
    };

    const usageId = `ulog-${Date.now()}`;
    pass.usageLogs = [
      {
        id: usageId,
        guestPassId: pass.id,
        guestId: guest.id,
        guestName,
        serviceId: service.id,
        serviceName,
        passName: pass.passTemplateName ?? 'Bérlet',
        employeeId: 'staff-default-1',
        employeeName: 'Recepciós Munkatárs',
        delta: -1,
        usedAt: now.toISOString(),
        reversedAt: null,
        reversalReason: null,
        checkInId: checkInLog.id,
        note: input.note?.trim() || `Kezelés: ${serviceName}`,
      },
      ...(pass.usageLogs ?? []),
    ];
    syncPassState(pass, now);
    const newRemaining: number | 'Korlátlan' =
      pass.type === PassType.OCCASION_BASED
        ? (pass.remainingPasses ?? 0)
        : 'Korlátlan';
    pass.usageLogs[0].remainingAfter = pass.remainingPasses;

    state.checkIns.unshift(checkInLog);
    state.visits.unshift({
      id: visitId,
      studioId: DEFAULT_STUDIO_ID,
      guestId: guest.id,
      guestName,
      guestBarcode: guest.barcode,
      checkedInAt: now.toISOString(),
      visitType: VisitType.TREATMENT,
      serviceName,
      employeeId: 'staff-default-1',
      employeeName: 'Recepciós Munkatárs',
    });

    for (const dev of state.devices) {
      if (!dev.pairingCode && dev.isActive) {
        dev.lastSeenAt = now.toISOString();
        dev.lastActivityType = `Beléptetés megjelenítve (${guest.lastName} ${guest.firstName})`;
      }
    }

    this.save(state);

    const warnings: CheckInWarningCode[] = [];
    if (womenOnly === 'GENDER_MISSING') warnings.push('GENDER_MISSING');
    if (pass.type === PassType.OCCASION_BASED && typeof newRemaining === 'number') {
      if (newRemaining === 0) {
        warnings.push('DEPLETED_PASS');
        warnings.push('LAST_OCCASION');
      } else if (newRemaining === 1) {
        warnings.push('LAST_OCCASION');
      } else if (newRemaining === 2) {
        warnings.push('LOW_OCCASIONS');
      }
    }
    const daysLeft = Math.ceil(
      (new Date(pass.expirationDate).getTime() - now.getTime()) /
        (24 * 60 * 60 * 1000),
    );
    if (daysLeft <= EXPIRING_SOON_THRESHOLD_DAYS) {
      warnings.push('EXPIRING_SOON');
    }

    const payload: CheckInResultPayload = {
      checkInId: checkInLog.id,
      usageId,
      mode: 'TREATMENT_GREETING',
      status: CheckInStatus.SUCCESS,
      guestId: guest.id,
      barcode: guest.barcode,
      guestName: `${guest.lastName} ${guest.firstName}`,
      serviceName,
      // A monitor a kezelés kategóriájához illő szöveggel köszön (TICKET-43, mint az API-n).
      ...greetingFields(service),
      passName: pass.passTemplateName,
      passType: pass.type,
      remainingPasses: newRemaining,
      totalPasses: pass.totalPasses,
      expirationDate: pass.expirationDate,
      warnings,
      suggestedRenewalTemplateId: pass.passTemplateId,
      isBirthday: isBirthdayToday(guest.birthDate, now),
      timestamp: now.toISOString(),
    };

    broadcastToLocalMonitors({ type: 'CHECKIN_RESULT', payload });
    return payload;
  }

  /**
   * Téves levonás visszavonása: csak `delta < 0`, egyszer. A kapcsolt beléptetés is sztornózódik
   * és a látogatás törlődik, így a beléptetés-sztornó már nem ír jóvá még egyszer.
   */
  reversePassUsage(
    usageId: string,
    reversalReason: string,
  ): CheckInRevokedPayload {
    const state = this.load();
    const now = new Date();

    for (const guest of state.guests) {
      for (const pass of guest.passes ?? []) {
        const usage = (pass.usageLogs ?? []).find((u) => u.id === usageId);
        if (!usage) continue;
        if (usage.reversedAt) throw appError('PASS.USAGE_ALREADY_REVERSED');
        if (usage.delta >= 0) throw appError('PASS.USAGE_NOT_REVERSIBLE');

        const reason = reversalReason.trim();
        const restoredRemaining = reverseDeduction(pass, usage, reason, now);
        const checkIn = usage.checkInId
          ? state.checkIns.find((c) => c.id === usage.checkInId)
          : undefined;
        const checkInVoided = checkIn
          ? voidArrival(state, checkIn, `Levonás visszavonva: ${reason}`)
          : false;

        const guestName = `${guest.lastName} ${guest.firstName}`;
        logCorrection(
          state,
          {
            action: 'PASS_USAGE_REVERSED',
            entityType: 'PassUsageLog',
            entityId: usage.id,
            details: `Alkalomlevonás visszavonva (${guestName})${checkInVoided ? ', a beléptetés sztornózva' : ''}: ${reason}`,
          },
          now,
        );
        this.save(state);

        const revokedPayload: CheckInRevokedPayload = {
          checkInId: usage.checkInId ?? usage.id,
          guestId: guest.id,
          guestName,
          serviceName: usage.serviceName ?? pass.passTemplateName,
          restoredRemainingPasses: restoredRemaining,
          timestamp: now.toISOString(),
        };

        broadcastToLocalMonitors({
          type: 'CHECKIN_REVOKED',
          payload: revokedPayload,
        });
        return revokedPayload;
      }
    }

    throw appError('PASS.USAGE_NOT_FOUND');
  }

  extendPass(passId: string, additionalDays: number, note: string): GuestPassDto {
    const state = this.load();
    for (const guest of state.guests) {
      const pass = (guest.passes ?? []).find((p) => p.id === passId);
      if (pass) {
        const base =
          new Date(pass.expirationDate).getTime() > Date.now()
            ? new Date(pass.expirationDate)
            : new Date();
        pass.expirationDate = new Date(
          base.getTime() + additionalDays * 24 * 60 * 60 * 1000,
        ).toISOString();
        pass.usageLogs = [
          {
            id: `ulog-${Date.now()}`,
            guestPassId: pass.id,
            guestId: guest.id,
            guestName: `${guest.lastName} ${guest.firstName}`,
            delta: 0,
            usedAt: new Date().toISOString(),
            note: `Hosszabbítás (+${additionalDays} nap): ${note}`,
          },
          ...(pass.usageLogs ?? []),
        ];
        this.save(state);
        return pass;
      }
    }
    throw appError('PASS.NOT_FOUND');
  }

  toggleFreezePass(passId: string, note?: string): GuestPassDto {
    const state = this.load();
    const now = new Date();
    for (const guest of state.guests) {
      const pass = (guest.passes ?? []).find((p) => p.id === passId);
      if (pass) {
        if (!pass.isFrozen) {
          // Csak érvényes bérlet fagyasztható (az API-val azonos szabály); a feloldás mindig mehet.
          if (!isPassFreezable(syncPassState(pass, now).status)) {
            throw appError('PASS.NOT_FREEZABLE');
          }
          pass.isFrozen = true;
          pass.frozenAt = now.toISOString();
          pass.usageLogs = [
            {
              id: `ulog-${Date.now()}`,
              guestPassId: pass.id,
              guestId: guest.id,
              guestName: `${guest.lastName} ${guest.firstName}`,
              employeeId: 'staff-default-1',
              employeeName: 'Recepciós Munkatárs',
              delta: 0,
              usedAt: now.toISOString(),
              note: `Bérlet fagyasztva${note ? `: ${note}` : ''}`,
            },
            ...(pass.usageLogs ?? []),
          ];
        } else {
          const frozenDays = frozenDaysBetween(pass.frozenAt ?? now, now);
          pass.isFrozen = false;
          pass.frozenAt = null;
          pass.expirationDate = new Date(
            new Date(pass.expirationDate).getTime() +
              frozenDays * 24 * 60 * 60 * 1000,
          ).toISOString();
          pass.usageLogs = [
            {
              id: `ulog-${Date.now()}`,
              guestPassId: pass.id,
              guestId: guest.id,
              guestName: `${guest.lastName} ${guest.firstName}`,
              employeeId: 'staff-default-1',
              employeeName: 'Recepciós Munkatárs',
              delta: 0,
              usedAt: now.toISOString(),
              note: `Fagyasztás feloldva (+${frozenDays} nap jóváírva a lejáratra)`,
            },
            ...(pass.usageLogs ?? []),
          ];
        }
        syncPassState(pass, now);
        this.save(state);
        return pass;
      }
    }
    throw appError('PASS.NOT_FOUND');
  }

  /**
   * 2.3 Vonalkódos beléptetés (10 mp dupla leolvasás védelemmel), az API `processBarcodeCheckIn`
   * párja: a döntés a közös `resolveArrivalEntitlement`, a beolvasás soha nem von le alkalmat.
   */
  scanCheckIn(input: {
    barcode: string;
    visitType?: VisitType;
    serviceId?: string;
    forceDuplicate?: boolean;
  }): CheckInResultPayload {
    const state = this.load();
    const barcode = input.barcode.trim();
    const now = new Date();

    const guest = state.guests.find(
      (g) => g.barcode.toLowerCase() === barcode.toLowerCase() && g.isActive,
    );

    if (!guest) {
      throw appError('CHECKIN.GUEST_NOT_FOUND', {
        message: `Nem található aktív vendég a(z) "${barcode}" vonalkóddal.`,
      });
    }

    const guestFullName = `${guest.lastName} ${guest.firstName}`;

    // 10 másodperces dupla leolvasás védelem
    if (!input.forceDuplicate) {
      const cooldownSince =
        now.getTime() - DUPLICATE_SCAN_COOLDOWN_SECONDS * 1000;
      const recent = state.checkIns.find(
        (c) =>
          c.guestId === guest.id &&
          c.status === CheckInStatus.SUCCESS &&
          new Date(c.createdAt).getTime() >= cooldownSince,
      );

      if (recent) {
        const activePass = (guest.passes ?? []).find(
          (p) => p.id === recent.guestPassId,
        );
        // A korábbi belépés szövege és kategóriája, nem égetett köredzés (TICKET-43, mint az
        // API-n): kezelésnél a levonás szolgáltatása, köredzésnél a bérleté, bérlet nélkül a tagságé.
        const isCircuit = recent.visitType !== VisitType.TREATMENT;
        const usage = (guest.passes ?? [])
          .flatMap((p) => p.usageLogs ?? [])
          .find((u) => u.checkInId === recent.id);
        const memberships = guest.memberships ?? [];
        const membership =
          memberships.find((m) => m.status === MembershipStatus.ACTIVE) ??
          memberships[0];
        const priorServiceId =
          usage?.serviceId ??
          activePass?.serviceId ??
          (isCircuit && !activePass ? membership?.serviceId : null);
        const priorService = priorServiceId
          ? state.services.find((s) => s.id === priorServiceId)
          : undefined;
        const dupPayload: CheckInResultPayload = {
          checkInId: recent.id,
          mode: isCircuit ? 'CIRCUIT_GREETING' : 'TREATMENT_GREETING',
          status: CheckInStatus.DUPLICATE_SCAN,
          guestId: guest.id,
          barcode: guest.barcode,
          guestName: guestFullName,
          serviceName:
            priorService?.name ?? (isCircuit ? 'Köredzés' : undefined),
          ...greetingFields(
            priorService,
            isCircuit ? ServiceCategory.CIRCUIT : null,
          ),
          passName: activePass?.passTemplateName ?? recent.passName ?? undefined,
          passType: activePass?.type,
          remainingPasses:
            activePass?.type === PassType.TIME_BASED || !activePass
              ? 'Korlátlan'
              : (activePass?.remainingPasses ?? 0),
          totalPasses: activePass?.totalPasses ?? null,
          expirationDate: activePass?.expirationDate ?? null,
          reason: `${guestFullName} már beléptetve az elmúlt ${DUPLICATE_SCAN_COOLDOWN_SECONDS} másodpercben (nem történt újabb levonás).`,
          warnings: [],
          suggestedRenewalTemplateId: activePass?.passTemplateId ?? null,
          timestamp: now.toISOString(),
        };
        broadcastToLocalMonitors({ type: 'CHECKIN_RESULT', payload: dupPayload });
        return dupPayload;
      }
    }

    // Havi tagság és tartozás ellenőrzése a recepciós részére
    const activeMembership = (guest.memberships ?? []).find(
      (m) => m.status === MembershipStatus.ACTIVE,
    );
    const pausedMembership = (guest.memberships ?? []).find(
      (m) => m.status === MembershipStatus.PAUSED,
    );

    let overdueAmountHuf = 0;
    let maxOverdueDays = 0;
    for (const m of guest.memberships ?? []) {
      for (const d of m.dues ?? []) {
        if (
          d.status === MembershipDueStatus.PAID ||
          d.status === MembershipDueStatus.WAIVED
        ) {
          continue;
        }
        const rem = Math.max(0, d.amountHuf - d.paidAmountHuf);
        if (rem > 0 && new Date(d.dueDate) < now) {
          overdueAmountHuf += rem;
          const days = Math.ceil(
            (now.getTime() - new Date(d.dueDate).getTime()) /
              (24 * 60 * 60 * 1000),
          );
          if (days > maxOverdueDays) maxOverdueDays = days;
        }
      }
    }

    const warnings: CheckInWarningCode[] = [];
    if (overdueAmountHuf > 0) warnings.push('OVERDUE_DUES');
    if (pausedMembership && !activeMembership)
      warnings.push('MEMBERSHIP_PAUSED');

    const passes = guest.passes ?? [];
    const serviceOf = (id: string | null | undefined) =>
      state.services.find((s) => s.id === id);
    // Csak nőknek szóló tagság / bérlet: férfi vendéggel nem számít (TICKET-42, mint az API-n).
    const entitlement = resolveArrivalEntitlement(
      {
        guestGender: guest.gender,
        memberships: (guest.memberships ?? []).map((m) => ({
          ...m,
          womenOnly: serviceOf(m.serviceId)?.womenOnly ?? false,
        })),
        passes: passes.map((p) => ({
          ...p,
          serviceCategory: serviceOf(p.serviceId)?.category ?? null,
          womenOnly: serviceOf(p.serviceId)?.womenOnly ?? false,
        })),
      },
      now,
    );
    const used =
      entitlement.kind === 'CIRCUIT_MEMBERSHIP'
        ? entitlement.membership
        : entitlement.kind === 'CIRCUIT_PASS'
          ? entitlement.pass
          : null;
    if (
      used &&
      womenOnlyAccess(guest.gender, used.womenOnly) === 'GENDER_MISSING'
    ) {
      warnings.push('GENDER_MISSING');
    }
    const overdue = {
      overdueAmountHuf: overdueAmountHuf > 0 ? overdueAmountHuf : undefined,
      overdueDays: maxOverdueDays > 0 ? maxOverdueDays : undefined,
    };

    // Köredzéses érkezés (aktív havi tagság vagy köredzésre érvényes időalapú bérlet) -> NINCS alkalomlevonás!
    if (
      entitlement.kind === 'CIRCUIT_MEMBERSHIP' ||
      entitlement.kind === 'CIRCUIT_PASS'
    ) {
      const membership =
        entitlement.kind === 'CIRCUIT_MEMBERSHIP'
          ? entitlement.membership
          : undefined;
      const circuitPass =
        entitlement.kind === 'CIRCUIT_PASS' ? entitlement.pass : undefined;
      // A tagság vagy a bérlet valódi szolgáltatása (TICKET-43); nélküle köredzés.
      const arrivalService = serviceOf(
        membership ? membership.serviceId : circuitPass?.serviceId,
      );
      if (
        circuitPass &&
        Math.ceil(
          (new Date(circuitPass.expirationDate).getTime() - now.getTime()) /
            (24 * 60 * 60 * 1000),
        ) <= EXPIRING_SOON_THRESHOLD_DAYS
      ) {
        warnings.push('EXPIRING_SOON');
      }

      const visitId = `vis-${Date.now()}`;
      const checkInLog: LoggedCheckInDto = {
        id: `chk-${Date.now()}`,
        studioId: DEFAULT_STUDIO_ID,
        guestId: guest.id,
        guestName: guestFullName,
        guestBarcode: guest.barcode,
        guestPassId: circuitPass?.id ?? null,
        passName: membership
          ? `Havi Köredzés Tagság (${membership.monthlyFeeHuf.toLocaleString('hu-HU')} Ft/hó)`
          : (circuitPass?.passTemplateName ?? 'Köredzés'),
        visitType: VisitType.CIRCUIT_TRAINING,
        serviceName: 'Köredzés',
        userId: 'staff-default-1',
        staffName: 'Recepciós Munkatárs',
        status: CheckInStatus.SUCCESS,
        reason: null,
        visitId,
        createdAt: now.toISOString(),
      };

      state.checkIns.unshift(checkInLog);
      state.visits.unshift({
        id: visitId,
        studioId: DEFAULT_STUDIO_ID,
        guestId: guest.id,
        guestName: guestFullName,
        guestBarcode: guest.barcode,
        checkedInAt: now.toISOString(),
        visitType: VisitType.CIRCUIT_TRAINING,
        serviceName: 'Köredzés',
        employeeId: 'staff-default-1',
        employeeName: 'Recepciós Munkatárs',
      });
      for (const dev of state.devices) {
        if (!dev.pairingCode && dev.isActive) {
          dev.lastSeenAt = now.toISOString();
          dev.lastActivityType = `Beléptetés megjelenítve (${guestFullName})`;
        }
      }
      this.save(state);

      const circuitPayload: CheckInResultPayload = {
        checkInId: checkInLog.id,
        mode: 'CIRCUIT_GREETING',
        status: CheckInStatus.SUCCESS,
        guestId: guest.id,
        barcode: guest.barcode,
        guestName: guestFullName,
        serviceName: arrivalService?.name ?? 'Köredzés',
        ...greetingFields(arrivalService, ServiceCategory.CIRCUIT),
        passName: checkInLog.passName ?? 'Köredzés',
        passType: circuitPass?.type,
        remainingPasses: 'Korlátlan',
        totalPasses: circuitPass?.totalPasses,
        expirationDate: circuitPass?.expirationDate ?? null,
        warnings,
        ...overdue,
        suggestedRenewalTemplateId: circuitPass?.passTemplateId ?? 'tpl-unlimited',
        isBirthday: isBirthdayToday(guest.birthDate, now),
        timestamp: now.toISOString(),
      };

      broadcastToLocalMonitors({
        type: 'CHECKIN_RESULT',
        payload: circuitPayload,
      });
      return circuitPayload;
    }

    // Csak kezelésre szóló bérlet (TICKET-39, mint az API-n): nincs belépés és monitor-esemény,
    // a recepción a kezelésválasztó nyílik meg; a levonás a `deductPassUsage`-dzsel történik.
    if (entitlement.kind === 'TREATMENT_SELECTION') {
      return {
        status: CheckInStatus.TREATMENT_SELECTION_REQUIRED,
        guestId: guest.id,
        barcode: guest.barcode,
        guestName: guestFullName,
        reason:
          'Alkalmas bérlet: a belépés a kezelés kiválasztásával és az alkalom levonásával rögzül.',
        warnings,
        ...overdue,
        treatmentOptions: entitlement.passes.map((p) => ({
          passId: p.id,
          passName: p.passTemplateName ?? 'Bérlet',
          passType: p.type,
          serviceId: p.serviceId ?? null,
          serviceName:
            p.serviceName ??
            state.services.find((s) => s.id === p.serviceId)?.name ??
            null,
          remainingPasses:
            p.type === PassType.TIME_BASED
              ? ('Korlátlan' as const)
              : (p.remainingPasses ?? 0),
          expirationDate: p.expirationDate,
        })),
        timestamp: now.toISOString(),
      };
    }

    const reason = ARRIVAL_DENIED_MESSAGES[entitlement.reason];
    const lastPass = passes[0];

    const deniedLog: LoggedCheckInDto = {
      id: `chk-${Date.now()}`,
      studioId: DEFAULT_STUDIO_ID,
      guestId: guest.id,
      guestName: guestFullName,
      guestBarcode: guest.barcode,
      guestPassId: lastPass?.id ?? null,
      passName: lastPass?.passTemplateName ?? null,
      userId: 'staff-default-1',
      staffName: 'Recepciós Munkatárs',
      status: CheckInStatus.DENIED,
      reason,
      createdAt: now.toISOString(),
    };

    state.checkIns.unshift(deniedLog);
    this.save(state);

    const deniedPayload: CheckInResultPayload = {
      checkInId: deniedLog.id,
      mode: 'CIRCUIT_GREETING',
      status: CheckInStatus.DENIED,
      guestId: guest.id,
      barcode: guest.barcode,
      guestName: guestFullName,
      reason,
      warnings,
      ...overdue,
      suggestedRenewalTemplateId: lastPass?.passTemplateId ?? 'tpl-10',
      timestamp: now.toISOString(),
    };

    broadcastToLocalMonitors({
      type: 'CHECKIN_RESULT',
      payload: deniedPayload,
    });
    return deniedPayload;
  }

  /**
   * Téves beléptetés sztornója: a kapcsolt levonás visszavonása (egyszer), a látogatás törlése,
   * naplózva — az API `revokeCheckIn` párja.
   */
  revokeCheckIn(checkInId: string, reason?: string): CheckInRevokedPayload {
    const state = this.load();
    const now = new Date();
    const checkIn = state.checkIns.find((c) => c.id === checkInId);
    if (!checkIn) throw appError('CHECKIN.NOT_FOUND');

    const why = reason?.trim() || 'Téves beléptetés';
    if (!voidArrival(state, checkIn, `Recepciós sztornó: ${why}`)) {
      throw appError('CHECKIN.NOT_REVOCABLE');
    }

    const guest = state.guests.find((g) => g.id === checkIn.guestId);
    const checkInPass = (guest?.passes ?? []).find(
      (p) => p.id === checkIn.guestPassId,
    );
    let restoredRemaining: number | 'Korlátlan' =
      checkInPass?.type === PassType.OCCASION_BASED
        ? (checkInPass.remainingPasses ?? 0)
        : 'Korlátlan';

    const usage = (checkInPass?.usageLogs ?? []).find(
      (u) => u.checkInId === checkIn.id && u.delta < 0 && !u.reversedAt,
    );
    const reversesDeduction = !!usage;
    if (checkInPass && usage) {
      restoredRemaining = reverseDeduction(
        checkInPass,
        usage,
        `Beléptetés sztornó: ${why}`,
        now,
      );
    }

    logCorrection(
      state,
      {
        action: 'CHECKIN_REVOKED',
        entityType: 'LoggedCheckIn',
        entityId: checkIn.id,
        details: `Beléptetés sztornózva (${checkIn.guestName})${reversesDeduction ? ', a levonás visszavonva' : ''}: ${why}`,
      },
      now,
    );

    for (const dev of state.devices) {
      if (!dev.pairingCode && dev.isActive) {
        dev.lastSeenAt = now.toISOString();
        dev.lastActivityType = `Sztornó megjelenítve (${checkIn.guestName})`;
      }
    }
    this.save(state);

    const revokedPayload: CheckInRevokedPayload = {
      checkInId: checkIn.id,
      guestId: checkIn.guestId,
      guestName: checkIn.guestName,
      restoredRemainingPasses: restoredRemaining,
      timestamp: now.toISOString(),
    };

    broadcastToLocalMonitors({
      type: 'CHECKIN_REVOKED',
      payload: revokedPayload,
    });
    return revokedPayload;
  }

  getTodayCheckIns(): LoggedCheckInDto[] {
    const state = this.load();
    return state.checkIns;
  }

  recordPayment(input: RecordPaymentRequestDto): PaymentDto {
    const state = this.load();
    const guest = state.guests.find((g) => g.id === input.guestId);
    if (!guest) throw appError('GUEST.NOT_FOUND');
    if (input.amountHuf <= 0)
      throw appError('PAYMENT.AMOUNT_NOT_POSITIVE', {
        message: 'Az összegnek pozitívnak kell lennie.',
      });

    const now = new Date();
    let membershipPeriod: string | null = null;
    let passName: string | null = null;
    let noteText = input.note?.trim() || 'Befizetés';

    if (input.membershipDueId) {
      for (const m of guest.memberships ?? []) {
        const due = (m.dues ?? []).find((d) => d.id === input.membershipDueId);
        if (due) {
          due.paidAmountHuf += Math.round(input.amountHuf);
          due.remainingHuf = Math.max(0, due.amountHuf - due.paidAmountHuf);
          due.status =
            due.remainingHuf <= 0
              ? MembershipDueStatus.PAID
              : MembershipDueStatus.PARTIAL;
          if (due.remainingHuf <= 0) {
            due.overdueDays = 0;
            due.overdueBucket = OverdueBucket.NONE;
          }
          membershipPeriod = due.period;
          if (!input.note) {
            noteText = `Havi tagdíj befizetés (${due.period})${due.status === MembershipDueStatus.PARTIAL ? ' [Részbefizetés]' : ''}`;
          }
        }
      }
    }

    if (input.passId) {
      const p = (guest.passes ?? []).find((x) => x.id === input.passId);
      passName = p?.passTemplateName ?? 'Bérlet';
    }

    const payId = `pay-${Date.now()}`;
    const payment: PaymentDto = {
      id: payId,
      studioId: DEFAULT_STUDIO_ID,
      guestId: guest.id,
      guestName: `${guest.lastName} ${guest.firstName}`,
      guestPassId: input.passId ?? null,
      passName,
      membershipDueId: input.membershipDueId ?? null,
      membershipPeriod,
      recordedByUserId: 'staff-default-1',
      recordedByName: 'Recepciós Munkatárs',
      amount: Math.round(input.amountHuf),
      paymentMethod: input.paymentMethod,
      isCancelled: false,
      note: noteText,
      createdAt: now.toISOString(),
      allocations:
        input.membershipDueId || input.passId
          ? [
              {
                id: `alloc-${Date.now()}`,
                paymentId: payId,
                membershipDueId: input.membershipDueId ?? null,
                membershipPeriod,
                passId: input.passId ?? null,
                passName,
                amountHuf: Math.round(input.amountHuf),
              },
            ]
          : [],
    };

    state.payments.unshift(payment);
    this.save(state);
    return payment;
  }

  createMembership(input: {
    guestId: string;
    serviceId?: string;
    monthlyFeeHuf: number;
    startDate?: string;
    dueDay?: number;
  }): MembershipDto {
    const state = this.load();
    const guest = state.guests.find((g) => g.id === input.guestId);
    if (!guest) throw appError('GUEST.NOT_FOUND');

    // A havi tagság a köredzés szolgáltatáshoz kötődik (TICKET-42, mint az API-n).
    const service = input.serviceId
      ? state.services.find((s) => s.id === input.serviceId)
      : pickCircuitMembershipService(state.services);
    if (input.serviceId && !service) {
      throw appError('COMMON.NOT_FOUND', {
        message: 'A tagsághoz kiválasztott szolgáltatás nem található.',
      });
    }
    if (womenOnlyAccess(guest.gender, service?.womenOnly) === 'DENIED') {
      throw appError('PASS.WOMEN_ONLY', {
        message:
          'A köredzés tagság csak nőknek szól, férfi vendégnek nem adható el.',
      });
    }

    const now = new Date();
    const start = input.startDate ? new Date(input.startDate) : now;

    const membership: MembershipDto = {
      id: `mem-${Date.now()}`,
      studioId: DEFAULT_STUDIO_ID,
      guestId: guest.id,
      guestName: `${guest.lastName} ${guest.firstName}`,
      serviceId: service?.id ?? null,
      serviceName: service?.name ?? null,
      monthlyFeeHuf: input.monthlyFeeHuf,
      startDate: start.toISOString(),
      dueDay: input.dueDay ?? 10,
      status: MembershipStatus.ACTIVE,
      pausedAt: null,
      terminatedAt: null,
      resumedAt: null,
      createdAt: now.toISOString(),
      dues: [],
    };

    guest.memberships = [membership, ...(guest.memberships ?? [])];
    this.syncMembershipDues(guest, now);
    this.save(state);
    return membership;
  }

  updateMembershipStatus(
    membershipId: string,
    input: { status: MembershipStatus; monthlyFeeHuf?: number; dueDay?: number },
  ): MembershipDto {
    const state = this.load();
    const now = new Date();
    for (const g of state.guests) {
      const m = (g.memberships ?? []).find((x) => x.id === membershipId);
      if (m) {
        // Mint az API-ban: előbb a váltás előtti állapot szerinti pótlás.
        this.syncMembershipDues(g, now);

        const billingStops = stopsBilling(m.status, input.status);
        const stamps = getMembershipStatusTimestamps(m, input.status, now);
        m.status = input.status;
        if (input.monthlyFeeHuf !== undefined)
          m.monthlyFeeHuf = input.monthlyFeeHuf;
        if (input.dueDay !== undefined) m.dueDay = input.dueDay;
        m.pausedAt = stamps.pausedAt?.toISOString() ?? null;
        m.terminatedAt = stamps.terminatedAt?.toISOString() ?? null;
        if (stamps.resumedAt) m.resumedAt = stamps.resumedAt.toISOString();

        if (billingStops) {
          const allocatedDueIds = new Set(
            state.payments.flatMap((p) => [
              ...(p.membershipDueId ? [p.membershipDueId] : []),
              ...(p.allocations ?? []).flatMap((a) =>
                a.membershipDueId ? [a.membershipDueId] : [],
              ),
            ]),
          );
          m.dues = (m.dues ?? []).filter(
            (d) => allocatedDueIds.has(d.id) || !isDueRemovableOnStop(d, now),
          );
        }
        this.save(state);
        return m;
      }
    }
    throw appError('MEMBERSHIP.NOT_FOUND');
  }

  /**
   * Hiányzó havi esedékességek pótlása és a késés frissítése egy vendég
   * tagságain (az API `ensureDuesForGuest` párja).
   * @returns igaz, ha új esedékesség jött létre (mentés kell)
   */
  private syncMembershipDues(guest: GuestDto, now: Date): boolean {
    const guestName = `${guest.lastName} ${guest.firstName}`;
    let added = false;
    for (const m of guest.memberships ?? []) {
      const dues = m.dues ?? [];
      const missing = getMissingDues(
        m,
        dues.map((d) => d.period),
        now,
      );
      for (const { period, dueDate } of missing) {
        added = true;
        dues.push({
          id: `due-${m.id}-${period}`,
          membershipId: m.id,
          guestId: guest.id,
          guestName,
          period,
          dueDate: dueDate.toISOString(),
          amountHuf: m.monthlyFeeHuf,
          paidAmountHuf: 0,
          remainingHuf: m.monthlyFeeHuf,
          status: MembershipDueStatus.PENDING,
          overdueDays: 0,
          overdueBucket: OverdueBucket.NONE,
          createdAt: now.toISOString(),
        });
      }
      for (const d of dues) {
        d.remainingHuf = Math.max(0, d.amountHuf - d.paidAmountHuf);
        d.overdueDays =
          d.remainingHuf > 0 ? getOverdueDays(d.dueDate, now) : 0;
        d.overdueBucket = getOverdueBucket(d.overdueDays);
      }
      m.dues = dues.sort((a, b) => b.dueDate.localeCompare(a.dueDate));
    }
    return added;
  }

  addMembershipDue(
    membershipId: string,
    input: { period: string; dueDate: string; amountHuf: number },
  ): MembershipDueDto {
    const state = this.load();
    const now = new Date();
    for (const g of state.guests) {
      const m = (g.memberships ?? []).find((x) => x.id === membershipId);
      if (m) {
        const dueDateObj = new Date(input.dueDate);
        const overdueDays = getOverdueDays(dueDateObj, now);
        const due: MembershipDueDto = {
          id: `due-${Date.now()}`,
          membershipId: m.id,
          guestId: g.id,
          guestName: `${g.lastName} ${g.firstName}`,
          period: input.period,
          dueDate: dueDateObj.toISOString(),
          amountHuf: input.amountHuf,
          paidAmountHuf: 0,
          remainingHuf: input.amountHuf,
          status: MembershipDueStatus.PENDING,
          overdueDays,
          overdueBucket: getOverdueBucket(overdueDays),
          createdAt: now.toISOString(),
        };
        m.dues = [due, ...(m.dues ?? [])];
        this.save(state);
        return due;
      }
    }
    throw appError('MEMBERSHIP.NOT_FOUND');
  }

  getOverdueMemberships(): OverdueReportDto {
    const state = this.load();
    const now = new Date();
    let added = false;
    for (const g of state.guests) added = this.syncMembershipDues(g, now) || added;
    if (added) this.save(state);
    const items: OverdueSummaryItemDto[] = [];
    const buckets: OverdueReportDto['buckets'] = {
      DAYS_1_5: [],
      DAYS_6_15: [],
      DAYS_OVER_15: [],
    };
    let totalOverdueHuf = 0;

    for (const g of state.guests) {
      for (const m of g.memberships ?? []) {
        for (const d of m.dues ?? []) {
          if (
            d.status === MembershipDueStatus.PAID ||
            d.status === MembershipDueStatus.WAIVED
          ) {
            continue;
          }
          const remainingHuf = Math.max(0, d.amountHuf - d.paidAmountHuf);
          if (remainingHuf <= 0) continue;

          const diffDays = getOverdueDays(d.dueDate, now);
          if (diffDays <= 0) continue;

          const bucket = getOverdueBucket(diffDays);
          const item: OverdueSummaryItemDto = {
            dueId: d.id,
            membershipId: m.id,
            guestId: g.id,
            guestName: `${g.lastName} ${g.firstName}`,
            guestBarcode: g.barcode,
            guestPhone: g.phone,
            period: d.period,
            dueDate: d.dueDate,
            amountHuf: d.amountHuf,
            paidAmountHuf: d.paidAmountHuf,
            remainingHuf,
            overdueDays: diffDays,
            overdueBucket: bucket,
          };

          items.push(item);
          totalOverdueHuf += remainingHuf;
          if (bucket === OverdueBucket.DAYS_1_5) buckets.DAYS_1_5.push(item);
          else if (bucket === OverdueBucket.DAYS_6_15)
            buckets.DAYS_6_15.push(item);
          else if (bucket === OverdueBucket.DAYS_OVER_15)
            buckets.DAYS_OVER_15.push(item);
        }
      }
    }

    return {
      totalOverdueHuf,
      totalOverdueCount: items.length,
      buckets,
      items,
    };
  }

  getTodayDashboard(): TodayDashboardDto {
    const overdue = this.getOverdueMemberships();
    const state = this.load();
    const now = new Date();
    const todayMmDd = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const finance = this.getDailyFinanceSummary();

    const expiringPasses: TodayDashboardDto['expiringPasses'] = [];
    const celebrants: TodayDashboardDto['celebrants'] = [];
    const serviceMap = new Map<string, number>();

    for (const g of state.guests) {
      const guestName = `${g.lastName} ${g.firstName}`;
      const isBday = g.birthDate && g.birthDate.slice(5, 10) === todayMmDd;
      const isNday = g.nameDay === todayMmDd;

      if (isBday || isNday) {
        celebrants.push({
          guestId: g.id,
          guestName,
          barcode: g.barcode,
          type: isBday && isNday ? 'BOTH' : isBday ? 'BIRTHDAY' : 'NAMEDAY',
          detail:
            isBday && isNday
              ? 'Születésnap & Névnap!'
              : isBday
                ? 'Ma van a születésnapja!'
                : `Ma ünnepli a névnapját (${g.nameDay})!`,
        });
      }

      for (const p of g.passes ?? []) {
        if (!p.isActive || p.isFrozen) continue;
        const daysLeft = Math.ceil(
          (new Date(p.expirationDate).getTime() - now.getTime()) /
            (24 * 60 * 60 * 1000),
        );
        const lowOcc =
          p.type === PassType.OCCASION_BASED &&
          p.remainingPasses !== null &&
          p.remainingPasses <= 2;

        if ((daysLeft >= 0 && daysLeft <= 7) || lowOcc) {
          expiringPasses.push({
            passId: p.id,
            guestId: g.id,
            guestName,
            passName: p.passTemplateName ?? 'Bérlet',
            remainingPasses: p.remainingPasses,
            expirationDate: p.expirationDate,
            daysLeft,
          });
        }

        for (const u of p.usageLogs ?? []) {
          if (u.delta < 0 && !u.reversedAt) {
            const sName = u.serviceName ?? p.passTemplateName ?? 'Kezelés';
            serviceMap.set(sName, (serviceMap.get(sName) ?? 0) + 1);
          }
        }
      }
    }

    const activeCheckIns = state.checkIns.filter(
      (c) => c.status === CheckInStatus.SUCCESS,
    );

    return {
      date: now.toISOString().slice(0, 10),
      arrivalsCount: activeCheckIns.length,
      circuitArrivalsCount: activeCheckIns.filter(
        (c) => c.visitType === VisitType.CIRCUIT_TRAINING,
      ).length,
      treatmentsUsedCount: Array.from(serviceMap.values()).reduce(
        (a, b) => a + b,
        0,
      ),
      passesSoldTodayCount: state.payments.filter(
        (p) => !p.isCancelled && p.guestPassId,
      ).length,
      todayRevenueHuf: finance.totalRevenue,
      monthlyRevenueHuf: finance.totalRevenue + 285000,
      overdueTotalHuf: overdue.totalOverdueHuf,
      overdueCount: overdue.totalOverdueCount,
      overdueByBucket: {
        DAYS_1_5: overdue.buckets.DAYS_1_5.length,
        DAYS_6_15: overdue.buckets.DAYS_6_15.length,
        DAYS_OVER_15: overdue.buckets.DAYS_OVER_15.length,
      },
      expiringPasses,
      celebrants,
      serviceBreakdown: Array.from(serviceMap.entries()).map(
        ([serviceName, usageCount]) => ({ serviceName, usageCount }),
      ),
    };
  }

  getDailyFinanceSummary(dateStr?: string): DailyFinanceSummaryDto {
    const state = this.load();
    const dateKey = (dateStr ? new Date(dateStr) : new Date())
      .toISOString()
      .slice(0, 10);

    const byMethod = {
      CASH: 0,
      POS_CARD: 0,
      BANK_TRANSFER: 0,
    };
    let totalRevenue = 0;
    let activeTransactionCount = 0;
    let cancelledTransactionCount = 0;

    for (const p of state.payments) {
      if (!p.isCancelled) {
        totalRevenue += p.amount;
        activeTransactionCount++;
        byMethod[p.paymentMethod] = (byMethod[p.paymentMethod] ?? 0) + p.amount;
      } else {
        cancelledTransactionCount++;
      }
    }

    return {
      date: dateKey,
      totalRevenue,
      monthlyRevenue: totalRevenue + 285000,
      byMethod,
      activeTransactionCount,
      cancelledTransactionCount,
      payments: state.payments,
    };
  }

  cancelPayment(paymentId: string, reason?: string): PaymentDto {
    const state = this.load();
    const payment = state.payments.find((p) => p.id === paymentId);
    if (!payment) throw appError('PAYMENT.NOT_FOUND');
    if (payment.isCancelled)
      throw appError('PAYMENT.ALREADY_CANCELLED');

    payment.isCancelled = true;
    payment.note =
      `${payment.note ?? ''} [SZTORNÓZVA${reason ? `: ${reason}` : ''}]`.trim();

    if (payment.guestPassId) {
      // Csak a bérlet eladási (legkorábbi) befizetésének sztornója zárja le a bérletet;
      // egy későbbi részlet sztornója nem (mint az API-n).
      const salePayment = state.payments
        .filter((p) => p.guestPassId === payment.guestPassId)
        .reduce((first, p) =>
          p.createdAt < first.createdAt ||
          (p.createdAt === first.createdAt && p.id < first.id)
            ? p
            : first,
        );
      const isSalePayment = salePayment.id === payment.id;
      for (const g of state.guests) {
        const pass = (g.passes ?? []).find((p) => p.id === payment.guestPassId);
        if (pass) {
          if (isSalePayment) pass.cancelledAt = new Date().toISOString();
          pass.usageLogs = [
            {
              id: `ulog-${Date.now()}`,
              guestPassId: pass.id,
              guestId: g.id,
              guestName: `${g.lastName} ${g.firstName}`,
              employeeId: 'staff-default-1',
              employeeName: 'Recepciós Munkatárs',
              delta: 0,
              usedAt: new Date().toISOString(),
              note: `${isSalePayment ? 'Fizetés és bérlet sztornózva' : 'Részletfizetés sztornózva (a bérlet érvényes marad)'}${reason ? `: ${reason}` : ''}`,
            },
            ...(pass.usageLogs ?? []),
          ];
        }
      }
    }

    if (payment.membershipDueId) {
      for (const g of state.guests) {
        for (const m of g.memberships ?? []) {
          const due = (m.dues ?? []).find(
            (d) => d.id === payment.membershipDueId,
          );
          if (due) {
            due.paidAmountHuf = Math.max(0, due.paidAmountHuf - payment.amount);
            due.remainingHuf = Math.max(0, due.amountHuf - due.paidAmountHuf);
            due.status =
              due.paidAmountHuf === 0
                ? MembershipDueStatus.PENDING
                : MembershipDueStatus.PARTIAL;
          }
        }
      }
    }

    logCorrection(
      state,
      {
        action: 'PAYMENT_CANCELLED',
        entityType: 'Payment',
        entityId: payment.id,
        details: `Fizetési tétel sztornózva (${payment.guestName}, ${payment.amount.toLocaleString('hu-HU')} Ft): ${reason ?? 'Recepciós korrekció'}`,
      },
      new Date(),
    );

    this.save(state);
    return payment;
  }

  // 2. Ütem: Mérések, Fényképek, Dokumentumok, Megjegyzések, E-mail napló
  addMeasurement(
    guestId: string,
    input: Partial<MeasurementDto>,
    recordedBy?: Pick<AuthUserDto, 'id' | 'name'> | null,
  ): MeasurementDto {
    const state = this.load();
    const guest = state.guests.find((g) => g.id === guestId);
    if (!guest) throw appError('GUEST.NOT_FOUND');

    const created: MeasurementDto = {
      id: `ms-${Date.now()}`,
      guestId,
      measuredAt: input.measuredAt ?? new Date().toISOString(),
      weightKg: input.weightKg ?? null,
      bodyFatPct: input.bodyFatPct ?? null,
      muscleMassKg: input.muscleMassKg ?? null,
      visceralFat: input.visceralFat ?? null,
      waistCm: input.waistCm ?? null,
      hipCm: input.hipCm ?? null,
      thighCm: input.thighCm ?? null,
      armCm: input.armCm ?? null,
      chestCm: input.chestCm ?? null,
      note: input.note?.trim() || null,
      recordedById: recordedBy?.id ?? null,
      recordedByName: recordedBy?.name ?? 'Recepciós Munkatárs',
    };

    guest.measurements = [created, ...(guest.measurements ?? [])];
    this.save(state);
    return created;
  }

  // Ugyanaz a szabály, mint az API-ban: admin vagy a rögzítő munkatárs (TICKET-8).
  deleteMeasurement(
    guestId: string,
    measurementId: string,
    user: Pick<AuthUserDto, 'id' | 'role'> | null,
  ): { deletedId: string } {
    const state = this.load();
    const guest = state.guests.find((g) => g.id === guestId);
    const measurement = guest?.measurements?.find((m) => m.id === measurementId);
    if (!guest || !measurement) throw appError('GUEST.MEASUREMENT_NOT_FOUND');
    if (!canDeleteMeasurement(user, measurement)) {
      throw appError('GUEST.MEASUREMENT_DELETE_FORBIDDEN');
    }

    guest.measurements = (guest.measurements ?? []).filter(
      (m) => m.id !== measurementId,
    );
    this.save(state);
    return { deletedId: measurementId };
  }

  addPhoto(
    guestId: string,
    input: {
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
  ): GuestPhotoDto {
    const state = this.load();
    const guest = state.guests.find((g) => g.id === guestId);
    if (!guest) throw appError('GUEST.NOT_FOUND');

    const srv = state.services.find((s) => s.id === input.serviceId);
    const created: GuestPhotoDto = {
      id: `ph-${Date.now()}`,
      guestId,
      serviceId: srv?.id ?? null,
      serviceName: srv?.name ?? null,
      takenAt: new Date().toISOString(),
      fileUrl: input.fileUrl,
      mimeType: input.mimeType ?? 'image/webp',
      originalSizeBytes: input.originalSizeBytes ?? 0,
      compressedSizeBytes: input.compressedSizeBytes ?? 0,
      width: input.width ?? 0,
      height: input.height ?? 0,
      visibilityRole: input.visibilityRole ?? Role.RECEPTIONIST,
      note: input.note?.trim() || null,
    };

    guest.photos = [created, ...(guest.photos ?? [])];
    this.save(state);
    return created;
  }

  createDocument(
    guestId: string,
    input: {
      documentType: DocumentType;
      title: string;
      contentText: string;
      fieldsJson?: Record<string, string>;
      signatureDataUrl?: string | null;
    },
  ): GuestDocumentDto {
    const state = this.load();
    const guest = state.guests.find((g) => g.id === guestId);
    if (!guest) throw appError('GUEST.NOT_FOUND');

    const isSigned = Boolean(input.signatureDataUrl);
    const created: GuestDocumentDto = {
      id: `doc-${Date.now()}`,
      guestId,
      guestName: `${guest.lastName} ${guest.firstName}`,
      documentType: input.documentType,
      title: input.title.trim(),
      contentText: input.contentText.trim(),
      fieldsJson: input.fieldsJson,
      signatureDataUrl: input.signatureDataUrl ?? null,
      signedAt: isSigned ? new Date().toISOString() : null,
      status: isSigned
        ? DocumentStatus.SIGNED
        : DocumentStatus.PENDING_SIGNATURE,
      createdAt: new Date().toISOString(),
    };

    guest.documents = [created, ...(guest.documents ?? [])];
    this.save(state);
    return created;
  }

  listPendingDocuments(): GuestDocumentDto[] {
    const state = this.load();
    return state.guests.flatMap((g) =>
      (g.documents ?? [])
        .filter((d) => d.status === DocumentStatus.PENDING_SIGNATURE)
        .map((d) => ({
          ...d,
          guestName: `${g.lastName} ${g.firstName}`,
        })),
    );
  }

  signDocument(
    documentId: string,
    input: { signatureDataUrl: string; fieldsJson?: Record<string, string> },
  ): GuestDocumentDto {
    const state = this.load();
    for (const g of state.guests) {
      const doc = (g.documents ?? []).find((d) => d.id === documentId);
      if (doc) {
        doc.signatureDataUrl = input.signatureDataUrl;
        if (input.fieldsJson) {
          doc.fieldsJson = { ...(doc.fieldsJson ?? {}), ...input.fieldsJson };
        }
        doc.signedAt = new Date().toISOString();
        doc.status = DocumentStatus.SIGNED;
        doc.guestName = `${g.lastName} ${g.firstName}`;
        this.save(state);
        return doc;
      }
    }
    throw appError('GUEST.DOCUMENT_NOT_FOUND');
  }

  addInternalNote(guestId: string, content: string): GuestNoteDto {
    const state = this.load();
    const guest = state.guests.find((g) => g.id === guestId);
    if (!guest) throw appError('GUEST.NOT_FOUND');

    const created: GuestNoteDto = {
      id: `note-${Date.now()}`,
      guestId,
      authorId: 'staff-default-1',
      authorName: 'Recepciós Munkatárs',
      content: content.trim(),
      createdAt: new Date().toISOString(),
    };

    guest.internalNotes = [created, ...(guest.internalNotes ?? [])];
    this.save(state);
    return created;
  }

  sendGuestEmailLog(
    guestId: string,
    input: { subject: string; messageType: string },
  ): MessageLogDto {
    const state = this.load();
    const guest = state.guests.find((g) => g.id === guestId);
    if (!guest) throw appError('GUEST.NOT_FOUND');

    const created: MessageLogDto = {
      id: `msg-${Date.now()}`,
      guestId,
      guestName: `${guest.lastName} ${guest.firstName}`,
      recipientEmail: guest.email || 'nincs-email@reform.hu',
      subject: input.subject.trim(),
      messageType: input.messageType,
      status: guest.email ? MessageStatus.DELIVERED : MessageStatus.FAILED,
      sentAt: new Date().toISOString(),
      errorDetails: guest.email
        ? null
        : 'A vendégnek nincs rögzített e-mail címe.',
    };

    guest.messageLogs = [created, ...(guest.messageLogs ?? [])];
    this.save(state);
    return created;
  }

  getAuditLogs(): AuditLogDto[] {
    return this.load().auditLogs;
  }

  syncOfflineScans(items: OfflineScanItemDto[]): OfflineSyncResponseDto {
    const results: CheckInResultPayload[] = [];
    for (const item of items) {
      try {
        results.push(this.scanCheckIn({ barcode: item.barcode }));
      } catch (err) {
        results.push({
          status: CheckInStatus.DENIED,
          barcode: item.barcode,
          guestName: `Ismeretlen (${item.barcode})`,
          reason: (err as Error).message,
          warnings: [],
          timestamp: item.scannedAt,
        });
      }
    }
    return {
      processed: results.length,
      treatmentSelectionRequired: results.filter(
        (r) => r.status === CheckInStatus.TREATMENT_SELECTION_REQUIRED,
      ).length,
      results,
    };
  }

  private ensureUniqueDeviceName(
    devices: DisplayDeviceDto[],
    name: string,
    excludeDeviceId?: string,
  ): string {
    const trimmed = name.trim();
    if (!trimmed) {
      throw appError('AUTH.DEVICE_NAME_REQUIRED');
    }
    const collision = devices.find(
      (d) =>
        d.id !== excludeDeviceId &&
        d.name.trim().toLowerCase() === trimmed.toLowerCase(),
    );
    if (collision) {
      throw appError('AUTH.DEVICE_NAME_TAKEN', {
        message: `Már létezik "${trimmed}" nevű kijelző! Ugyanolyan nevű monitort nem lehet kétszer létrehozni.`,
      });
    }
    return trimmed;
  }

  initDisplayPairing(name: string): DisplayDeviceDto {
    const state = this.load();
    const cleanName = this.ensureUniqueDeviceName(state.devices, name);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + PAIRING_CODE_TTL_MS);
    const code = String(Math.floor(100000 + Math.random() * 900000));

    const device: DisplayDeviceDto = {
      id: `dev-${Date.now()}`,
      name: cleanName,
      status: 'PENDING_PAIRING',
      pairingCode: code,
      pairingExpiresAt: expiresAt.toISOString(),
      pairedAt: null,
      isActive: true,
      lastSeenAt: null,
      lastActivityType: null,
      isOnline: false,
      createdAt: now.toISOString(),
    };
    state.devices.unshift(device);
    this.save(state);
    return device;
  }

  verifyDisplayPairing(pairingCode: string): PairDisplayResponseDto {
    const state = this.load();
    const code = pairingCode.trim();
    const device = state.devices.find(
      (d) => d.pairingCode === code && d.isActive,
    );
    if (!device) {
      throw appError('AUTH.DEVICE_PAIRING_CODE_INVALID');
    }
    if (
      device.pairingExpiresAt &&
      new Date(device.pairingExpiresAt).getTime() <= Date.now()
    ) {
      throw appError('AUTH.DEVICE_PAIRING_CODE_EXPIRED');
    }

    const nowIso = new Date().toISOString();
    device.status = 'PAIRED';
    device.pairingCode = null;
    device.pairingExpiresAt = null;
    device.pairedAt = nowIso;
    device.lastSeenAt = nowIso;
    device.lastActivityType = 'Sikeresen párosítva';
    device.isOnline = true;
    this.save(state);

    return {
      deviceToken: `mock-device-token-${device.id}`,
      device,
    };
  }

  regenerateDisplayPairingCode(deviceId: string): DisplayDeviceDto {
    const state = this.load();
    const device = state.devices.find((d) => d.id === deviceId);
    if (!device) {
      throw appError('AUTH.DEVICE_NOT_FOUND');
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + PAIRING_CODE_TTL_MS);
    const code = String(Math.floor(100000 + Math.random() * 900000));

    device.status = 'PENDING_PAIRING';
    device.pairingCode = code;
    device.pairingExpiresAt = expiresAt.toISOString();
    device.pairedAt = null;
    device.lastSeenAt = null;
    device.lastActivityType = null;
    device.isOnline = false;
    this.save(state);

    const revokedPayload: MonitorDeviceRevokedPayload = {
      deviceId: device.id,
      reason: 'A recepció új párosító kódot kért ehhez a kijelzőhöz.',
      timestamp: now.toISOString(),
    };
    broadcastToLocalMonitors({
      type: 'DEVICE_REVOKED',
      payload: revokedPayload,
    });

    return device;
  }

  renameDisplayDevice(deviceId: string, newName: string): DisplayDeviceDto {
    const state = this.load();
    const device = state.devices.find((d) => d.id === deviceId);
    if (!device) {
      throw appError('AUTH.DEVICE_NOT_FOUND');
    }
    const cleanName = this.ensureUniqueDeviceName(
      state.devices,
      newName,
      deviceId,
    );
    device.name = cleanName;
    this.save(state);
    return normalizeDisplayDevice(device);
  }

  deleteDisplayDevice(deviceId: string): { deletedId: string } {
    const state = this.load();
    const idx = state.devices.findIndex((d) => d.id === deviceId);
    if (idx === -1) {
      throw appError('AUTH.DEVICE_NOT_FOUND');
    }
    const [removed] = state.devices.splice(idx, 1);
    this.save(state);

    broadcastToLocalMonitors({
      type: 'DEVICE_REVOKED',
      payload: {
        deviceId: removed.id,
        reason: 'A kijelző párosítását törölték a recepcióról.',
        timestamp: new Date().toISOString(),
      },
    });

    return { deletedId: removed.id };
  }

  unpairSelfDevice(deviceToken: string): { unpairedId: string } {
    const state = this.load();
    const deviceId = deviceToken.replace('mock-device-token-', '').trim();
    const idx = state.devices.findIndex((d) => d.id === deviceId);
    if (idx !== -1) {
      const [removed] = state.devices.splice(idx, 1);
      this.save(state);
      broadcastToLocalMonitors({
        type: 'DEVICE_REVOKED',
        payload: {
          deviceId: removed.id,
          reason: 'A párosítást megszakították a kijelzőről.',
          timestamp: new Date().toISOString(),
        },
      });
      return { unpairedId: removed.id };
    }
    return { unpairedId: deviceId || 'unknown' };
  }

  sendMonitorTestSignal(
    deviceId?: string,
    senderName = 'Recepció',
  ): MonitorTestPingPayload {
    const state = this.load();
    const nowIso = new Date().toISOString();
    let targetName: string | null = null;

    if (deviceId) {
      const dev = state.devices.find((d) => d.id === deviceId);
      if (!dev) {
        throw appError('AUTH.DEVICE_NOT_FOUND', {
          message: 'A megadott kijelző nem található.',
        });
      }
      targetName = dev.name;
      if (!dev.pairingCode) {
        dev.lastSeenAt = nowIso;
        dev.lastActivityType = 'Teszt jel fogadva';
      }
    } else {
      for (const dev of state.devices) {
        if (!dev.pairingCode && dev.isActive) {
          dev.lastSeenAt = nowIso;
          dev.lastActivityType = 'Teszt jel fogadva';
        }
      }
    }

    this.save(state);

    const payload: MonitorTestPingPayload = {
      deviceId: deviceId ?? null,
      deviceName: targetName,
      senderName,
      message: targetName
        ? `Teszt jel sikeresen fogadva a(z) "${targetName}" kijelzőn!`
        : 'Teszt jel sikeresen fogadva! A Vendégmonitor kapcsolat aktív.',
      timestamp: nowIso,
    };

    broadcastToLocalMonitors({
      type: 'TEST_PING',
      payload,
    });

    return payload;
  }

  getDisplayDevices(): DisplayDeviceDto[] {
    return this.load().devices.map((d) => normalizeDisplayDevice(d));
  }

  private loadTourState(): StoredTourState {
    if (typeof window === 'undefined') return readTourState(null);
    try {
      return readTourState(JSON.parse(localStorage.getItem(TOURS_KEY) ?? 'null'));
    } catch {
      return readTourState(null);
    }
  }

  getTourState(): TourStateDto {
    return { seen: this.loadTourState().seen };
  }

  recordTourEvent(event: TourEventDto): TourStateDto {
    if (
      event.kind === 'seen' &&
      (!TOUR_ID_PATTERN.test(event.id) || event.step < 0 || event.step > TOUR_STEP_MAX)
    ) {
      throw appError('COMMON.VALIDATION_FAILED');
    }
    const next = applyTourEvent(this.loadTourState(), event);
    if (typeof window !== 'undefined') {
      localStorage.setItem(TOURS_KEY, JSON.stringify(next));
    }
    return { seen: next.seen };
  }
}

export const mockStudioEngine = new MockStudioEngine();
