import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { appError, AuthUserDto, parseTimeOfDay, toStudioDayKey } from '@reform/shared';
import { CurrentUser } from '../../common/current-user.decorator';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { RolesGuard } from '../../common/roles.guard';
import {
  CancelBookingDto,
  CreateClosureDto,
  CreateStaffBookingDto,
  CreateStaffWaitlistDto,
  ReorderTreatmentsDto,
  RescheduleBookingDto,
  UpdateBookingSettingsDto,
  UpdateBookingStatusDto,
  UpdateResourceDto,
  UpdateTreatmentDto,
  UpsertHolidayOverrideDto,
} from './bookings.dto';
import { BookingsService } from './bookings.service';
import { CalendarSyncService } from './calendar-sync.service';
import { WaitlistService } from './waitlist.service';

/** `a,b,c` vagy ismételt query paraméter → azonosítók listája. */
export function parseIdList(value: string | string[] | undefined): string[] {
  const raw = Array.isArray(value) ? value : value ? [value] : [];
  return raw
    .flatMap((v) => v.split(','))
    .map((v) => v.trim())
    .filter(Boolean)
    .slice(0, 10);
}

@ApiTags('Időpontfoglalás (recepció)')
@Controller('bookings')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class BookingsController {
  constructor(
    private readonly bookings: BookingsService,
    private readonly waitlist: WaitlistService,
    private readonly calendarSync: CalendarSyncService,
  ) {}

  @Get('calendar')
  @ApiOperation({ summary: 'Foglalási naptár egy időszakra (nap / hét, gépenként)' })
  calendar(@Query('from') from: string, @Query('to') to: string, @CurrentUser() user: AuthUserDto) {
    return this.bookings.calendar(user.studioId, from, to ?? from);
  }

  @Get('availability')
  @ApiOperation({ summary: 'Szabad időpontok (többkezeléses, konfigurált sorrendben)' })
  availability(
    @Query('day') day: string,
    @Query('treatmentIds') treatmentIds: string | string[],
    @Query('guestId') guestId: string | undefined,
    @Query('override') override: string | undefined,
    @Query('excludeBookingId') excludeBookingId: string | undefined,
    @CurrentUser() user: AuthUserDto,
  ) {
    return this.bookings.availability({
      studioId: user.studioId,
      dayKey: day,
      treatmentIds: parseIdList(treatmentIds),
      guestId: guestId || null,
      override: override === 'true',
      excludeBookingIds: excludeBookingId ? [excludeBookingId] : undefined,
    });
  }

  @Post()
  @ApiOperation({ summary: 'Foglalás a recepción (a 30 nap / 30 perc korlát felülírható)' })
  create(@Body() dto: CreateStaffBookingDto, @CurrentUser() user: AuthUserDto) {
    return this.bookings.create(user.studioId, dto, user.id);
  }

  @Get('settings')
  @ApiOperation({ summary: 'Foglalási beállítások, gépek, kezelések, zárvatartás, ünnepnapok' })
  settings(@CurrentUser() user: AuthUserDto) {
    return this.bookings.settingsBundle(user.studioId);
  }

  @Patch('settings')
  @ApiOperation({ summary: 'Nyitvatartás és foglalási korlátok módosítása' })
  updateSettings(@Body() dto: UpdateBookingSettingsDto, @CurrentUser() user: AuthUserDto) {
    return this.bookings.updateSettings(user.studioId, dto, user.id);
  }

  @Put('treatments/order')
  @ApiOperation({ summary: 'A többkezeléses foglalás sorrendje' })
  reorder(@Body() dto: ReorderTreatmentsDto, @CurrentUser() user: AuthUserDto) {
    return this.bookings.reorderTreatments(user.studioId, dto.treatmentIds, user.id);
  }

  @Patch('treatments/:id')
  @ApiOperation({ summary: 'Kezelés aktív / online foglalható' })
  updateTreatment(@Param('id') id: string, @Body() dto: UpdateTreatmentDto, @CurrentUser() user: AuthUserDto) {
    return this.bookings.updateTreatment(user.studioId, id, dto, user.id);
  }

  @Patch('resources/:id')
  @ApiOperation({ summary: 'Gép engedélyezése / tartós letiltása' })
  updateResource(@Param('id') id: string, @Body() dto: UpdateResourceDto, @CurrentUser() user: AuthUserDto) {
    return this.bookings.updateResource(user.studioId, id, dto.isActive, user.id);
  }

  @Post('closures')
  @ApiOperation({ summary: 'Rendkívüli zárvatartás vagy gépletiltás (csak jelzi az érintett foglalásokat)' })
  createClosure(@Body() dto: CreateClosureDto, @CurrentUser() user: AuthUserDto) {
    return this.bookings.createClosure(user.studioId, dto, user.id);
  }

  @Delete('closures/:id')
  @ApiOperation({ summary: 'Zárvatartás törlése' })
  deleteClosure(@Param('id') id: string, @CurrentUser() user: AuthUserDto) {
    return this.bookings.deleteClosure(user.studioId, id, user.id);
  }

  @Put('holidays')
  @ApiOperation({ summary: 'Ünnepnap-felülírás (ünnepnapon nyitva, vagy egy nap zárva)' })
  upsertHoliday(@Body() dto: UpsertHolidayOverrideDto, @CurrentUser() user: AuthUserDto) {
    return this.bookings.upsertHolidayOverride(user.studioId, dto, user.id);
  }

  @Delete('holidays/:dayKey')
  @ApiOperation({ summary: 'Ünnepnap-felülírás törlése' })
  deleteHoliday(@Param('dayKey') dayKey: string, @CurrentUser() user: AuthUserDto) {
    return this.bookings.deleteHolidayOverride(user.studioId, dayKey, user.id);
  }

  @Get('waitlist')
  @ApiOperation({ summary: 'Várólista (mától)' })
  listWaitlist(@CurrentUser() user: AuthUserDto) {
    return this.waitlist.listForStaff(user.studioId, toStudioDayKey(new Date()));
  }

  @Post('waitlist')
  @ApiOperation({ summary: 'Vendég felvétele a várólistára (kezelés, nap, idősáv)' })
  async joinWaitlist(@Body() dto: CreateStaffWaitlistDto, @CurrentUser() user: AuthUserDto) {
    const fromMinutes = parseTimeOfDay(dto.fromTime);
    const toMinutes = parseTimeOfDay(dto.toTime);
    if (fromMinutes === null || toMinutes === null) {
      throw appError('COMMON.VALIDATION_FAILED', { message: 'Érvényes idősávot adj meg (ÓÓ:PP).' });
    }
    const entry = await this.waitlist.join({
      studioId: user.studioId,
      guestId: dto.guestId,
      treatmentId: dto.treatmentId,
      dayKey: dto.dayKey,
      fromMinutes,
      toMinutes,
      actorUserId: user.id,
    });
    return { id: entry.id };
  }

  @Delete('waitlist/:id')
  @ApiOperation({ summary: 'Várólistás jelentkezés törlése (élő ajánlatnál a következő vendég jön)' })
  cancelWaitlist(@Param('id') id: string, @CurrentUser() user: AuthUserDto) {
    return this.waitlist.cancel(user.studioId, id, user.id);
  }

  @Get('sync')
  @ApiOperation({ summary: 'Google Naptár szinkron állapota és hibái' })
  syncStatus(@CurrentUser() user: AuthUserDto) {
    return this.calendarSync.status(user.studioId);
  }

  @Post('sync/retry')
  @HttpCode(200)
  @ApiOperation({ summary: 'A sikertelen szinkrontételek újrapróbálása' })
  async retrySync(@CurrentUser() user: AuthUserDto) {
    return { retried: await this.calendarSync.retryFailed(user.studioId) };
  }

  @Patch(':id/reschedule')
  @ApiOperation({ summary: 'Áthelyezés (a kapacitás nem írható felül)' })
  reschedule(@Param('id') id: string, @Body() dto: RescheduleBookingDto, @CurrentUser() user: AuthUserDto) {
    return this.bookings.reschedule(user.studioId, id, dto, user.id);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @ApiOperation({ summary: 'Lemondás (a többkezeléses foglalás többi tétele megmarad)' })
  cancel(@Param('id') id: string, @Body() dto: CancelBookingDto, @CurrentUser() user: AuthUserDto) {
    return this.bookings.cancel(user.studioId, id, dto, user.id);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Megérkezett / késik / nem jelent meg (pontosan egy bérletlevonás)' })
  setStatus(@Param('id') id: string, @Body() dto: UpdateBookingStatusDto, @CurrentUser() user: AuthUserDto) {
    return this.bookings.setStatus(user.studioId, id, dto, user.id);
  }

  @Get(':id/audit')
  @ApiOperation({ summary: 'A foglalás auditnaplója' })
  audit(@Param('id') id: string, @CurrentUser() user: AuthUserDto) {
    return this.bookings.audit(user.studioId, id);
  }
}
