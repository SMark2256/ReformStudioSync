import {
  AuditLogDto,
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
  GuestDocumentDto,
  GuestDto,
  GuestNoteDto,
  GuestPassDto,
  GuestPhotoDto,
  GuestStatus,
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
  PassTemplateDto,
  PassType,
  PassUsageLogDto,
  PaymentDto,
  PaymentMethod,
  RecordPaymentRequestDto,
  Role,
  ServiceCategory,
  ServiceDto,
  TodayDashboardDto,
  VisitDto,
  VisitType,
} from '@reform/shared';
import { broadcastToLocalMonitors } from '@/shared/lib/monitor-channel';

const STORAGE_KEY = 'reform-studio-mock-sandbox-v2';
const MONITOR_CONFIG_KEY = 'reform-studio-monitor-greeting-seconds';

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

export function getOverdueBucketForDays(days: number): OverdueBucket {
  if (days <= 0) return OverdueBucket.NONE;
  if (days <= 5) return OverdueBucket.DAYS_1_5;
  if (days <= 15) return OverdueBucket.DAYS_6_15;
  return OverdueBucket.DAYS_OVER_15;
}

// Kisméretű SVG alapú optimalizált WebP/SVG előtte-utána mintaillusztráció
function createSampleSvgDataUrl(label: string, colorHex: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="320" viewBox="0 0 480 320"><rect width="480" height="320" rx="20" fill="${colorHex}"/><circle cx="240" cy="125" r="46" fill="rgba(255,255,255,0.22)"/><rect x="170" y="185" width="140" height="65" rx="18" fill="rgba(255,255,255,0.22)"/><text x="240" y="285" font-family="sans-serif" font-size="16" font-weight="bold" fill="#ffffff" text-anchor="middle">${label}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function createInitialMockDatabase(): MockDatabaseState {
  const now = new Date();
  const todayMmDd = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const currentPeriod = now.toISOString().slice(0, 7);

  const services: ServiceDto[] = [
    {
      id: 'srv-circuit',
      studioId: DEFAULT_STUDIO_ID,
      name: 'Női Köredzés (Havi Tagság)',
      category: ServiceCategory.CIRCUIT,
      durationMinutes: 45,
      priceHuf: 22000,
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
          monthlyFeeHuf: 22000,
          startDate: addDays(now, -60),
          dueDay: 10,
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
              period: currentPeriod,
              dueDate: addDays(now, -5),
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
          monthlyFeeHuf: 22000,
          startDate: addDays(now, -35),
          dueDay: 15,
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
              period: currentPeriod,
              dueDate: addDays(now, -3), // 3 napja lejárt -> 1–5 napos késési kategória
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
          monthlyFeeHuf: 20000,
          startDate: addDays(now, -60),
          dueDay: 10,
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
              period: currentPeriod,
              dueDate: addDays(now, -9), // 9 napja esedékes -> 6–15 napos kategória (részbefizetéssel)
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
          monthlyFeeHuf: 24000,
          startDate: addDays(now, -70),
          dueDay: 1,
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
              period: currentPeriod,
              dueDate: addDays(now, -21), // 21 napja lejárt -> 15 nap feletti késés
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
          monthlyFeeHuf: 22000,
          startDate: addDays(now, -40),
          dueDay: 10,
          status: MembershipStatus.PAUSED,
          pausedAt: addDays(now, -4),
          terminatedAt: null,
          createdAt: addDays(now, -40),
          dues: [],
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
      membershipPeriod: currentPeriod,
      recordedByUserId: 'staff-default-1',
      recordedByName: 'Recepciós Munkatárs',
      amount: 10000,
      paymentMethod: PaymentMethod.CASH,
      isCancelled: false,
      note: `Havi tagdíj részbefizetés (${currentPeriod})`,
      createdAt: new Date(now.getTime() - 90 * 60 * 1000).toISOString(),
      allocations: [
        {
          id: 'alloc-2',
          paymentId: 'pay-2',
          membershipDueId: 'due-3',
          membershipPeriod: currentPeriod,
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
      return parsed;
    } catch {
      return createInitialMockDatabase();
    }
  }

  private save(state: MockDatabaseState) {
    if (typeof window === 'undefined') return;
    // Szinkronban tartjuk a vendégek treatmentHistory és payments tömbjeit
    for (const g of state.guests) {
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
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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
  }): ServiceDto {
    const state = this.load();
    const created: ServiceDto = {
      id: `srv-${Date.now()}`,
      studioId: DEFAULT_STUDIO_ID,
      name: input.name.trim(),
      category: input.category,
      durationMinutes: input.durationMinutes,
      priceHuf: input.priceHuf,
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
    if (!guest) throw new Error('A vendég nem található.');
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
      throw new Error(
        `A(z) "${barcode}" vonalkód már foglalt (${collision.lastName} ${collision.firstName}).`,
      );
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
      status: GuestStatus;
      notes: string;
    }>,
  ): GuestDto {
    const state = this.load();
    const idx = state.guests.findIndex((g) => g.id === id);
    if (idx === -1) throw new Error('A vendég nem található.');

    const current = state.guests[idx];
    if (input.barcode && input.barcode.trim() !== current.barcode) {
      const collision = state.guests.find(
        (g) => g.barcode === input.barcode!.trim() && g.id !== id,
      );
      if (collision) {
        throw new Error(
          `A(z) "${input.barcode.trim()}" vonalkód már foglalt (${collision.lastName} ${collision.firstName}).`,
        );
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
    return includeInactive
      ? state.templates
      : state.templates.filter((t) => t.isActive);
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
    if (idx === -1) throw new Error('A bérletsablon nem található.');
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
    if (!guest) throw new Error('A kiválasztott vendég nem található.');

    const template = state.templates.find((t) => t.id === input.passTemplateId);
    if (!template) throw new Error('A kiválasztott bérletsablon nem található.');

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
    if (!guest) throw new Error('A vendég nem található.');

    const pass = (guest.passes ?? []).find((p) => p.id === input.passId);
    if (!pass) throw new Error('A kiválasztott bérlet nem található.');

    const service = state.services.find((s) => s.id === input.serviceId);
    const serviceName =
      service?.name ?? pass.serviceName ?? pass.passTemplateName ?? 'Kezelés';

    if (pass.isFrozen) {
      throw new Error(
        'Ez a bérlet jelenleg fagyasztva van, nem vonható le belőle alkalom.',
      );
    }

    if (!pass.isActive || new Date(pass.expirationDate) < now) {
      throw new Error('A kiválasztott bérlet lejárt vagy inaktív!');
    }

    let newRemaining: number | 'Korlátlan' = 'Korlátlan';
    if (pass.type === PassType.OCCASION_BASED) {
      const currentRem = pass.remainingPasses ?? 0;
      if (currentRem <= 0) {
        throw new Error(
          'A bérleten elfogytak a felhasználható alkalmak (0 maradt)!',
        );
      }
      const nextRem = currentRem - 1;
      pass.remainingPasses = nextRem;
      pass.calculatedRemainingPasses = nextRem;
      pass.usedPassesCount = (pass.usedPassesCount ?? 0) + 1;
      if (nextRem <= 0) {
        pass.isActive = false;
      }
      newRemaining = nextRem;
    }

    const usageId = `ulog-${Date.now()}`;
    const newUsage: PassUsageLogDto = {
      id: usageId,
      guestPassId: pass.id,
      guestId: guest.id,
      guestName: `${guest.lastName} ${guest.firstName}`,
      serviceId: service?.id ?? pass.serviceId ?? null,
      serviceName,
      passName: pass.passTemplateName ?? 'Bérlet',
      employeeId: 'staff-default-1',
      employeeName: 'Recepciós Munkatárs',
      delta: -1,
      remainingAfter: typeof newRemaining === 'number' ? newRemaining : null,
      usedAt: now.toISOString(),
      reversedAt: null,
      reversalReason: null,
      note: input.note?.trim() || `Kezelés: ${serviceName}`,
    };

    pass.usageLogs = [newUsage, ...(pass.usageLogs ?? [])];

    const checkInLog: LoggedCheckInDto = {
      id: `chk-${Date.now()}`,
      studioId: DEFAULT_STUDIO_ID,
      guestId: guest.id,
      guestName: `${guest.lastName} ${guest.firstName}`,
      guestBarcode: guest.barcode,
      guestPassId: pass.id,
      passName: `${serviceName} (${pass.passTemplateName})`,
      visitType: VisitType.TREATMENT,
      serviceName,
      userId: 'staff-default-1',
      staffName: 'Recepciós Munkatárs',
      status: CheckInStatus.SUCCESS,
      reason: `Kezelés: ${serviceName}`,
      createdAt: now.toISOString(),
    };

    state.checkIns.unshift(checkInLog);
    state.visits.unshift({
      id: `vis-${Date.now()}`,
      studioId: DEFAULT_STUDIO_ID,
      guestId: guest.id,
      guestName: `${guest.lastName} ${guest.firstName}`,
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
      passName: pass.passTemplateName,
      passType: pass.type,
      remainingPasses: newRemaining,
      totalPasses: pass.totalPasses,
      expirationDate: pass.expirationDate,
      warnings,
      suggestedRenewalTemplateId: pass.passTemplateId,
      timestamp: now.toISOString(),
    };

    broadcastToLocalMonitors({ type: 'CHECKIN_RESULT', payload });
    return payload;
  }

  reversePassUsage(
    usageId: string,
    reversalReason: string,
  ): CheckInRevokedPayload {
    const state = this.load();
    const now = new Date();

    for (const guest of state.guests) {
      for (const pass of guest.passes ?? []) {
        const usage = (pass.usageLogs ?? []).find((u) => u.id === usageId);
        if (usage) {
          if (usage.reversedAt) {
            throw new Error('Ez a levonás már vissza lett vonva.');
          }
          usage.reversedAt = now.toISOString();
          usage.reversalReason = reversalReason.trim();

          let restoredRemaining: number | 'Korlátlan' = 'Korlátlan';
          if (pass.type === PassType.OCCASION_BASED) {
            pass.remainingPasses = (pass.remainingPasses ?? 0) + 1;
            pass.calculatedRemainingPasses = pass.remainingPasses;
            pass.usedPassesCount = Math.max(0, (pass.usedPassesCount ?? 1) - 1);
            if (new Date(pass.expirationDate) >= now) {
              pass.isActive = true;
            }
            restoredRemaining = pass.remainingPasses;
          }

          state.auditLogs.unshift({
            id: `audit-${Date.now()}`,
            userId: 'staff-default-1',
            userName: 'Recepciós Munkatárs',
            action: 'PASS_USAGE_REVERSED',
            entityType: 'PassUsageLog',
            entityId: usage.id,
            createdAt: now.toISOString(),
            details: `Alkalomlevonás visszavonva (${guest.lastName} ${guest.firstName} - ${usage.serviceName ?? pass.passTemplateName}): ${reversalReason.trim()}`,
          });

          this.save(state);

          const revokedPayload: CheckInRevokedPayload = {
            checkInId: usage.id,
            guestId: guest.id,
            guestName: `${guest.lastName} ${guest.firstName}`,
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
    }

    throw new Error('A kezelési levonás nem található.');
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
        if (pass.type === PassType.TIME_BASED || (pass.remainingPasses ?? 0) > 0) {
          pass.isActive = true;
        }
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
    throw new Error('A bérlet nem található.');
  }

  toggleFreezePass(passId: string, note?: string): GuestPassDto {
    const state = this.load();
    const now = new Date();
    for (const guest of state.guests) {
      const pass = (guest.passes ?? []).find((p) => p.id === passId);
      if (pass) {
        if (!pass.isFrozen) {
          pass.isFrozen = true;
          pass.frozenAt = now.toISOString();
          pass.usageLogs = [
            {
              id: `ulog-${Date.now()}`,
              guestPassId: pass.id,
              guestId: guest.id,
              guestName: `${guest.lastName} ${guest.firstName}`,
              delta: 0,
              usedAt: now.toISOString(),
              note: `Bérlet fagyasztva${note ? `: ${note}` : ''}`,
            },
            ...(pass.usageLogs ?? []),
          ];
        } else {
          const frozenSince = pass.frozenAt ? new Date(pass.frozenAt) : now;
          const frozenDays = Math.max(
            1,
            Math.ceil(
              (now.getTime() - frozenSince.getTime()) / (24 * 60 * 60 * 1000),
            ),
          );
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
              delta: 0,
              usedAt: now.toISOString(),
              note: `Fagyasztás feloldva (+${frozenDays} nap jóváírva a lejáratra)`,
            },
            ...(pass.usageLogs ?? []),
          ];
        }
        this.save(state);
        return pass;
      }
    }
    throw new Error('A bérlet nem található.');
  }

  /**
   * 2.3 Köredzéses érkezés vagy vonalkódos beléptetés (10 mp dupla leolvasás védelemmel)
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
      throw new Error(
        `Nem található aktív vendég a(z) "${barcode}" vonalkóddal.`,
      );
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
        const dupPayload: CheckInResultPayload = {
          checkInId: recent.id,
          mode: 'CIRCUIT_GREETING',
          status: CheckInStatus.DUPLICATE_SCAN,
          guestId: guest.id,
          barcode: guest.barcode,
          guestName: guestFullName,
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
    const validPasses = passes.filter((p) => {
      if (!p.isActive || p.isFrozen) return false;
      if (new Date(p.startDate) > now || new Date(p.expirationDate) < now) {
        return false;
      }
      if (p.type === PassType.TIME_BASED) return true;
      return (p.remainingPasses ?? 0) > 0;
    });

    validPasses.sort((a, b) => {
      if (a.type === PassType.TIME_BASED && b.type !== PassType.TIME_BASED)
        return -1;
      if (a.type !== PassType.TIME_BASED && b.type === PassType.TIME_BASED)
        return 1;
      return (
        new Date(a.expirationDate).getTime() -
        new Date(b.expirationDate).getTime()
      );
    });

    const activePass = validPasses[0];

    // 2.3 Köredzéses érkezés: ha van aktív havi tagsága, vagy kifejezetten CIRCUIT_TRAINING módot választottak -> NINCS alkalomlevonás!
    const isCircuitArrival =
      input.visitType === VisitType.CIRCUIT_TRAINING ||
      Boolean(activeMembership && input.visitType !== VisitType.TREATMENT) ||
      activePass?.type === PassType.TIME_BASED;

    if (isCircuitArrival && (activeMembership || activePass)) {
      const checkInLog: LoggedCheckInDto = {
        id: `chk-${Date.now()}`,
        studioId: DEFAULT_STUDIO_ID,
        guestId: guest.id,
        guestName: guestFullName,
        guestBarcode: guest.barcode,
        guestPassId: activePass?.id ?? null,
        passName: activeMembership
          ? `Havi Köredzés Tagság (${activeMembership.monthlyFeeHuf.toLocaleString('hu-HU')} Ft/hó)`
          : (activePass?.passTemplateName ?? 'Köredzés'),
        visitType: VisitType.CIRCUIT_TRAINING,
        serviceName: 'Köredzés',
        userId: 'staff-default-1',
        staffName: 'Recepciós Munkatárs',
        status: CheckInStatus.SUCCESS,
        reason: null,
        createdAt: now.toISOString(),
      };

      state.checkIns.unshift(checkInLog);
      state.visits.unshift({
        id: `vis-${Date.now()}`,
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
        serviceName: 'Köredzés',
        passName: checkInLog.passName ?? 'Köredzés',
        remainingPasses: 'Korlátlan',
        expirationDate: activePass?.expirationDate ?? null,
        warnings,
        overdueAmountHuf: overdueAmountHuf > 0 ? overdueAmountHuf : undefined,
        overdueDays: maxOverdueDays > 0 ? maxOverdueDays : undefined,
        suggestedRenewalTemplateId: activePass?.passTemplateId ?? 'tpl-unlimited',
        timestamp: now.toISOString(),
      };

      broadcastToLocalMonitors({
        type: 'CHECKIN_RESULT',
        payload: circuitPayload,
      });
      return circuitPayload;
    }

    if (!activePass) {
      const hasFrozen = passes.some(
        (p) => p.isActive && p.isFrozen && new Date(p.expirationDate) >= now,
      );
      const reason = hasFrozen
        ? 'A vendég bérlete jelenleg fagyasztva van (szünetel).'
        : pausedMembership
          ? 'A vendég havi tagsága jelenleg szüneteltetve van.'
          : 'Nincs érvényes bérlet vagy aktív havi tagság (lejárt vagy elfogytak az alkalmak)!';
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
        overdueAmountHuf: overdueAmountHuf > 0 ? overdueAmountHuf : undefined,
        overdueDays: maxOverdueDays > 0 ? maxOverdueDays : undefined,
        suggestedRenewalTemplateId: lastPass?.passTemplateId ?? 'tpl-10',
        timestamp: now.toISOString(),
      };

      broadcastToLocalMonitors({
        type: 'CHECKIN_RESULT',
        payload: deniedPayload,
      });
      return deniedPayload;
    }

    // Ha nincs havi tagsága, de van alkalmas bérlete és nem köredzésre jött -> levonás az aktív bérletről
    return this.deductPassUsage({
      guestId: guest.id,
      passId: activePass.id,
      serviceId: activePass.serviceId ?? 'srv-reformer',
      note: 'Gyors vonalkódos kezeléslevonás',
    });
  }

  revokeCheckIn(checkInId: string): CheckInRevokedPayload {
    const state = this.load();
    const checkIn = state.checkIns.find((c) => c.id === checkInId);
    if (!checkIn) throw new Error('A beléptetési naplóbejegyzés nem található.');
    if (checkIn.status !== CheckInStatus.SUCCESS) {
      throw new Error('Csak sikeres beléptetés sztornózható.');
    }

    let restoredRemaining: number | 'Korlátlan' = 'Korlátlan';
    const guest = state.guests.find((g) => g.id === checkIn.guestId);
    if (
      guest &&
      checkIn.guestPassId &&
      checkIn.visitType !== VisitType.CIRCUIT_TRAINING
    ) {
      const pass = (guest.passes ?? []).find(
        (p) => p.id === checkIn.guestPassId,
      );
      if (pass && pass.type === PassType.OCCASION_BASED) {
        pass.remainingPasses = (pass.remainingPasses ?? 0) + 1;
        pass.calculatedRemainingPasses = pass.remainingPasses;
        pass.isActive = true;
        restoredRemaining = pass.remainingPasses;
        pass.usageLogs = [
          {
            id: `ulog-${Date.now()}`,
            guestPassId: pass.id,
            guestId: guest.id,
            guestName: checkIn.guestName,
            delta: 1,
            usedAt: new Date().toISOString(),
            note: 'Recepciós sztornó (téves beléptetés visszavonva)',
          },
          ...(pass.usageLogs ?? []),
        ];
      }
    }

    checkIn.status = CheckInStatus.CANCELLED;
    checkIn.reason = 'Recepciós által sztornózva';
    for (const dev of state.devices) {
      if (!dev.pairingCode && dev.isActive) {
        dev.lastSeenAt = new Date().toISOString();
        dev.lastActivityType = `Sztornó megjelenítve (${checkIn.guestName})`;
      }
    }
    this.save(state);

    const revokedPayload: CheckInRevokedPayload = {
      checkInId: checkIn.id,
      guestId: checkIn.guestId,
      guestName: checkIn.guestName,
      restoredRemainingPasses: restoredRemaining,
      timestamp: new Date().toISOString(),
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
    if (!guest) throw new Error('A vendég nem található.');
    if (input.amountHuf <= 0)
      throw new Error('Az összegnek pozitívnak kell lennie.');

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
    monthlyFeeHuf: number;
    startDate?: string;
    dueDay?: number;
  }): MembershipDto {
    const state = this.load();
    const guest = state.guests.find((g) => g.id === input.guestId);
    if (!guest) throw new Error('A vendég nem található.');

    const start = input.startDate ? new Date(input.startDate) : new Date();
    const dueDay = input.dueDay ?? 10;
    const period = start.toISOString().slice(0, 7);
    const dueDate = new Date(start.getFullYear(), start.getMonth(), dueDay);
    const memId = `mem-${Date.now()}`;

    const membership: MembershipDto = {
      id: memId,
      studioId: DEFAULT_STUDIO_ID,
      guestId: guest.id,
      guestName: `${guest.lastName} ${guest.firstName}`,
      monthlyFeeHuf: input.monthlyFeeHuf,
      startDate: start.toISOString(),
      dueDay,
      status: MembershipStatus.ACTIVE,
      pausedAt: null,
      terminatedAt: null,
      createdAt: new Date().toISOString(),
      dues: [
        {
          id: `due-${Date.now()}`,
          membershipId: memId,
          guestId: guest.id,
          guestName: `${guest.lastName} ${guest.firstName}`,
          period,
          dueDate: dueDate.toISOString(),
          amountHuf: input.monthlyFeeHuf,
          paidAmountHuf: 0,
          remainingHuf: input.monthlyFeeHuf,
          status: MembershipDueStatus.PENDING,
          overdueDays: 0,
          overdueBucket: OverdueBucket.NONE,
          createdAt: new Date().toISOString(),
        },
      ],
    };

    guest.memberships = [membership, ...(guest.memberships ?? [])];
    this.save(state);
    return membership;
  }

  updateMembershipStatus(
    membershipId: string,
    input: { status: MembershipStatus; monthlyFeeHuf?: number; dueDay?: number },
  ): MembershipDto {
    const state = this.load();
    const now = new Date().toISOString();
    for (const g of state.guests) {
      const m = (g.memberships ?? []).find((x) => x.id === membershipId);
      if (m) {
        m.status = input.status;
        if (input.monthlyFeeHuf !== undefined)
          m.monthlyFeeHuf = input.monthlyFeeHuf;
        if (input.dueDay !== undefined) m.dueDay = input.dueDay;
        m.pausedAt = input.status === MembershipStatus.PAUSED ? now : null;
        m.terminatedAt =
          input.status === MembershipStatus.TERMINATED ? now : null;
        this.save(state);
        return m;
      }
    }
    throw new Error('A havi tagság nem található.');
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
        const overdueDays =
          dueDateObj < now
            ? Math.ceil(
                (now.getTime() - dueDateObj.getTime()) / (24 * 60 * 60 * 1000),
              )
            : 0;
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
          overdueBucket: getOverdueBucketForDays(overdueDays),
          createdAt: now.toISOString(),
        };
        m.dues = [due, ...(m.dues ?? [])];
        this.save(state);
        return due;
      }
    }
    throw new Error('A havi tagság nem található.');
  }

  getOverdueMemberships(): OverdueReportDto {
    const state = this.load();
    const now = new Date();
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

          const diffDays = Math.ceil(
            (now.getTime() - new Date(d.dueDate).getTime()) /
              (24 * 60 * 60 * 1000),
          );
          if (diffDays <= 0) continue;

          const bucket = getOverdueBucketForDays(diffDays);
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
    const state = this.load();
    const now = new Date();
    const todayMmDd = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const overdue = this.getOverdueMemberships();
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
    if (!payment) throw new Error('A fizetési tétel nem található.');
    if (payment.isCancelled)
      throw new Error('Ez a fizetési tétel már sztornózva lett.');

    payment.isCancelled = true;
    payment.note =
      `${payment.note ?? ''} [SZTORNÓZVA${reason ? `: ${reason}` : ''}]`.trim();

    if (payment.guestPassId) {
      for (const g of state.guests) {
        const pass = (g.passes ?? []).find((p) => p.id === payment.guestPassId);
        if (pass) {
          pass.isActive = false;
          pass.usageLogs = [
            {
              id: `ulog-${Date.now()}`,
              guestPassId: pass.id,
              guestId: g.id,
              guestName: `${g.lastName} ${g.firstName}`,
              delta: 0,
              usedAt: new Date().toISOString(),
              note: `Fizetés és bérlet sztornózva${reason ? `: ${reason}` : ''}`,
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

    state.auditLogs.unshift({
      id: `audit-${Date.now()}`,
      userId: 'staff-default-1',
      userName: 'Recepciós Munkatárs',
      action: 'PAYMENT_CANCELLED',
      entityType: 'Payment',
      entityId: payment.id,
      createdAt: new Date().toISOString(),
      details: `Fizetési tétel sztornózva (${payment.guestName}, ${payment.amount.toLocaleString('hu-HU')} Ft): ${reason ?? 'Recepciós korrekció'}`,
    });

    this.save(state);
    return payment;
  }

  // 2. Ütem: Mérések, Fényképek, Dokumentumok, Megjegyzések, E-mail napló
  addMeasurement(
    guestId: string,
    input: Partial<MeasurementDto>,
  ): MeasurementDto {
    const state = this.load();
    const guest = state.guests.find((g) => g.id === guestId);
    if (!guest) throw new Error('A vendég nem található.');

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
      recordedByName: 'Recepciós Munkatárs',
    };

    guest.measurements = [created, ...(guest.measurements ?? [])];
    this.save(state);
    return created;
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
    if (!guest) throw new Error('A vendég nem található.');

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
    if (!guest) throw new Error('A vendég nem található.');

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
    throw new Error('A dokumentum nem található.');
  }

  addInternalNote(guestId: string, content: string): GuestNoteDto {
    const state = this.load();
    const guest = state.guests.find((g) => g.id === guestId);
    if (!guest) throw new Error('A vendég nem található.');

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
    if (!guest) throw new Error('A vendég nem található.');

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
      throw new Error('Az eszköz nevének megadása kötelező.');
    }
    const collision = devices.find(
      (d) =>
        d.id !== excludeDeviceId &&
        d.name.trim().toLowerCase() === trimmed.toLowerCase(),
    );
    if (collision) {
      throw new Error(
        `Már létezik "${trimmed}" nevű kijelző! Ugyanolyan nevű monitort nem lehet kétszer létrehozni.`,
      );
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
      throw new Error('Érvénytelen vagy már felhasznált 6 jegyű párosító kód.');
    }
    if (
      device.pairingExpiresAt &&
      new Date(device.pairingExpiresAt).getTime() <= Date.now()
    ) {
      throw new Error(
        'A párosító kód lejárt (10 perc után érvénytelenné válik). Kérj új kódot a recepción!',
      );
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
      throw new Error('A keresett kijelző eszköz nem található.');
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
      throw new Error('A keresett kijelző eszköz nem található.');
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
      throw new Error('A keresett kijelző eszköz nem található.');
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
        throw new Error('A megadott kijelző nem található.');
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
}

export const mockStudioEngine = new MockStudioEngine();
