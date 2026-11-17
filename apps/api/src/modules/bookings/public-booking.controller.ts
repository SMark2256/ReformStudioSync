import { Body, Controller, Get, Headers, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { parseIdList } from './bookings.controller';
import {
  GuestCodeRequestBody,
  GuestCodeVerifyBody,
  PublicCreateBookingBody,
  PublicRescheduleBody,
  PublicWaitlistBody,
} from './bookings.dto';
import { PublicBookingService } from './public-booking.service';
import { PublicRateLimitGuard, RateLimit } from './public-rate-limit.guard';
import { WaitlistService } from './waitlist.service';

/** A kódos belépés után kapott vendég munkamenet fejléce. */
export const GUEST_SESSION_HEADER = 'x-guest-session';

/**
 * Nyilvános foglaló (TICKET-57): munkatársi belépés nélkül, címenkénti kéréskorláttal és
 * DTO-validációval. Személyes adatot csak a vendég munkamenete vagy a kezelőlink ad ki.
 */
@ApiTags('Időpontfoglalás (nyilvános)')
@Controller('public/booking')
@UseGuards(PublicRateLimitGuard)
@ApiHeader({ name: GUEST_SESSION_HEADER, required: false, description: 'Vendég munkamenet (kódos belépés után)' })
export class PublicBookingController {
  constructor(
    private readonly booking: PublicBookingService,
    private readonly waitlist: WaitlistService,
  ) {}

  @Get('catalog')
  @ApiOperation({ summary: 'Online foglalható kezelések és szabályok' })
  catalog() {
    return this.booking.catalog();
  }

  @Get('availability')
  @RateLimit(120)
  @ApiOperation({ summary: 'Szabad időpontok egy napra' })
  availability(
    @Query('day') day: string,
    @Query('treatmentIds') treatmentIds: string | string[],
    @Headers(GUEST_SESSION_HEADER) session?: string,
  ) {
    return this.booking.availability(day, parseIdList(treatmentIds), session);
  }

  @Post('bookings')
  @HttpCode(200)
  @RateLimit(10)
  @ApiOperation({ summary: 'Online foglalás (névvel, telefonnal, e-maillel, vagy bejelentkezve)' })
  create(@Body() body: PublicCreateBookingBody, @Headers(GUEST_SESSION_HEADER) session?: string) {
    return this.booking.create(body, session);
  }

  @Post('guest/code')
  @HttpCode(200)
  @RateLimit(5)
  @ApiOperation({ summary: 'Vendég belépőkód kérése e-mailben' })
  requestCode(@Body() body: GuestCodeRequestBody) {
    return this.booking.requestCode(body);
  }

  @Post('guest/verify')
  @HttpCode(200)
  @RateLimit(10)
  @ApiOperation({ summary: 'Belépés a 6 jegyű kóddal (vendég munkamenet)' })
  verifyCode(@Body() body: GuestCodeVerifyBody) {
    return this.booking.verifyCode(body);
  }

  @Get('guest/profile')
  @ApiOperation({ summary: 'A bejelentkezett vendég bérletei és foglalásai' })
  profile(@Headers(GUEST_SESSION_HEADER) session?: string) {
    return this.booking.profile(session);
  }

  @Get('manage/:token')
  @RateLimit(30)
  @ApiOperation({ summary: 'Foglalás a kezelőlinkkel' })
  manage(@Param('token') token: string) {
    return this.booking.getManaged(token);
  }

  @Get('manage/:token/availability')
  @RateLimit(60)
  @ApiOperation({ summary: 'Szabad időpontok az áthelyezéshez' })
  manageAvailability(@Param('token') token: string, @Query('day') day: string) {
    return this.booking.managedAvailability(token, day);
  }

  @Post('manage/:token/reschedule')
  @HttpCode(200)
  @RateLimit(10)
  @ApiOperation({ summary: 'Online áthelyezés (legalább 24 órával előtte)' })
  reschedule(@Param('token') token: string, @Body() body: PublicRescheduleBody) {
    return this.booking.rescheduleManaged(token, body.startsAt);
  }

  @Post('manage/:token/cancel')
  @HttpCode(200)
  @RateLimit(10)
  @ApiOperation({ summary: 'Online lemondás (legalább 24 órával előtte)' })
  cancel(@Param('token') token: string) {
    return this.booking.cancelManaged(token);
  }

  @Post('waitlist')
  @HttpCode(200)
  @RateLimit(10)
  @ApiOperation({ summary: 'Feliratkozás a várólistára (kezelés, nap, idősáv)' })
  joinWaitlist(@Body() body: PublicWaitlistBody, @Headers(GUEST_SESSION_HEADER) session?: string) {
    return this.booking.joinWaitlist(body, session);
  }

  @Get('waitlist/:token')
  @RateLimit(30)
  @ApiOperation({ summary: 'Várólistás ajánlat' })
  offer(@Param('token') token: string) {
    return this.waitlist.getOffer(token);
  }

  @Post('waitlist/:token/accept')
  @HttpCode(200)
  @RateLimit(10)
  @ApiOperation({ summary: 'Várólistás ajánlat elfogadása (foglalássá válik)' })
  async accept(@Param('token') token: string) {
    return { booking: await this.waitlist.accept(token) };
  }

  @Post('waitlist/:token/decline')
  @HttpCode(200)
  @RateLimit(10)
  @ApiOperation({ summary: 'Várólistás ajánlat elutasítása (a következő vendég jön)' })
  decline(@Param('token') token: string) {
    return this.waitlist.decline(token);
  }
}
