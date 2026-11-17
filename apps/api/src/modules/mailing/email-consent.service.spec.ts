import { EmailCategory, MessageStatus } from '@reform/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EmailConsentService } from './email-consent.service';

const TOKEN = '6f1c2b0e-8c1a-4d6e-9d1f-0a1b2c3d4e5f';
const NOW = new Date('2026-03-10T12:00:00.000Z');

function setup(guest: Record<string, unknown> | null) {
  const prisma = {
    guest: {
      findUnique: vi.fn().mockResolvedValue(guest),
      update: vi.fn((args: unknown) => ({ op: 'guest.update', args })),
    },
    messageLog: { updateMany: vi.fn((args: unknown) => ({ op: 'messageLog.updateMany', args })) },
    $transaction: vi.fn(async (ops: unknown[]) => ops),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { prisma, service: new EmailConsentService(prisma as any) };
}

describe('EmailConsentService — leiratkozás (TICKET-55)', () => {
  let ctx: ReturnType<typeof setup>;

  beforeEach(() => {
    ctx = setup({ id: 'guest-1', firstName: 'Anna', marketingConsent: true, unsubscribedAt: null });
  });

  it('a megnyitás nem iratkoztat le, csak a keresztnevet mutatja', async () => {
    await expect(ctx.service.info(TOKEN)).resolves.toEqual({
      firstName: 'Anna',
      unsubscribed: false,
      studioName: 'Reform Studio',
    });
    expect(ctx.prisma.guest.update).not.toHaveBeenCalled();
    expect(ctx.prisma.guest.findUnique).toHaveBeenCalledWith({
      where: { unsubscribeToken: TOKEN },
      select: expect.any(Object),
    });
  });

  it('leiratkozás: a hozzájárulás visszavonva, a várakozó marketing levelek nem mennek ki', async () => {
    await expect(ctx.service.unsubscribe(TOKEN, NOW)).resolves.toMatchObject({ unsubscribed: true });

    expect(ctx.prisma.guest.update).toHaveBeenCalledWith({
      where: { id: 'guest-1' },
      data: { marketingConsent: false, marketingConsentAt: NOW, unsubscribedAt: NOW },
    });
    expect(ctx.prisma.messageLog.updateMany).toHaveBeenCalledWith({
      where: { guestId: 'guest-1', status: MessageStatus.PENDING, category: EmailCategory.MARKETING },
      data: { status: MessageStatus.FAILED, errorDetails: expect.stringMatching(/leiratkozott/) },
    });
    expect(ctx.prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('ismételt leiratkozás: az eredeti időpont megmarad', async () => {
    const earlier = new Date('2026-02-01T08:00:00.000Z');
    const again = setup({ id: 'guest-1', firstName: 'Anna', marketingConsent: false, unsubscribedAt: earlier });
    await again.service.unsubscribe(TOKEN, NOW);
    expect(again.prisma.guest.update).toHaveBeenCalledWith({
      where: { id: 'guest-1' },
      data: { marketingConsent: false, unsubscribedAt: earlier },
    });
    await expect(again.service.info(TOKEN)).resolves.toMatchObject({ unsubscribed: true });
  });

  it('érvénytelen vagy ismeretlen token: hiba, adatbázis-írás nélkül', async () => {
    await expect(ctx.service.info('nem-token')).rejects.toMatchObject({ code: 'MAIL.UNSUBSCRIBE_INVALID' });
    expect(ctx.prisma.guest.findUnique).not.toHaveBeenCalled();

    const unknown = setup(null);
    await expect(unknown.service.unsubscribe(TOKEN)).rejects.toMatchObject({
      code: 'MAIL.UNSUBSCRIBE_INVALID',
    });
    expect(unknown.prisma.$transaction).not.toHaveBeenCalled();
  });
});
