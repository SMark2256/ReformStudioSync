import { Injectable } from '@nestjs/common';
import {
  appError,
  EmailCategory,
  MessageStatus,
  STUDIO_DISPLAY_NAME,
  UnsubscribeInfoDto,
} from '@reform/shared';
import { PrismaService } from '../../prisma/prisma.service';

const TOKEN_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Nyilvános leiratkozás (TICKET-55) a levélben kapott, vendégenként egyedi tokennel, belépés
 * nélkül. A megnyitás (GET) nem iratkoztat le, csak a megerősítés (POST): a levelezők
 * linkellenőrzője így nem iratkoztathatja le a vendéget.
 */
@Injectable()
export class EmailConsentService {
  constructor(private readonly prisma: PrismaService) {}

  private async findGuest(token: string) {
    if (!TOKEN_PATTERN.test(token)) throw appError('MAIL.UNSUBSCRIBE_INVALID');
    const guest = await this.prisma.guest.findUnique({
      where: { unsubscribeToken: token },
      select: { id: true, firstName: true, marketingConsent: true, unsubscribedAt: true },
    });
    if (!guest) throw appError('MAIL.UNSUBSCRIBE_INVALID');
    return guest;
  }

  async info(token: string): Promise<UnsubscribeInfoDto> {
    const guest = await this.findGuest(token);
    return {
      firstName: guest.firstName,
      unsubscribed: Boolean(guest.unsubscribedAt) || !guest.marketingConsent,
      studioName: STUDIO_DISPLAY_NAME,
    };
  }

  /** Idempotens: a hozzájárulás visszavonva, a sorban várakozó marketing levelek nem mennek ki. */
  async unsubscribe(token: string, now: Date = new Date()): Promise<UnsubscribeInfoDto> {
    const guest = await this.findGuest(token);
    await this.prisma.$transaction([
      this.prisma.guest.update({
        where: { id: guest.id },
        data: {
          marketingConsent: false,
          ...(guest.marketingConsent ? { marketingConsentAt: now } : {}),
          unsubscribedAt: guest.unsubscribedAt ?? now,
        },
      }),
      this.prisma.messageLog.updateMany({
        where: {
          guestId: guest.id,
          status: MessageStatus.PENDING,
          category: EmailCategory.MARKETING,
        },
        data: {
          status: MessageStatus.FAILED,
          errorDetails: 'A vendég leiratkozott; a levél nem ment ki.',
        },
      }),
    ]);
    return { firstName: guest.firstName, unsubscribed: true, studioName: STUDIO_DISPLAY_NAME };
  }
}
