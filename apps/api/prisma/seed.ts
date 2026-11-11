import {
  DocumentStatus,
  DocumentType,
  GuestStatus,
  MembershipDueStatus,
  MembershipStatus,
  MessageStatus,
  PassType,
  PaymentMethod,
  Prisma,
  PrismaClient,
  Role,
  ServiceCategory,
  VisitType,
} from '@prisma/client';
import {
  formatPeriod,
  getDueDate,
  getMembershipDueSchedule,
  getStudioDate,
  MembershipStatus as SharedMembershipStatus,
} from '@reform/shared';

/**
 * Alap- és demóadatok (TICKET-27): munkatársak (TICKET-35: jelszó nélkül, kóddal lépnek be), szolgáltatások, bérletsablonok és a
 * recepció „Gyors tesztkódok” gombjaihoz tartozó 6 tesztvendég, a böngészős mock
 * (`apps/web/src/shared/api/mock-engine.ts`) forgatókönyveivel.
 *
 * Idempotens és nem töröl: a szolgáltatás, a sablon (név szerint) és a vendég
 * (vonalkód szerint) csak akkor jön létre, ha még nincs. Egy meglévő tesztvendég
 * forgatókönyvét a seed nem írja felül; a dátumok a létrehozás pillanatához
 * képest relatívak. Frissítés (pl. hetekkel később, hogy a késési sávok újra
 * stimmeljenek): `SEED_DEMO_RESET=1` — ez CSAK a 6 tesztvendéget (vonalkód + név
 * egyezéssel) és a hozzájuk tartozó adatokat törli, majd létrehozza újra.
 */

const prisma = new PrismaClient();

const studioId = 'default-studio';
const DAY_MS = 24 * 60 * 60 * 1000;
const now = new Date();
const resetDemo = process.env.SEED_DEMO_RESET === '1';

const daysAgo = (days: number) => new Date(now.getTime() - days * DAY_MS);
const minutesAgo = (minutes: number) => new Date(now.getTime() - minutes * 60 * 1000);

const today = getStudioDate(now);
const todayMmDd = `${String(today.month).padStart(2, '0')}-${String(today.day).padStart(2, '0')}`;
const dateOnly = (year: number, month: number, day: number) =>
  new Date(Date.UTC(year, month - 1, day));

/**
 * Tagsági demóadat: a kezdés napja az esedékesség napja, így a havi pótlás
 * (getMembershipDueSchedule) nem gyárt korábbi, fiktív tartozást (a mock párja).
 */
function billing(daysBack: number) {
  const day = getStudioDate(daysAgo(daysBack));
  return {
    dueDay: day.day,
    period: formatPeriod(day.year, day.month),
    dueDate: getDueDate(day.year, day.month, day.day),
  };
}

