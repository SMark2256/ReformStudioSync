import { EmailAutomationKind, Role } from '@reform/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EmailAutomationsService } from './email-automations.service';
import type { OutboxItem } from './mail-outbox.service';

const admin = {
  id: 'admin-1',
  studioId: 'default-studio',
  email: 'admin@example.hu',
  name: 'Siklódi Márk',
  role: Role.ADMIN,
};
const template = {
  id: 'tpl-1',
  name: 'Születésnapi köszöntő',
  subject: 'Boldog születésnapot, {{keresztnev}}!',
  bodyHtml: '<p>Kedves {{keresztnev}}!</p>',
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const automation = (overrides: Record<string, any> = {}) => ({
  id: 'auto-1',
  studioId: 'default-studio',
  kind: EmailAutomationKind.BIRTHDAY,
  enabled: true,
  templateId: template.id,
  template,
  enabledAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  ...overrides,
});
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const guest = (overrides: Record<string, any> = {}) => ({
  id: 'guest-1',
  studioId: 'default-studio',
  email: 'anna@example.hu',
  firstName: 'Anna',
  lastName: 'Kovács',
  birthDate: new Date('1990-03-10T00:00:00.000Z'),
  nameDay: '07-26',
  unsubscribeToken: '6f1c2b0e-8c1a-4d6e-9d1f-0a1b2c3d4e5f',
  ...overrides,
});

function setup() {
  const queued: OutboxItem[][] = [];
  const prisma = {
    emailAutomation: {
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn().mockImplementation(async ({ data }) => ({ ...automation(), ...data })),
    },
    emailTemplate: { findFirst: vi.fn().mockResolvedValue({ id: template.id }) },
    guest: { findMany: vi.fn().mockResolvedValue([]) },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prisma.$transaction.mockImplementation(async (cb: (tx: any) => unknown) => cb(prisma));
  // A dedupe kulcs egyedisége: a már sorba került kulcs másodszor nem jön létre.
  const seen = new Set<string>();
  const outbox = {
    enqueueMany: vi.fn(async (items: OutboxItem[]) => {
      queued.push(items);
      let created = 0;
      for (const item of items) {
        if (item.dedupeKey && seen.has(item.dedupeKey)) continue;
        if (item.dedupeKey) seen.add(item.dedupeKey);
        created += 1;
      }
      return created;
    }),
    kick: vi.fn(),
    unsubscribeUrl: (token: string) => `https://app.example/leiratkozas/${token}`,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = new EmailAutomationsService(prisma as any, outbox as any);
  return { prisma, outbox, service, queued };
}

describe('EmailAutomationsService — automatikus levelek (TICKET-55)', () => {
  let ctx: ReturnType<typeof setup>;
  const morning = new Date('2026-03-10T08:00:00.000Z'); // 09:00 Budapesten

  beforeEach(() => {
    ctx = setup();
  });

  it('születésnap: a ma születésnapos, hozzájáruló vendég kap levelet, marketingként, leiratkozó linkkel', async () => {
    ctx.prisma.emailAutomation.findMany.mockResolvedValue([automation()]);
    ctx.prisma.guest.findMany.mockResolvedValue([guest(), guest({ id: 'guest-2', birthDate: new Date('1985-05-01T00:00:00.000Z') })]);

    await expect(ctx.service.runDaily(morning)).resolves.toBe(1);

    expect(ctx.prisma.guest.findMany.mock.calls[0][0].where).toMatchObject({
      isActive: true,
      email: { not: null },
      marketingConsent: true,
      unsubscribedAt: null,
      birthDate: { not: null },
    });
    const [item] = ctx.queued[0];
    expect(item).toMatchObject({
      guestId: 'guest-1',
      messageType: 'BIRTHDAY',
      templateId: 'tpl-1',
      templateName: 'Születésnapi köszöntő',
      dedupeKey: 'BIRTHDAY:guest-1:2026',
    });
    expect(item.email.subject).toBe('Boldog születésnapot, Anna!');
    expect(item.email.html).toContain('leiratkozas/6f1c2b0e-8c1a-4d6e-9d1f-0a1b2c3d4e5f');
    expect(ctx.outbox.kick).toHaveBeenCalled();
  });

  it('a futás megismételhető (újraindítás után is): ugyanaz a köszöntő nem kerül be kétszer', async () => {
    ctx.prisma.emailAutomation.findMany.mockResolvedValue([automation()]);
    ctx.prisma.guest.findMany.mockResolvedValue([guest()]);

    await expect(ctx.service.runDaily(morning)).resolves.toBe(1);
    await expect(ctx.service.runDaily(new Date('2026-03-10T15:00:00.000Z'))).resolves.toBe(0);
    // Másnap pótlásként újra előjön, de a kulcs ugyanaz: nem megy ki újra.
    await expect(ctx.service.runDaily(new Date('2026-03-11T08:00:00.000Z'))).resolves.toBe(0);
    expect(ctx.queued.flat().map((i) => i.dedupeKey)).toEqual([
      'BIRTHDAY:guest-1:2026',
      'BIRTHDAY:guest-1:2026',
      'BIRTHDAY:guest-1:2026',
    ]);
  });

  it('kimaradt nap pótlása: a tegnapi születésnapos is megkapja, de a bekapcsolás előtti nem', async () => {
    ctx.prisma.emailAutomation.findMany.mockResolvedValue([
      automation({ enabledAt: new Date('2026-03-09T07:00:00.000Z') }),
    ]);
    ctx.prisma.guest.findMany.mockResolvedValue([
      guest({ id: 'tegnapi', birthDate: new Date('1990-03-09T00:00:00.000Z') }),
      guest({ id: 'tegnapelotti', birthDate: new Date('1990-03-08T00:00:00.000Z') }),
    ]);
    await ctx.service.runDaily(morning);
    expect(ctx.queued[0].map((i) => i.guestId)).toEqual(['tegnapi']);
  });

  it('névnap: a `nameDay` szerint, a nap reggel 8 előtt még nem', async () => {
    ctx.prisma.emailAutomation.findMany.mockResolvedValue([
      automation({ kind: EmailAutomationKind.NAME_DAY, enabledAt: new Date('2026-07-26T00:00:00.000Z') }),
    ]);
    ctx.prisma.guest.findMany.mockResolvedValue([guest()]);

    await expect(ctx.service.runDaily(new Date('2026-07-26T04:00:00.000Z'))).resolves.toBe(0); // 06:00 Budapest
    await expect(ctx.service.runDaily(new Date('2026-07-26T07:00:00.000Z'))).resolves.toBe(1); // 09:00 Budapest
    expect(ctx.prisma.guest.findMany.mock.calls[0][0].where).toMatchObject({ nameDay: { not: null } });
    expect(ctx.queued.flat()[0].dedupeKey).toBe('NAME_DAY:guest-1:2026');
  });

  it('üdvözlő levél: bekapcsolva, sablonnal, a vendég címére, tranzakciósan (hozzájárulás nélkül)', async () => {
    ctx.prisma.emailAutomation.findUnique.mockResolvedValue(
      automation({ kind: EmailAutomationKind.WELCOME, template: { ...template, subject: 'Üdv, {{keresztnev}}' } }),
    );
    await ctx.service.onGuestCreated(guest());

    const [item] = ctx.queued[0];
    expect(item).toMatchObject({ messageType: 'WELCOME', dedupeKey: 'WELCOME:guest-1' });
    expect(item.email.subject).toBe('Üdv, Anna');
    expect(item.email.html).not.toContain('leiratkozas');
  });

  it('üdvözlő levél nem megy: kikapcsolva, cím nélkül, és a hiba nem buktatja a felvételt', async () => {
    ctx.prisma.emailAutomation.findUnique.mockResolvedValue(
      automation({ kind: EmailAutomationKind.WELCOME, enabled: false }),
    );
    await ctx.service.onGuestCreated(guest());
    await ctx.service.onGuestCreated(guest({ email: null }));
    expect(ctx.outbox.enqueueMany).not.toHaveBeenCalled();

    ctx.prisma.emailAutomation.findUnique.mockRejectedValue(new Error('db down'));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.spyOn((ctx.service as any).logger, 'error').mockImplementation(() => undefined);
    await expect(ctx.service.onGuestCreated(guest())).resolves.toBeUndefined();
  });

  it('sablon nélkül nem kapcsolható be; bekapcsoláskor indul a pótlás ideje', async () => {
    ctx.prisma.emailAutomation.findUniqueOrThrow.mockResolvedValue(
      automation({ enabled: false, templateId: null, template: null, enabledAt: null }),
    );
    await expect(
      ctx.service.update(EmailAutomationKind.BIRTHDAY, { enabled: true }, admin),
    ).rejects.toMatchObject({ code: 'MAIL.AUTOMATION_TEMPLATE_REQUIRED' });

    const now = new Date('2026-03-10T10:00:00.000Z');
    await ctx.service.update(EmailAutomationKind.BIRTHDAY, { enabled: true, templateId: 'tpl-1' }, admin, now);
    expect(ctx.prisma.emailAutomation.update.mock.calls[0][0].data).toEqual({
      enabled: true,
      templateId: 'tpl-1',
      enabledAt: now,
    });
    expect(ctx.prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'EMAIL_AUTOMATION_UPDATED', userId: 'admin-1' }),
    });
  });

  it('másik stúdió sablonja nem rendelhető hozzá', async () => {
    ctx.prisma.emailAutomation.findUniqueOrThrow.mockResolvedValue(automation());
    ctx.prisma.emailTemplate.findFirst.mockResolvedValue(null);
    await expect(
      ctx.service.update(EmailAutomationKind.BIRTHDAY, { templateId: 'idegen' }, admin),
    ).rejects.toMatchObject({ code: 'MAIL.TEMPLATE_NOT_FOUND' });
  });
});
