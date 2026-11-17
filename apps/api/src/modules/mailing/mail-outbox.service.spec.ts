import { appError, EmailCategory, MessageStatus } from '@reform/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MailOutboxService, OutboxItem } from './mail-outbox.service';

const NOW = new Date('2026-03-10T10:00:00.000Z');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const row = (overrides: Record<string, any> = {}) => ({
  id: 'msg-1',
  studioId: 'default-studio',
  guestId: 'guest-1',
  recipientEmail: 'anna@example.hu',
  recipientName: 'Kovács Anna',
  subject: 'Szia Anna',
  messageType: 'MANUAL',
  category: EmailCategory.TRANSACTIONAL,
  status: MessageStatus.PENDING,
  html: '<p>Szia</p>',
  text: 'Szia',
  templateId: null,
  templateName: null,
  batchId: null,
  dedupeKey: null,
  attempts: 0,
  nextAttemptAt: NOW,
  lastAttemptAt: null,
  createdById: null,
  createdAt: NOW,
  sentAt: null,
  errorDetails: null,
  ...overrides,
});

function setup(env: Record<string, unknown> = {}) {
  const prisma = {
    messageLog: {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      update: vi.fn().mockImplementation(async ({ data }) => ({ ...row(), ...data, guest: null, createdBy: null })),
      create: vi.fn(),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    guest: { findUnique: vi.fn() },
  };
  const mail = { isConfigured: true, send: vi.fn().mockResolvedValue(undefined) };
  const config = { get: (key: string) => ({ MAIL_HOURLY_LIMIT: 10, PUBLIC_WEB_URL: 'https://app.example/', ...env })[key] };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = new MailOutboxService(prisma as any, mail as any, config as any);
  return { prisma, mail, service };
}

describe('MailOutboxService — kimenő sor (TICKET-55)', () => {
  let ctx: ReturnType<typeof setup>;

  beforeEach(() => {
    ctx = setup();
  });

  it('az óránkénti korlát: csak a maradék keretnyi levelet veszi elő, a tranzakciósat előre', async () => {
    ctx.prisma.messageLog.count.mockResolvedValue(8);
    await ctx.service.processDue(NOW);

    expect(ctx.prisma.messageLog.count).toHaveBeenCalledWith({
      where: { status: MessageStatus.SENT, sentAt: { gte: new Date('2026-03-10T09:00:00.000Z') } },
    });
    const args = ctx.prisma.messageLog.findMany.mock.calls[0][0];
    expect(args.take).toBe(2);
    expect(args.where).toEqual({ status: MessageStatus.PENDING, nextAttemptAt: { lte: NOW } });
    expect(args.orderBy[0]).toEqual({ category: 'asc' });
  });

  it('elfogyott keretnél és beállítatlan levélküldőnél nem küld', async () => {
    ctx.prisma.messageLog.count.mockResolvedValue(10);
    await expect(ctx.service.processDue(NOW)).resolves.toBe(0);
    expect(ctx.prisma.messageLog.findMany).not.toHaveBeenCalled();

    const unconfigured = setup();
    unconfigured.mail.isConfigured = false;
    await expect(unconfigured.service.processDue(NOW)).resolves.toBe(0);
    expect(unconfigured.prisma.messageLog.count).not.toHaveBeenCalled();
  });

  it('az env-ben megadott korlát érvényes', async () => {
    const custom = setup({ MAIL_HOURLY_LIMIT: 50 });
    custom.prisma.messageLog.count.mockResolvedValue(8);
    await custom.service.processDue(NOW);
    expect(custom.prisma.messageLog.findMany.mock.calls[0][0].take).toBe(42);
  });

  it('sikeres küldés: foglalás feltétellel, majd elküldve', async () => {
    ctx.prisma.messageLog.findMany.mockResolvedValue([row()]);
    await expect(ctx.service.processDue(NOW)).resolves.toBe(1);

    expect(ctx.prisma.messageLog.updateMany).toHaveBeenCalledWith({
      where: { id: 'msg-1', status: MessageStatus.PENDING, attempts: 0 },
      data: {
        attempts: 1,
        lastAttemptAt: NOW,
        nextAttemptAt: new Date('2026-03-10T10:05:00.000Z'),
      },
    });
    expect(ctx.mail.send).toHaveBeenCalledWith(
      { email: 'anna@example.hu', name: 'Kovács Anna' },
      { subject: 'Szia Anna', html: '<p>Szia</p>', text: 'Szia' },
    );
    expect(ctx.prisma.messageLog.update).toHaveBeenCalledWith({
      where: { id: 'msg-1' },
      data: expect.objectContaining({ status: MessageStatus.SENT, errorDetails: null }),
    });
  });

  it('ha a foglalás elveszett (más futás vitte), nem küld kétszer', async () => {
    ctx.prisma.messageLog.findMany.mockResolvedValue([row()]);
    ctx.prisma.messageLog.updateMany.mockResolvedValue({ count: 0 });
    await expect(ctx.service.processDue(NOW)).resolves.toBe(0);
    expect(ctx.mail.send).not.toHaveBeenCalled();
  });

  it('hibánál várakozik és később újrapróbál, az utolsó próbálkozás után végleg hibás', async () => {
    ctx.mail.send.mockRejectedValue(appError('AUTH.MAIL_UNAVAILABLE'));
    ctx.prisma.messageLog.findMany.mockResolvedValue([row({ attempts: 1 })]);
    await ctx.service.processDue(NOW);

    expect(ctx.prisma.messageLog.updateMany.mock.calls[0][0].data.nextAttemptAt).toEqual(
      new Date('2026-03-10T10:10:00.000Z'),
    );
    const retry = ctx.prisma.messageLog.update.mock.calls[0][0].data;
    expect(retry.status).toBe(MessageStatus.PENDING);
    expect(retry.errorDetails).toMatch(/SendPulse/);
    expect(retry.errorDetails).toMatch(/Újrapróbálás 11:10-kor \(2\/5\)/);

    ctx.prisma.messageLog.update.mockClear();
    ctx.prisma.messageLog.findMany.mockResolvedValue([row({ attempts: 4 })]);
    await ctx.service.processDue(NOW);
    const final = ctx.prisma.messageLog.update.mock.calls[0][0].data;
    expect(final.status).toBe(MessageStatus.FAILED);
    expect(final.errorDetails).toMatch(/5 próbálkozás után/);
  });

  it('marketing levél: ha a vendég közben leiratkozott, nem megy ki', async () => {
    ctx.prisma.messageLog.findMany.mockResolvedValue([row({ category: EmailCategory.MARKETING, messageType: 'BULK' })]);
    ctx.prisma.guest.findUnique.mockResolvedValue({
      email: 'anna@example.hu',
      marketingConsent: false,
      unsubscribedAt: new Date('2026-03-09T10:00:00.000Z'),
    });
    await ctx.service.processDue(NOW);

    expect(ctx.mail.send).not.toHaveBeenCalled();
    expect(ctx.prisma.messageLog.update.mock.calls[0][0].data).toMatchObject({
      status: MessageStatus.FAILED,
      errorDetails: expect.stringMatching(/hozzájárul/),
    });
  });

  it('marketing levél hozzájárulással kimegy', async () => {
    ctx.prisma.messageLog.findMany.mockResolvedValue([row({ category: EmailCategory.MARKETING })]);
    ctx.prisma.guest.findUnique.mockResolvedValue({
      email: 'anna@example.hu',
      marketingConsent: true,
      unsubscribedAt: null,
    });
    await expect(ctx.service.processDue(NOW)).resolves.toBe(1);
    expect(ctx.mail.send).toHaveBeenCalledTimes(1);
  });

  it('egyszerre egy futás: a párhuzamos hívás ugyanazt az eredményt kapja', async () => {
    ctx.prisma.messageLog.findMany.mockResolvedValue([row()]);
    const [a, b] = await Promise.all([ctx.service.processDue(NOW), ctx.service.processDue(NOW)]);
    expect(a).toBe(1);
    expect(b).toBe(1);
    expect(ctx.mail.send).toHaveBeenCalledTimes(1);
  });

  it('kötegelt felvétel: a dupla kulcsú sor kimarad, a kategória a forrásból jön', async () => {
    const item: OutboxItem = {
      studioId: 'default-studio',
      guestId: 'guest-1',
      recipientEmail: 'anna@example.hu',
      recipientName: 'Kovács Anna',
      messageType: 'BIRTHDAY',
      email: { subject: 'Boldog szülinapot', html: '<p>x</p>', text: 'x' },
      dedupeKey: 'BIRTHDAY:guest-1:2026',
    };
    ctx.prisma.messageLog.createMany.mockResolvedValue({ count: 1 });
    await expect(ctx.service.enqueueMany([item])).resolves.toBe(1);
    const args = ctx.prisma.messageLog.createMany.mock.calls[0][0];
    expect(args.skipDuplicates).toBe(true);
    expect(args.data[0]).toMatchObject({
      category: EmailCategory.MARKETING,
      status: MessageStatus.PENDING,
      dedupeKey: 'BIRTHDAY:guest-1:2026',
    });
    await expect(ctx.service.enqueueMany([])).resolves.toBe(0);
  });

  it('csak hibás levél küldhető újra, elölről kezdett próbálkozással', async () => {
    ctx.prisma.messageLog.findFirst.mockResolvedValueOnce(row({ status: MessageStatus.SENT }));
    await expect(ctx.service.retry('msg-1', 'default-studio')).rejects.toMatchObject({
      code: 'MAIL.NOT_RETRYABLE',
    });

    ctx.prisma.messageLog.findFirst.mockResolvedValueOnce(null);
    await expect(ctx.service.retry('msg-x', 'default-studio')).rejects.toMatchObject({
      code: 'MAIL.MESSAGE_NOT_FOUND',
    });

    ctx.prisma.messageLog.findFirst.mockResolvedValueOnce(row({ status: MessageStatus.FAILED, attempts: 5 }));
    const result = await ctx.service.retry('msg-1', 'default-studio');
    expect(ctx.prisma.messageLog.update.mock.calls[0][0].data).toMatchObject({
      status: MessageStatus.PENDING,
      attempts: 0,
      errorDetails: null,
    });
    expect(result.status).toBe(MessageStatus.PENDING);
  });

  it('a leiratkozó link a webapp címére mutat', () => {
    expect(ctx.service.unsubscribeUrl('abc-123')).toBe('https://app.example/leiratkozas/abc-123');
  });
});