function sampleSvgDataUrl(label: string, colorHex: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="320" viewBox="0 0 480 320"><rect width="480" height="320" rx="20" fill="${colorHex}"/><circle cx="240" cy="125" r="46" fill="rgba(255,255,255,0.22)"/><rect x="170" y="185" width="140" height="65" rx="18" fill="rgba(255,255,255,0.22)"/><text x="240" y="285" font-family="sans-serif" font-size="16" font-weight="bold" fill="#ffffff" text-anchor="middle">${label}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// ---------------------------------------------------------------------------
// Törzsadatok
// ---------------------------------------------------------------------------

const STAFF: { email: string; name: string; role: Role }[] = [
  { email: 'smark.siklodi@gmail.com', name: 'Siklódi Márk', role: Role.ADMIN },
  { email: 'b.siklodi@mediajam.hu', name: 'Siklódi Brigi', role: Role.ADMIN },
  // Tesztkörnyezetben (rögzített belépőkóddal) az E2E saját munkatársa.
  ...(process.env.AUTH_FIXED_LOGIN_CODE
    ? [{ email: 'e2e@reformstudio.test', name: 'E2E Tesztmunkatárs', role: Role.RECEPTIONIST }]
    : []),
];

const LEGACY_STAFF_EMAILS = ['admin@reformstudio.hu', 'recepcio@reformstudio.hu'];

const SERVICES = [
  { name: 'Női Köredzés (Havi Tagság)', category: ServiceCategory.CIRCUIT, durationMinutes: 45, priceHuf: 22000 },
  { name: 'Hypoxi', category: ServiceCategory.BODY_SHAPING, durationMinutes: 30, priceHuf: 9500 },
  { name: 'Reformer Pilates', category: ServiceCategory.BODY_SHAPING, durationMinutes: 50, priceHuf: 6500 },
  { name: 'Ultrahangos Kavitációs Zsírbontás', category: ServiceCategory.BODY_SHAPING, durationMinutes: 40, priceHuf: 12000 },
  { name: 'Hialuronos Arckezelés & Rádiófrekvencia', category: ServiceCategory.COSMETIC, durationMinutes: 60, priceHuf: 16500 },
] as const;

type ServiceName = (typeof SERVICES)[number]['name'];

const TEMPLATES: {
  name: string;
  serviceName: ServiceName | null;
  type: PassType;
  totalPasses: number | null;
  durationDays: number;
  price: number;
}[] = [
  // Az eredeti seed sablonjai (szolgáltatáshoz nem kötöttek).
  { name: '1 Alkalmas Napijegy', serviceName: null, type: PassType.OCCASION_BASED, totalPasses: 1, durationDays: 7, price: 6500 },
  { name: '5 Alkalmas Reformer Bérlet', serviceName: null, type: PassType.OCCASION_BASED, totalPasses: 5, durationDays: 35, price: 29000 },
  { name: '10 Alkalmas Reformer Bérlet', serviceName: null, type: PassType.OCCASION_BASED, totalPasses: 10, durationDays: 60, price: 54000 },
  { name: 'Havi Korlátlan Reformer Bérlet', serviceName: null, type: PassType.TIME_BASED, totalPasses: null, durationDays: 30, price: 69000 },
  // A mock sablonjai.
  { name: '10 Alkalmas Hypoxi Bérlet', serviceName: 'Hypoxi', type: PassType.OCCASION_BASED, totalPasses: 10, durationDays: 60, price: 79000 },
  { name: '5 Alkalmas Alakformáló / Kavitációs Bérlet', serviceName: 'Ultrahangos Kavitációs Zsírbontás', type: PassType.OCCASION_BASED, totalPasses: 5, durationDays: 45, price: 49000 },
  { name: '5 Alkalmas Prémium Kozmetikai Bérlet', serviceName: 'Hialuronos Arckezelés & Rádiófrekvencia', type: PassType.OCCASION_BASED, totalPasses: 5, durationDays: 60, price: 68000 },
  { name: 'Havi Korlátlan Köredzés Bérlet', serviceName: 'Női Köredzés (Havi Tagság)', type: PassType.TIME_BASED, totalPasses: null, durationDays: 30, price: 22000 },
];

// ---------------------------------------------------------------------------
// Tesztvendégek forgatókönyvei
// ---------------------------------------------------------------------------

interface DeductionSpec {
  daysAgo: number;
  note?: string;
}

interface PassSpec {
  templateName: string;
  serviceName: ServiceName;
  startDaysAgo: number;
  /** Lejárat napokban a mostani időponthoz képest (negatív = lejárt). */
  expiresInDays: number;
  /** Ennyi érvényes levonás van összesen; a `deductions`-ön felülieket a seed egyenletesen elosztja. */
  usedCount: number;
  deductions?: DeductionSpec[];
  frozenDaysAgo?: number;
  freezeNote?: string;
  /** Az eladási befizetés ideje és módja (alapból a bérlet kezdete, bankkártya). */
  sale?: { at: Date; method: PaymentMethod };
}

interface MembershipSpec {
  monthlyFeeHuf: number;
  /** Hány napja volt az első (forgatókönyv szerinti) esedékesség. */
  billingDaysAgo: number;
  createdDaysAgo: number;
  status: MembershipStatus;
  pausedDaysAgo?: number;
  /** Az első esedékességre befizetett összeg, és mikor (alapból az esedékesség napján). */
  paid?: { amountHuf: number; at?: Date; method: PaymentMethod };
}

interface GuestSpec {
  barcode: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  birthDate: Date;
  nameDay: string;
  status: GuestStatus;
  notes: string;
  createdDaysAgo: number;
  membership?: MembershipSpec;
  passes: PassSpec[];
  /** Mai köredzés-beléptetés (tagság), ennyi perce. */
  circuitCheckInMinutesAgo?: number;
  extras?: (guestId: string, staffId: string, tx: Prisma.TransactionClient) => Promise<void>;
}

const DEMO_GUESTS: GuestSpec[] = [
  {
    barcode: '100001',
    firstName: 'Anna',
    lastName: 'Kovács',
    email: 'anna.kovacs@reform.hu',
    phone: '+36 30 412 8891',
    birthDate: dateOnly(1991, today.month, today.day), // mai születésnapos (KPI)
    nameDay: '07-26',
    status: GuestStatus.ACTIVE,
    notes: 'Köredzés havi tag + Hypoxi alakformáló kúra (kedd/csütörtök)',
    createdDaysAgo: 90,
    membership: {
      monthlyFeeHuf: 22000,
      billingDaysAgo: 5,
      createdDaysAgo: 60,
      status: MembershipStatus.ACTIVE,
      paid: { amountHuf: 22000, method: PaymentMethod.POS_CARD },
    },
    passes: [
      {
        templateName: '10 Alkalmas Hypoxi Bérlet',
        serviceName: 'Hypoxi',
        startDaysAgo: 20,
        expiresInDays: 40,
        usedCount: 3,
        deductions: [
          { daysAgo: 12, note: 'Kezelés: Hypoxi (30 perc)' },
          { daysAgo: 7, note: 'Kezelés: Hypoxi (30 perc)' },
          { daysAgo: 3, note: 'Kezelés: Hypoxi (30 perc)' },
        ],
        // A mockban a mai kasszában szerepel.
        sale: { at: minutesAgo(120), method: PaymentMethod.POS_CARD },
      },
      {
        templateName: '5 Alkalmas Prémium Kozmetikai Bérlet',
        serviceName: 'Hialuronos Arckezelés & Rádiófrekvencia',
        startDaysAgo: 10,
        expiresInDays: 50,
        usedCount: 1,
        deductions: [{ daysAgo: 6, note: 'Kezelés: Hialuronos Arckezelés' }],
      },
    ],
    circuitCheckInMinutesAgo: 45,
    extras: async (guestId, staffId, tx) => {
      await tx.measurement.createMany({
        data: [
          {
            guestId,
            recordedById: staffId,
            measuredAt: daysAgo(20),
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
          },
          {
            guestId,
            recordedById: staffId,
            measuredAt: daysAgo(2),
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
          },
        ],
      });

      const hypoxi = await tx.service.findFirst({ where: { studioId, name: 'Hypoxi' } });
      await tx.guestPhoto.createMany({
        data: [
          {
            guestId,
            serviceId: hypoxi?.id ?? null,
            takenAt: daysAgo(20),
            fileUrl: sampleSvgDataUrl('Kovács Anna • Előtte (1. hét)', '#047857'),
            mimeType: 'image/webp',
            originalSizeBytes: 4820400,
            compressedSizeBytes: 88400,
            width: 1200,
            height: 800,
            visibilityRole: Role.RECEPTIONIST,
            note: 'Hypoxi kúra előtti állapotfotó (WebP optimalizált)',
          },
          {
            guestId,
            serviceId: hypoxi?.id ?? null,
            takenAt: daysAgo(2),
            fileUrl: sampleSvgDataUrl('Kovács Anna • Kontroll (3. hét)', '#0f766e'),
            mimeType: 'image/webp',
            originalSizeBytes: 5190200,
            compressedSizeBytes: 91200,
            width: 1200,
            height: 800,
            visibilityRole: Role.RECEPTIONIST,
            note: '3. heti kontrollfotó (-3 cm derékbőség)',
          },
        ],
      });

      await tx.guestDocument.createMany({
        data: [
          {
            guestId,
            documentType: DocumentType.GDPR_CONSENT,
            title: 'GDPR Adatkezelési Nyilatkozat és Házirend Elfogadás',
            contentText:
              'Alulírott Kovács Anna hozzájárulok a RE-FORM Stúdió nyilvántartási rendszerében történő adatkezeléshez, a vonalkódos beléptetéshez és a kezelési előzmények rögzítéséhez.',
            fieldsJson: JSON.stringify({
              allergia: 'Nincs',
              ellenjavallat: 'Nincs ismert kontraindikáció',
            }),
            signatureDataUrl: sampleSvgDataUrl('Kovács Anna (Aláírva)', '#1e293b'),
            signedAt: daysAgo(20),
            status: DocumentStatus.SIGNED,
            createdAt: daysAgo(20),
          },
          {
            guestId,
            documentType: DocumentType.HEALTH_QUESTIONNAIRE,
            title: 'Hypoxi & Alakformáló Kezelési Állapotfelmérő Ív',
            contentText:
              'Kijelentem, hogy a Hypoxi vákuumos alakformáló kezelés egészségügyi tájékoztatóját megismertem, terhesség, trombózis vagy akut keringési betegség nem áll fenn.',
            fieldsJson: JSON.stringify({
              vernyomas: 'Normál (120/80)',
              napiFolyadek: '2.5 liter',
            }),
            signatureDataUrl: null,
            signedAt: null,
            status: DocumentStatus.PENDING_SIGNATURE,
            createdAt: daysAgo(1),
          },
        ],
      });

      await tx.guestNote.create({
        data: {
          guestId,
          authorId: staffId,
          content: 'Minden alkalommal M-es méretű Hypoxi szoknyát használ.',
          createdAt: daysAgo(14),
        },
      });

      await tx.messageLog.create({
        data: {
          guestId,
          recipientEmail: 'anna.kovacs@reform.hu',
          subject: 'RE-FORM Stúdió — Bérletvásárlás visszaigazolás',
          messageType: 'PASS_PURCHASE_CONFIRMATION',
          status: MessageStatus.DELIVERED,
          sentAt: daysAgo(20),
        },
      });
    },
  },
  {
    barcode: '100002',
    firstName: 'Péter',
    lastName: 'Nagy',
    email: 'peter.nagy@reform.hu',
    phone: '+36 70 331 5520',
    birthDate: dateOnly(1988, 4, 12),
    nameDay: todayMmDd, // mai névnapos (KPI)
    status: GuestStatus.ACTIVE,
    notes: '1-5 napos tagdíj késés + utolsó 1 alkalmas bérlet teszteléséhez',
    createdDaysAgo: 45,
    membership: {
      monthlyFeeHuf: 22000,
      billingDaysAgo: 3, // 3 napja lejárt → 1–5 napos sáv
      createdDaysAgo: 35,
      status: MembershipStatus.ACTIVE,
    },
    passes: [
      {
        templateName: '5 Alkalmas Alakformáló / Kavitációs Bérlet',
        serviceName: 'Ultrahangos Kavitációs Zsírbontás',
        startDaysAgo: 28,
        expiresInDays: 2,
        usedCount: 4, // 1 alkalom maradt
        deductions: [{ daysAgo: 4, note: 'Kezelés: Ultrahangos Kavitációs Zsírbontás' }],
      },
    ],
  },
  {
    barcode: '100003',
    firstName: 'Eszter',
    lastName: 'Szabó',
    email: 'eszter.szabo@reform.hu',
    phone: '+36 20 981 1140',
    birthDate: dateOnly(1995, 11, 8),
    nameDay: '05-24',
    status: GuestStatus.ACTIVE,
    notes: 'Érvényes Reformer bérlet (2 alkalom maradt), tartozás nélkül',
    createdDaysAgo: 60,
    passes: [
      {
        templateName: '10 Alkalmas Reformer Bérlet',
        serviceName: 'Reformer Pilates',
        startDaysAgo: 40,
        expiresInDays: 20,
        usedCount: 8,
      },
    ],
  },
  {
    barcode: '100004',
    firstName: 'Gábor',
    lastName: 'Tóth',
    email: 'gabor.toth@reform.hu',
    phone: '+36 30 774 2019',
    birthDate: dateOnly(1984, 2, 19),
    nameDay: '03-24',
    status: GuestStatus.ACTIVE,
    notes: '15 nap feletti tartozás + lejárt bérlet teszteléséhez',
    createdDaysAgo: 70,
    membership: {
      monthlyFeeHuf: 24000,
      billingDaysAgo: 21, // 21 napja lejárt → 15 nap feletti sáv
      createdDaysAgo: 70,
      status: MembershipStatus.ACTIVE,
    },
    passes: [
      {
        templateName: '10 Alkalmas Reformer Bérlet',
        serviceName: 'Reformer Pilates',
        startDaysAgo: 65,
        expiresInDays: -5, // lejárt, 3 alkalom bent maradt
        usedCount: 7,
      },
    ],
  },
  {
    barcode: '100005',
    firstName: 'Zsófia',
    lastName: 'Varga',
    email: 'zsofia.varga@reform.hu',
    phone: '+36 30 611 9082',
    birthDate: dateOnly(1993, 9, 14),
    nameDay: '05-15',
    status: GuestStatus.ACTIVE,
    notes: '6-15 napos részbefizetett tagdíj + kimerült (0 alkalmas) bérlet',
    createdDaysAgo: 60,
    membership: {
      monthlyFeeHuf: 20000,
      billingDaysAgo: 9, // 9 napja esedékes → 6–15 napos sáv, részbefizetéssel
      createdDaysAgo: 60,
      status: MembershipStatus.ACTIVE,
      paid: { amountHuf: 10000, at: minutesAgo(90), method: PaymentMethod.CASH },
    },
    passes: [
      {
        templateName: '5 Alkalmas Alakformáló / Kavitációs Bérlet',
        serviceName: 'Ultrahangos Kavitációs Zsírbontás',
        startDaysAgo: 20,
        expiresInDays: 15,
        usedCount: 5,
      },
    ],
  },
  {
    barcode: '100006',
    firstName: 'Dóra',
    lastName: 'Horváth',
    email: 'dora.horvath@reform.hu',
    phone: '+36 20 449 3210',
    birthDate: dateOnly(1990, 6, 5),
    nameDay: '02-06',
    status: GuestStatus.PAUSED,
    notes: 'Síbaleset miatt szüneteltetett tagság és fagyasztott bérlet',
    createdDaysAgo: 20,
    membership: {
      monthlyFeeHuf: 22000,
      billingDaysAgo: 5,
      createdDaysAgo: 40,
      status: MembershipStatus.PAUSED,
      pausedDaysAgo: 4,
      paid: { amountHuf: 22000, method: PaymentMethod.POS_CARD },
    },
    passes: [
      {
        templateName: '10 Alkalmas Hypoxi Bérlet',
        serviceName: 'Hypoxi',
        startDaysAgo: 18,
        expiresInDays: 42,
        usedCount: 2,
        frozenDaysAgo: 4,
        freezeNote: 'Síbaleset / térdsérülés',
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Létrehozás
// ---------------------------------------------------------------------------

type Tx = Prisma.TransactionClient;

/** Kezelés levonása úgy, ahogy az API rögzíti: látogatás + beléptetés + −1-es naplósor. */
async function createDeduction(
  tx: Tx,
  data: {
    guestId: string;
    guestPassId: string;
    serviceId: string;
    staffId: string;
    at: Date;
    note: string;
  },
) {
  const visit = await tx.visit.create({
    data: {
      studioId,
      guestId: data.guestId,
      checkedInAt: data.at,
      visitType: VisitType.TREATMENT,
      employeeId: data.staffId,
    },
  });
  const checkIn = await tx.loggedCheckIn.create({
    data: {
      studioId,
      guestId: data.guestId,
      guestPassId: data.guestPassId,
      userId: data.staffId,
      visitType: VisitType.TREATMENT,
      status: 'SUCCESS',
      visitId: visit.id,
      createdAt: data.at,
    },
  });
  await tx.passUsageLog.create({
    data: {
      guestPassId: data.guestPassId,
      guestId: data.guestId,
      serviceId: data.serviceId,
      employeeId: data.staffId,
      delta: -1,
      usedAt: data.at,
      checkInId: checkIn.id,
      note: data.note,
    },
  });
}

async function createPass(
  tx: Tx,
  guestId: string,
  staffId: string,
  spec: PassSpec,
  templates: Map<string, { id: string; price: Prisma.Decimal }>,
  services: Map<string, string>,
) {
  const template = templates.get(spec.templateName);
  const serviceId = services.get(spec.serviceName);
  if (!template || !serviceId) {
    throw new Error(`Hiányzó sablon vagy szolgáltatás: ${spec.templateName}`);
  }
  const totalPasses = (await tx.passTemplate.findUniqueOrThrow({ where: { id: template.id } }))
    .totalPasses;
  const remaining = totalPasses === null ? null : Math.max(0, totalPasses - spec.usedCount);
  const startDate = daysAgo(spec.startDaysAgo);

  const pass = await tx.guestPass.create({
    data: {
      studioId,
      guestId,
      passTemplateId: template.id,
      serviceId,
      type: totalPasses === null ? PassType.TIME_BASED : PassType.OCCASION_BASED,
      totalPasses,
      remainingPasses: remaining,
      startDate,
      expirationDate: daysAgo(-spec.expiresInDays),
      // `isPassOpen`: nincs sztornó és van alkalom (a lejárat/fagyasztás a számolt állapotban).
      isActive: remaining === null || remaining > 0,
      isFrozen: spec.frozenDaysAgo !== undefined,
      frozenAt: spec.frozenDaysAgo !== undefined ? daysAgo(spec.frozenDaysAgo) : null,
      createdAt: startDate,
    },
  });

  // Eladás: vásárlási naplósor + befizetés + allokáció (a `sellPass` párja).
  await tx.passUsageLog.create({
    data: {
      guestPassId: pass.id,
      guestId,
      serviceId,
      employeeId: staffId,
      delta: totalPasses ?? 0,
      usedAt: startDate,
      note: `Bérlet vásárlás: ${spec.templateName}`,
    },
  });
  const sale = spec.sale ?? { at: startDate, method: PaymentMethod.POS_CARD };
  const amount = Number(template.price);
  await tx.payment.create({
    data: {
      studioId,
      guestId,
      guestPassId: pass.id,
      recordedByUserId: staffId,
      amount,
      paymentMethod: sale.method,
      note: `${spec.templateName} értékesítés`,
      createdAt: sale.at,
      allocations: { create: { passId: pass.id, amountHuf: Math.round(amount) } },
    },
  });

  // Levonások: a megadottak, a többi egyenletesen a kezdés és most között (a mock párja).
  const explicit = spec.deductions ?? [];
  const missing = spec.usedCount - explicit.length;
  const span = now.getTime() - startDate.getTime();
  const serviceNote = `Kezelés: ${spec.serviceName}`;
  const deductions = [
    ...Array.from({ length: Math.max(0, missing) }, (_, i) => ({
      at: new Date(startDate.getTime() + (span * (i + 1)) / (missing + 2)),
      note: serviceNote,
    })),
    ...explicit.map((d) => ({ at: daysAgo(d.daysAgo), note: d.note ?? serviceNote })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());

  for (const d of deductions) {
    // Fagyasztott bérletnél a levonások a fagyasztás előttiek.
    const at =
      spec.frozenDaysAgo !== undefined && d.at > daysAgo(spec.frozenDaysAgo)
        ? daysAgo(spec.frozenDaysAgo + 1)
        : d.at;
    await createDeduction(tx, { guestId, guestPassId: pass.id, serviceId, staffId, at, note: d.note });
  }

  if (spec.frozenDaysAgo !== undefined) {
    await tx.passUsageLog.create({
      data: {
        guestPassId: pass.id,
        guestId,
        serviceId,
        employeeId: staffId,
        delta: 0,
        usedAt: daysAgo(spec.frozenDaysAgo),
        note: `Bérlet fagyasztva${spec.freezeNote ? `: ${spec.freezeNote}` : ''}`,
      },
    });
  }
}

async function createMembership(tx: Tx, guestId: string, staffId: string, spec: MembershipSpec) {
  const first = billing(spec.billingDaysAgo);
  const pausedAt = spec.pausedDaysAgo !== undefined ? daysAgo(spec.pausedDaysAgo) : null;
  // Ugyanaz az ütemezés, mint a `createMembership` / havi pótlás az API-n.
  const schedule = getMembershipDueSchedule(
    {
      startDate: first.dueDate,
      dueDay: first.dueDay,
      status: spec.status as unknown as SharedMembershipStatus,
      pausedAt,
    },
    now,
  );

  const membership = await tx.membership.create({
    data: {
      studioId,
      guestId,
      monthlyFeeHuf: spec.monthlyFeeHuf,
      startDate: first.dueDate,
      dueDay: first.dueDay,
      status: spec.status,
      pausedAt,
      createdAt: daysAgo(spec.createdDaysAgo),
      dues: {
        create: schedule.map(({ period, dueDate }) => ({
          period,
          dueDate,
          amountHuf: spec.monthlyFeeHuf,
          paidAmountHuf: 0,
          status: MembershipDueStatus.PENDING,
          createdAt: dueDate < now ? dueDate : now,
        })),
      },
    },
    include: { dues: true },
  });

  if (!spec.paid) return;
  const due = membership.dues.find((d) => d.period === first.period);
  if (!due) return;

  // Befizetés a `recordPayment` szabályával: PAID, ha fedezi, különben PARTIAL.
  const paidAmount = spec.paid.amountHuf;
  const isFull = paidAmount >= due.amountHuf;
  await tx.membershipDue.update({
    where: { id: due.id },
    data: {
      paidAmountHuf: paidAmount,
      status: isFull ? MembershipDueStatus.PAID : MembershipDueStatus.PARTIAL,
    },
  });
  await tx.payment.create({
    data: {
      studioId,
      guestId,
      recordedByUserId: staffId,
      amount: paidAmount,
      paymentMethod: spec.paid.method,
      note: `Havi tagdíj befizetés (${due.period})${isFull ? '' : ' [Részbefizetés]'}`,
      createdAt: spec.paid.at ?? due.dueDate,
      allocations: { create: { membershipDueId: due.id, amountHuf: paidAmount } },
    },
  });
}

async function createDemoGuest(
  spec: GuestSpec,
  staffId: string,
  templates: Map<string, { id: string; price: Prisma.Decimal }>,
  services: Map<string, string>,
) {
  await prisma.$transaction(
    async (tx) => {
      const guest = await tx.guest.create({
        data: {
          studioId,
          barcode: spec.barcode,
          firstName: spec.firstName,
          lastName: spec.lastName,
          email: spec.email,
          phone: spec.phone,
          birthDate: spec.birthDate,
          nameDay: spec.nameDay,
          status: spec.status,
          notes: spec.notes,
          createdAt: daysAgo(spec.createdDaysAgo),
        },
      });

      if (spec.membership) {
        await createMembership(tx, guest.id, staffId, spec.membership);
      }
      for (const pass of spec.passes) {
        await createPass(tx, guest.id, staffId, pass, templates, services);
      }

      if (spec.circuitCheckInMinutesAgo !== undefined) {
        const at = minutesAgo(spec.circuitCheckInMinutesAgo);
        const visit = await tx.visit.create({
          data: {
            studioId,
            guestId: guest.id,
            checkedInAt: at,
            visitType: VisitType.CIRCUIT_TRAINING,
            employeeId: staffId,
          },
        });
        await tx.loggedCheckIn.create({
          data: {
            studioId,
            guestId: guest.id,
            guestPassId: null,
            userId: staffId,
            visitType: VisitType.CIRCUIT_TRAINING,
            status: 'SUCCESS',
            visitId: visit.id,
            createdAt: at,
          },
        });
      }

      await spec.extras?.(guest.id, staffId, tx);
    },
    { timeout: 60_000 },
  );
}

/** Csak a seed saját tesztvendégét törli (vonalkód + név egyezés), a hozzá tartozó adatokkal. */
async function deleteDemoGuest(guestId: string) {
  await prisma.$transaction(async (tx) => {
    // A befizetés és a beléptetés nem kaszkádol a vendégről; az allokáció a befizetésről igen.
    await tx.payment.deleteMany({ where: { guestId } });
    await tx.passUsageLog.deleteMany({ where: { guestId } });
    await tx.loggedCheckIn.deleteMany({ where: { guestId } });
    await tx.guest.delete({ where: { id: guestId } });
  });
}

async function main() {
  // Munkatársak (Megrendelő, 2026-11-11): létrehozza vagy frissíti, jelszó nélkül.
  const staff = await Promise.all(
    STAFF.map((member) =>
      prisma.user.upsert({
        where: { email: member.email },
        update: { name: member.name, role: member.role, isActive: true },
        create: { studioId, ...member },
      }),
    ),
  );
  const [owner] = staff;

  // A régi seed munkatársakra befizetések, belépések hivatkoznak: nem töröljük, csak letiltjuk.
  const { count: deactivatedLegacyStaff } = await prisma.user.updateMany({
    where: { email: { in: LEGACY_STAFF_EMAILS }, isActive: true },
    data: { isActive: false },
  });

  // Szolgáltatások: név szerint, a meglévőket nem módosítjuk.
  const services = new Map<string, string>();
  let createdServices = 0;
  for (const srv of SERVICES) {
    const existing = await prisma.service.findFirst({ where: { studioId, name: srv.name } });
    if (existing) {
      services.set(srv.name, existing.id);
      continue;
    }
    const created = await prisma.service.create({ data: { studioId, ...srv } });
    services.set(srv.name, created.id);
    createdServices++;
  }

  // Bérletsablonok: név szerint, a meglévőket nem módosítjuk.
  const templates = new Map<string, { id: string; price: Prisma.Decimal }>();
  let createdTemplates = 0;
  for (const { serviceName, ...tpl } of TEMPLATES) {
    const existing = await prisma.passTemplate.findFirst({ where: { studioId, name: tpl.name } });
    if (existing) {
      templates.set(tpl.name, existing);
      continue;
    }
    const created = await prisma.passTemplate.create({
      data: {
        studioId,
        ...tpl,
        serviceId: serviceName ? (services.get(serviceName) ?? null) : null,
      },
    });
    templates.set(tpl.name, created);
    createdTemplates++;
  }

  // Tesztvendégek: vonalkód szerint; meglévőt csak SEED_DEMO_RESET=1 esetén építünk újra.
  const guestResults: string[] = [];
  for (const spec of DEMO_GUESTS) {
    const label = `${spec.barcode} ${spec.lastName} ${spec.firstName}`;
    const existing = await prisma.guest.findUnique({
      where: { studioId_barcode: { studioId, barcode: spec.barcode } },
    });
    if (existing) {
      const isSeedGuest =
        existing.lastName === spec.lastName && existing.firstName === spec.firstName;
      if (!isSeedGuest) {
        guestResults.push(`${label}: kihagyva (a vonalkód másik vendégé: ${existing.lastName} ${existing.firstName})`);
        continue;
      }
      if (!resetDemo) {
        guestResults.push(`${label}: már létezik, változatlan`);
        continue;
      }
      await deleteDemoGuest(existing.id);
    }
    await createDemoGuest(spec, owner.id, templates, services);
    guestResults.push(`${label}: ${existing ? 'újra létrehozva' : 'létrehozva'}`);
  }

  const initAudit = await prisma.auditLog.findFirst({
    where: { studioId, action: 'SYSTEM_INIT', entityType: 'Studio', entityId: studioId },
  });
  if (!initAudit) {
    await prisma.auditLog.create({
      data: {
        studioId,
        userId: owner.id,
        action: 'SYSTEM_INIT',
        entityType: 'Studio',
        entityId: studioId,
        details: 'RE-FORM Stúdió recepciós rendszer inicializálva.',
      },
    });
  }

  console.log('Seed completed:', {
    staff: staff.map((u) => u.email),
    deactivatedLegacyStaff,
    createdServices,
    createdTemplates,
    guests: guestResults,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
