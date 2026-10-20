import {
  CheckInResultPayload,
  CheckInRevokedPayload,
  CheckInStatus,
  CheckInWarningCode,
  DailyFinanceSummaryDto,
  DEFAULT_STUDIO_ID,
  DisplayDeviceDto,
  DUPLICATE_SCAN_COOLDOWN_SECONDS,
  EXPIRING_SOON_THRESHOLD_DAYS,
  GuestDto,
  GuestPassDto,
  LoggedCheckInDto,
  OfflineScanItemDto,
  OfflineSyncResponseDto,
  PairDisplayResponseDto,
  PassTemplateDto,
  PassType,
  PaymentDto,
  PaymentMethod,
} from '@reform/shared';
import { broadcastToLocalMonitors } from '../hooks/useMonitorChannel';

const STORAGE_KEY = 'reform-studio-mock-sandbox-v1';

export interface MockDatabaseState {
  templates: PassTemplateDto[];
  guests: GuestDto[];
  checkIns: LoggedCheckInDto[];
  payments: PaymentDto[];
  devices: DisplayDeviceDto[];
}

function addDays(base: Date, days: number): string {
  return new Date(base.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

export function createInitialMockDatabase(): MockDatabaseState {
  const now = new Date();

  const templates: PassTemplateDto[] = [
    {
      id: 'tpl-1',
      studioId: DEFAULT_STUDIO_ID,
      name: '1 Alkalmas Napijegy',
      type: PassType.OCCASION_BASED,
      totalPasses: 1,
      durationDays: 7,
      price: 6500,
      isActive: true,
      createdAt: addDays(now, -30),
    },
    {
      id: 'tpl-5',
      studioId: DEFAULT_STUDIO_ID,
      name: '5 Alkalmas Reformer Bérlet',
      type: PassType.OCCASION_BASED,
      totalPasses: 5,
      durationDays: 35,
      price: 29000,
      isActive: true,
      createdAt: addDays(now, -30),
    },
    {
      id: 'tpl-10',
      studioId: DEFAULT_STUDIO_ID,
      name: '10 Alkalmas Reformer Bérlet',
      type: PassType.OCCASION_BASED,
      totalPasses: 10,
      durationDays: 60,
      price: 54000,
      isActive: true,
      createdAt: addDays(now, -30),
    },
    {
      id: 'tpl-unlimited',
      studioId: DEFAULT_STUDIO_ID,
      name: 'Havi Korlátlan Reformer Bérlet',
      type: PassType.TIME_BASED,
      totalPasses: null,
      durationDays: 30,
      price: 69000,
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
      notes: 'Haladó Reformer csoport (kedd/csütörtök)',
      isActive: true,
      createdAt: addDays(now, -45),
      updatedAt: addDays(now, -2),
      passes: [
        {
          id: 'pass-1',
          studioId: DEFAULT_STUDIO_ID,
          guestId: 'guest-1',
          passTemplateId: 'tpl-10',
          passTemplateName: '10 Alkalmas Reformer Bérlet',
          type: PassType.OCCASION_BASED,
          totalPasses: 10,
          remainingPasses: 6,
          startDate: addDays(now, -20),
          expirationDate: addDays(now, 40),
          isActive: true,
          isFrozen: false,
          frozenAt: null,
          createdAt: addDays(now, -20),
          usageLogs: [
            {
              id: 'ulog-1',
              guestPassId: 'pass-1',
              delta: 10,
              usedAt: addDays(now, -20),
              note: 'Bérlet vásárlás: 10 Alkalmas Reformer Bérlet',
            },
            {
              id: 'ulog-2',
              guestPassId: 'pass-1',
              delta: -1,
              usedAt: addDays(now, -5),
              note: 'Vonalkódos beléptetés',
            },
          ],
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
      notes: 'Utolsó alkalmas bérlet teszteléséhez (1 alkalom maradt)',
      isActive: true,
      createdAt: addDays(now, -30),
      updatedAt: addDays(now, -1),
      passes: [
        {
          id: 'pass-2',
          studioId: DEFAULT_STUDIO_ID,
          guestId: 'guest-2',
          passTemplateId: 'tpl-5',
          passTemplateName: '5 Alkalmas Reformer Bérlet',
          type: PassType.OCCASION_BASED,
          totalPasses: 5,
          remainingPasses: 1,
          startDate: addDays(now, -28),
          expirationDate: addDays(now, 2),
          isActive: true,
          isFrozen: false,
          frozenAt: null,
          createdAt: addDays(now, -28),
          usageLogs: [
            {
              id: 'ulog-3',
              guestPassId: 'pass-2',
              delta: 5,
              usedAt: addDays(now, -28),
              note: 'Bérlet vásárlás: 5 Alkalmas Reformer Bérlet',
            },
          ],
        },
      ],
    },
    {
      id: 'guest-3',
      studioId: DEFAULT_STUDIO_ID,
      barcode: '100003',
      firstName: 'Eszter',
      lastName: 'Szabó',
      email: 'eszter.szabo@reform.hu',
      phone: '+36 20 981 1140',
      notes: 'VIP Havi Korlátlan bérletes vendég',
      isActive: true,
      createdAt: addDays(now, -60),
      updatedAt: addDays(now, -3),
      passes: [
        {
          id: 'pass-3',
          studioId: DEFAULT_STUDIO_ID,
          guestId: 'guest-3',
          passTemplateId: 'tpl-unlimited',
          passTemplateName: 'Havi Korlátlan Reformer Bérlet',
          type: PassType.TIME_BASED,
          totalPasses: null,
          remainingPasses: null,
          startDate: addDays(now, -10),
          expirationDate: addDays(now, 20),
          isActive: true,
          isFrozen: false,
          frozenAt: null,
          createdAt: addDays(now, -10),
          usageLogs: [
            {
              id: 'ulog-4',
              guestPassId: 'pass-3',
              delta: 0,
              usedAt: addDays(now, -10),
              note: 'Bérlet vásárlás: Havi Korlátlan Reformer Bérlet',
            },
          ],
        },
      ],
    },
    {
      id: 'guest-4',
      studioId: DEFAULT_STUDIO_ID,
      barcode: '100004',
      firstName: 'Gábor',
      lastName: 'Tóth',
      email: 'gabor.toth@reform.hu',
      phone: '+36 30 774 2019',
      notes: 'Lejárt bérlet teszteléséhez',
      isActive: true,
      createdAt: addDays(now, -70),
      updatedAt: addDays(now, -10),
      passes: [
        {
          id: 'pass-4',
          studioId: DEFAULT_STUDIO_ID,
          guestId: 'guest-4',
          passTemplateId: 'tpl-10',
          passTemplateName: '10 Alkalmas Reformer Bérlet',
          type: PassType.OCCASION_BASED,
          totalPasses: 10,
          remainingPasses: 3,
          startDate: addDays(now, -65),
          expirationDate: addDays(now, -5),
          isActive: true,
          isFrozen: false,
          frozenAt: null,
          createdAt: addDays(now, -65),
          usageLogs: [],
        },
      ],
    },
    {
      id: 'guest-5',
      studioId: DEFAULT_STUDIO_ID,
      barcode: '100005',
      firstName: 'Judit',
      lastName: 'Varga',
      email: 'judit.varga@reform.hu',
      phone: '+36 30 611 9082',
      notes: 'Elfogyott alkalmas bérlet (0 maradt)',
      isActive: true,
      createdAt: addDays(now, -25),
      updatedAt: addDays(now, -2),
      passes: [
        {
          id: 'pass-5',
          studioId: DEFAULT_STUDIO_ID,
          guestId: 'guest-5',
          passTemplateId: 'tpl-5',
          passTemplateName: '5 Alkalmas Reformer Bérlet',
          type: PassType.OCCASION_BASED,
          totalPasses: 5,
          remainingPasses: 0,
          startDate: addDays(now, -20),
          expirationDate: addDays(now, 15),
          isActive: false,
          isFrozen: false,
          frozenAt: null,
          createdAt: addDays(now, -20),
          usageLogs: [],
        },
      ],
    },
    {
      id: 'guest-6',
      studioId: DEFAULT_STUDIO_ID,
      barcode: '100006',
      firstName: 'Dóra',
      lastName: 'Horváth',
      email: 'dora.horvath@reform.hu',
      phone: '+36 20 449 3210',
      notes: 'Síbaleset miatt fagyasztott bérlet',
      isActive: true,
      createdAt: addDays(now, -20),
      updatedAt: addDays(now, -4),
      passes: [
        {
          id: 'pass-6',
          studioId: DEFAULT_STUDIO_ID,
          guestId: 'guest-6',
          passTemplateId: 'tpl-10',
          passTemplateName: '10 Alkalmas Reformer Bérlet',
          type: PassType.OCCASION_BASED,
          totalPasses: 10,
          remainingPasses: 8,
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
              delta: 0,
              usedAt: addDays(now, -4),
              note: 'Bérlet fagyasztva: Síbaleset / térdsérülés',
            },
          ],
        },
      ],
    },
  ];

  const payments: PaymentDto[] = [
    {
      id: 'pay-1',
      studioId: DEFAULT_STUDIO_ID,
      guestId: 'guest-1',
      guestName: 'Kovács Anna',
      guestPassId: 'pass-1',
      passName: '10 Alkalmas Reformer Bérlet',
      recordedByUserId: 'staff-default-1',
      recordedByName: 'Recepciós Munkatárs',
      amount: 54000,
      paymentMethod: PaymentMethod.POS_CARD,
      isCancelled: false,
      note: '10 Alkalmas Reformer Bérlet értékesítés',
      createdAt: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: 'pay-2',
      studioId: DEFAULT_STUDIO_ID,
      guestId: 'guest-3',
      guestName: 'Szabó Eszter',
      guestPassId: 'pass-3',
      passName: 'Havi Korlátlan Reformer Bérlet',
      recordedByUserId: 'staff-default-1',
      recordedByName: 'Recepciós Munkatárs',
      amount: 69000,
      paymentMethod: PaymentMethod.CASH,
      isCancelled: false,
      note: 'Havi Korlátlan Reformer Bérlet értékesítés',
      createdAt: new Date(now.getTime() - 90 * 60 * 1000).toISOString(),
    },
  ];

  const checkIns: LoggedCheckInDto[] = [
    {
      id: 'chk-initial-1',
      studioId: DEFAULT_STUDIO_ID,
      guestId: 'guest-3',
      guestName: 'Szabó Eszter',
      guestBarcode: '100003',
      guestPassId: 'pass-3',
      passName: 'Havi Korlátlan Reformer Bérlet',
      userId: 'staff-default-1',
      staffName: 'Recepciós Munkatárs',
      status: CheckInStatus.SUCCESS,
      reason: null,
      createdAt: new Date(now.getTime() - 45 * 60 * 1000).toISOString(),
    },
  ];

  return {
    templates,
    guests,
    checkIns,
    payments,
    devices: [
      {
        id: 'dev-1',
        name: 'Recepciós Pult Másodlagos Monitor',
        pairingCode: null,
        isActive: true,
        lastSeenAt: now.toISOString(),
        createdAt: addDays(now, -15),
      },
    ],
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
      return JSON.parse(raw) as MockDatabaseState;
    } catch {
      return createInitialMockDatabase();
    }
  }

  private save(state: MockDatabaseState) {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  resetDatabase(): MockDatabaseState {
    const initial = createInitialMockDatabase();
    this.save(initial);
    return initial;
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

  createGuest(input: {
    firstName: string;
    lastName: string;
    barcode?: string;
    email?: string;
    phone?: string;
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
      notes: input.notes?.trim() || null,
      isActive: true,
      createdAt: now,
      updatedAt: now,
      passes: [],
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
    type: PassType;
    totalPasses?: number | null;
    durationDays: number;
    price: number;
  }): PassTemplateDto {
    const state = this.load();
    const tpl: PassTemplateDto = {
      id: `tpl-${Date.now()}`,
      studioId: DEFAULT_STUDIO_ID,
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

    const newPass: GuestPassDto = {
      id: `pass-${Date.now()}`,
      studioId: DEFAULT_STUDIO_ID,
      guestId: guest.id,
      passTemplateId: template.id,
      passTemplateName: template.name,
      type: template.type,
      totalPasses: template.totalPasses,
      remainingPasses: template.totalPasses,
      startDate: now.toISOString(),
      expirationDate: exp.toISOString(),
      isActive: true,
      isFrozen: false,
      frozenAt: null,
      createdAt: now.toISOString(),
      usageLogs: [
        {
          id: `ulog-${Date.now()}`,
          guestPassId: `pass-${Date.now()}`,
          delta: template.totalPasses ?? 0,
          usedAt: now.toISOString(),
          note: `Bérlet vásárlás: ${template.name}`,
        },
      ],
    };

    guest.passes = [newPass, ...(guest.passes ?? [])];

    const payment: PaymentDto = {
      id: `pay-${Date.now()}`,
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
    };

    state.payments.unshift(payment);
    this.save(state);

    return {
      pass: newPass,
      paymentId: payment.id,
      amount,
    };
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

  scanCheckIn(input: {
    barcode: string;
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
          status: CheckInStatus.DUPLICATE_SCAN,
          guestId: guest.id,
          barcode: guest.barcode,
          guestName: guestFullName,
          passName: activePass?.passTemplateName,
          passType: activePass?.type,
          remainingPasses:
            activePass?.type === PassType.TIME_BASED
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

    if (!activePass) {
      const hasFrozen = passes.some(
        (p) => p.isActive && p.isFrozen && new Date(p.expirationDate) >= now,
      );
      const reason = hasFrozen
        ? 'A vendég bérlete jelenleg fagyasztva van (szünetel).'
        : 'Nincs érvényes bérlet (lejárt vagy elfogytak az alkalmak)!';
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
        status: CheckInStatus.DENIED,
        guestId: guest.id,
        barcode: guest.barcode,
        guestName: guestFullName,
        reason,
        warnings: [],
        suggestedRenewalTemplateId: lastPass?.passTemplateId ?? 'tpl-10',
        timestamp: now.toISOString(),
      };

      broadcastToLocalMonitors({
        type: 'CHECKIN_RESULT',
        payload: deniedPayload,
      });
      return deniedPayload;
    }

    let newRemaining: number | 'Korlátlan' = 'Korlátlan';
    if (activePass.type === PassType.OCCASION_BASED) {
      const nextRem = Math.max(0, (activePass.remainingPasses ?? 1) - 1);
      activePass.remainingPasses = nextRem;
      if (nextRem <= 0) {
        activePass.isActive = false;
      }
      newRemaining = nextRem;
      activePass.usageLogs = [
        {
          id: `ulog-${Date.now()}`,
          guestPassId: activePass.id,
          delta: -1,
          usedAt: now.toISOString(),
          note: 'Vonalkódos beléptetés',
        },
        ...(activePass.usageLogs ?? []),
      ];
    }

    const checkInLog: LoggedCheckInDto = {
      id: `chk-${Date.now()}`,
      studioId: DEFAULT_STUDIO_ID,
      guestId: guest.id,
      guestName: guestFullName,
      guestBarcode: guest.barcode,
      guestPassId: activePass.id,
      passName: activePass.passTemplateName ?? 'Bérlet',
      userId: 'staff-default-1',
      staffName: 'Recepciós Munkatárs',
      status: CheckInStatus.SUCCESS,
      reason: null,
      createdAt: now.toISOString(),
    };

    state.checkIns.unshift(checkInLog);
    this.save(state);

    const warnings: CheckInWarningCode[] = [];
    if (
      activePass.type === PassType.OCCASION_BASED &&
      typeof newRemaining === 'number' &&
      newRemaining <= 1
    ) {
      warnings.push('LAST_OCCASION');
    }
    const daysLeft = Math.ceil(
      (new Date(activePass.expirationDate).getTime() - now.getTime()) /
        (24 * 60 * 60 * 1000),
    );
    if (daysLeft <= EXPIRING_SOON_THRESHOLD_DAYS) {
      warnings.push('EXPIRING_SOON');
    }

    const successPayload: CheckInResultPayload = {
      checkInId: checkInLog.id,
      status: CheckInStatus.SUCCESS,
      guestId: guest.id,
      barcode: guest.barcode,
      guestName: guestFullName,
      passName: activePass.passTemplateName,
      passType: activePass.type,
      remainingPasses: newRemaining,
      totalPasses: activePass.totalPasses,
      expirationDate: activePass.expirationDate,
      warnings,
      suggestedRenewalTemplateId: activePass.passTemplateId,
      timestamp: now.toISOString(),
    };

    broadcastToLocalMonitors({
      type: 'CHECKIN_RESULT',
      payload: successPayload,
    });
    return successPayload;
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
    if (guest && checkIn.guestPassId) {
      const pass = (guest.passes ?? []).find(
        (p) => p.id === checkIn.guestPassId,
      );
      if (pass && pass.type === PassType.OCCASION_BASED) {
        pass.remainingPasses = (pass.remainingPasses ?? 0) + 1;
        pass.isActive = true;
        restoredRemaining = pass.remainingPasses;
        pass.usageLogs = [
          {
            id: `ulog-${Date.now()}`,
            guestPassId: pass.id,
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
              delta: 0,
              usedAt: new Date().toISOString(),
              note: `Fizetés és bérlet sztornózva${reason ? `: ${reason}` : ''}`,
            },
            ...(pass.usageLogs ?? []),
          ];
        }
      }
    }

    this.save(state);
    return payment;
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

  initDisplayPairing(name: string): DisplayDeviceDto {
    const state = this.load();
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const device: DisplayDeviceDto = {
      id: `dev-${Date.now()}`,
      name: name.trim(),
      pairingCode: code,
      isActive: true,
      lastSeenAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };
    state.devices.unshift(device);
    this.save(state);
    return device;
  }

  verifyDisplayPairing(pairingCode: string): PairDisplayResponseDto {
    const state = this.load();
    const device = state.devices.find(
      (d) => d.pairingCode === pairingCode.trim() && d.isActive,
    );
    if (!device) {
      throw new Error('Érvénytelen vagy már felhasznált 6 jegyű párosító kód.');
    }
    device.pairingCode = null;
    device.lastSeenAt = new Date().toISOString();
    this.save(state);

    return {
      deviceToken: `mock-device-token-${device.id}`,
      device,
    };
  }

  getDisplayDevices(): DisplayDeviceDto[] {
    return this.load().devices;
  }
}

export const mockStudioEngine = new MockStudioEngine();
