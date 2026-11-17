import { MembershipStatus, Role } from '@reform/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EmailCampaignsService } from './email-campaigns.service';
import type { OutboxItem } from './mail-outbox.service';

const NOW = new Date('2026-03-10T12:00:00.000Z');
const admin = {
  id: 'admin-1',
  studioId: 'default-studio',
  email: 'admin@example.hu',
  name: 'Siklódi Márk',
  role: Role.ADMIN,
};

const activeHypoxi = {
  type: 'OCCASION_BASED',
  totalPasses: 10,
  startDate: new Date('2026-03-01T00:00:00.000Z'),
  expirationDate: new Date('2026-04-30T00:00:00.000Z'),
  isFrozen: false,
  cancelledAt: null,
  serviceId: 'srv-hypoxi',
  passTemplate: { serviceId: 'srv-hypoxi' },
  usageLogs: [{ delta: -1, reversedAt: null }],
};
const depletedHypoxi = {
  ...activeHypoxi,
  totalPasses: 1,
  usageLogs: [{ delta: -1, reversedAt: null }],
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const guest = (overrides: Record<string, any> = {}) => ({
  id: 'guest-1',
  firstName: 'Anna',
  lastName: 'Kovács',
  email: 'anna@example.hu',
  marketingConsent: true,
  unsubscribedAt: null,
  unsubscribeToken: 'tok-1',
  passes: [],
  memberships: [],
  visits: [],
  ...overrides,
});

const GUESTS = [
  guest({ passes: [activeHypoxi], visits: [{ checkedInAt: new Date('2026-03-08T10:00:00.000Z') }] }),
  guest({ id: 'guest-2', firstName: 'Béla', email: null, passes: [activeHypoxi] }),
  guest({ id: 'guest-3', firstName: 'Cili', marketingConsent: false, passes: [activeHypoxi] }),
  guest({ id: 'guest-4', firstName: 'Dóra', unsubscribedAt: new Date(), passes: [activeHypoxi] }),
  guest({ id: 'guest-5', firstName: 'Edit', unsubscribeToken: 'tok-5', passes: [depletedHypoxi] }),
  guest({
    id: 'guest-6',
    firstName: 'Flóra',
    unsubscribeToken: 'tok-6',
    memberships: [{ serviceId: 'srv-circuit', status: MembershipStatus.ACTIVE }],
  }),
];

function setup() {
  const queued: OutboxItem[] = [];
  const prisma = {
    guest: { findMany: vi.fn().mockResolvedValue(GUESTS), findFirst: vi.fn() },
    emailTemplate: { findFirst: vi.fn().mockResolvedValue({ id: 'tpl-1', name: 'Tavaszi ajánlat' }) },
    auditLog: { create: vi.fn() },
  };
  const outbox = {
    enqueueMany: vi.fn(async (items: OutboxItem[]) => {
      queued.push(...items);
      return items.length;
    }),
    enqueue: vi.fn(async (item: OutboxItem) => ({ id: 'msg-1', status: 'PENDING', subject: item.email.subject })),
    kick: vi.fn(),
    unsubscribeUrl: (token: string) => `https://app.example/leiratkozas/${token}`,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = new EmailCampaignsService(prisma as any, outbox as any);
  return { prisma, outbox, service, queued };
}

describe('EmailCampaignsService — csoportos és egyéni küldés (TICKET-55)', () => {
  let ctx: ReturnType<typeof setup>;

  beforeEach(() => {
    ctx = setup();
  });

  it('előnézet: a szűrőnek megfelelők közül csak a címmel és hozzájárulással rendelkezők', async () => {
    const preview = await ctx.service.previewAudience(
      'default-studio',
      { serviceIds: ['srv-hypoxi'], passState: 'CURRENT' },
      NOW,
    );
    expect(preview.matched).toBe(4);
    expect(preview.total).toBe(1);
    expect(preview.recipients).toEqual([
      { guestId: 'guest-1', name: 'Kovács Anna', email: 'anna@example.hu' },
    ]);
    expect(preview.excluded).toEqual({ NO_EMAIL: 1, NO_CONSENT: 2 });
    expect(ctx.prisma.guest.findMany.mock.calls[0][0].where).toEqual({
      studioId: 'default-studio',
      isActive: true,
    });
  });

  it('szűrés bérletállapotra és utolsó látogatásra (elfogyott bérlet = lejárt)', async () => {
    const lapsed = await ctx.service.previewAudience('default-studio', { passState: 'LAPSED' }, NOW);
    expect(lapsed.recipients.map((r) => r.guestId)).toEqual(['guest-5']);

    const visited = await ctx.service.previewAudience(
      'default-studio',
      { lastVisit: { mode: 'WITHIN', days: 7 } },
      NOW,
    );
    expect(visited.recipients.map((r) => r.guestId)).toEqual(['guest-1']);

    const membership = await ctx.service.previewAudience(
      'default-studio',
      { serviceIds: ['srv-circuit'], passState: 'CURRENT' },
      NOW,
    );
    expect(membership.recipients.map((r) => r.guestId)).toEqual(['guest-6']);
  });

  it('küldés: csak a jóváhagyott és most is jogosult címzettek, vendégenkénti leiratkozó linkkel', async () => {
    const result = await ctx.service.sendBulk(
      {
        filter: { passState: 'ANY' },
        guestIds: ['guest-1', 'guest-3', 'guest-5', 'ismeretlen'],
        subject: 'Tavaszi ajánlat, {{keresztnev}}',
        bodyHtml: '<p>Kedves {{keresztnev}}!</p><script>x</script>',
        templateId: 'tpl-1',
      },
      admin,
      NOW,
    );

    expect(result).toMatchObject({ queued: 2, skipped: 2 });
    expect(ctx.queued.map((i) => i.guestId)).toEqual(['guest-1', 'guest-5']);
    const [anna, edit] = ctx.queued;
    expect(anna).toMatchObject({
      messageType: 'BULK',
      templateName: 'Tavaszi ajánlat',
      batchId: result.batchId,
      createdById: 'admin-1',
    });
    expect(anna.email.subject).toBe('Tavaszi ajánlat, Anna');
    expect(anna.email.html).not.toContain('<script');
    expect(anna.email.html).toContain('leiratkozas/tok-1');
    expect(edit.email.html).toContain('leiratkozas/tok-5');
    expect(ctx.prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'BULK_EMAIL_QUEUED', entityId: result.batchId }),
    });
    expect(ctx.outbox.kick).toHaveBeenCalled();
  });

  it('ha senki nem kaphatja meg (pl. közben leiratkozott), nincs küldés', async () => {
    await expect(
      ctx.service.sendBulk(
        { filter: {}, guestIds: ['guest-3', 'guest-4'], subject: 'Hír', bodyHtml: '<p>Szia</p>' },
        admin,
        NOW,
      ),
    ).rejects.toMatchObject({ code: 'MAIL.NO_RECIPIENTS' });
    expect(ctx.outbox.enqueueMany).not.toHaveBeenCalled();
  });

  it('egyéni levél: cím nélkül hiba, címmel tranzakciós levél leiratkozó link nélkül', async () => {
    ctx.prisma.guest.findFirst.mockResolvedValueOnce({ id: 'guest-2', firstName: 'Béla', lastName: 'Kiss', email: null });
    await expect(
      ctx.service.sendToGuest('guest-2', { subject: 'Időpont', bodyHtml: '<p>Szia</p>' }, admin),
    ).rejects.toMatchObject({ code: 'MAIL.GUEST_NO_EMAIL' });

    ctx.prisma.guest.findFirst.mockResolvedValueOnce(null);
    await expect(
      ctx.service.sendToGuest('nincs', { subject: 'Időpont', bodyHtml: '<p>Szia</p>' }, admin),
    ).rejects.toMatchObject({ code: 'GUEST.NOT_FOUND' });

    ctx.prisma.guest.findFirst.mockResolvedValueOnce({
      id: 'guest-1',
      firstName: 'Anna',
      lastName: 'Kovács',
      email: ' anna@example.hu ',
    });
    await ctx.service.sendToGuest(
      'guest-1',
      { subject: 'Időpont, {{keresztnev}}', bodyHtml: '<p>Holnap 10-kor várunk.</p>' },
      admin,
    );
    const item = ctx.outbox.enqueue.mock.calls[0][0];
    expect(item).toMatchObject({
      guestId: 'guest-1',
      recipientEmail: 'anna@example.hu',
      messageType: 'MANUAL',
      createdById: 'admin-1',
    });
    expect(item.email.subject).toBe('Időpont, Anna');
    expect(item.email.html).not.toContain('leiratkozas');
    expect(ctx.prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'GUEST_EMAIL_QUEUED', entityId: 'guest-1' }),
    });
  });
});
