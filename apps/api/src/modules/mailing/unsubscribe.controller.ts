import { Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { EmailConsentService } from './email-consent.service';

/** Nyilvános leiratkozás (TICKET-55): belépés nélkül, a levélben kapott tokennel. */
@ApiTags('Levelezés (Mailing)')
@Controller('public/unsubscribe')
export class UnsubscribeController {
  constructor(private readonly consent: EmailConsentService) {}

  @Get(':token')
  @ApiOperation({ summary: 'A leiratkozó oldal adatai (nem iratkoztat le)' })
  info(@Param('token') token: string) {
    return this.consent.info(token);
  }

  @Post(':token')
  @HttpCode(200)
  @ApiOperation({ summary: 'Leiratkozás a marketing levelekről (idempotens)' })
  unsubscribe(@Param('token') token: string) {
    return this.consent.unsubscribe(token);
  }
}
