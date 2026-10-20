import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUserDto } from '@reform/shared';
import { CurrentUser } from '../../common/current-user.decorator';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { ScanCheckInDto, SyncOfflineScansDto } from './check-ins.dto';
import { CheckInsService } from './check-ins.service';

@ApiTags('Beléptetés & Sztornó (Check-Ins)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('check-ins')
export class CheckInsController {
  constructor(private readonly checkInsService: CheckInsService) {}

  @Get('today')
  @ApiOperation({ summary: 'Mai napi beléptetések listázása' })
  listToday(@CurrentUser() user: AuthUserDto) {
    return this.checkInsService.listTodayCheckIns(user.studioId);
  }

  @Post('scan')
  @ApiOperation({
    summary:
      'Vonalkódos beléptetés atomi tranzakcióval, 60mp dupla lehúzás védelemmel és WebSocket push-sal',
  })
  scan(@Body() dto: ScanCheckInDto, @CurrentUser() user: AuthUserDto) {
    return this.checkInsService.processBarcodeCheckIn(
      dto,
      user.id,
      user.studioId,
    );
  }

  @Post(':id/revoke')
  @ApiOperation({
    summary: 'Téves beléptetés 1 kattintásos sztornózása (alkalom visszaírása +1)',
  })
  revoke(@Param('id') id: string, @CurrentUser() user: AuthUserDto) {
    return this.checkInsService.revokeCheckIn(id, user.studioId);
  }

  @Post('sync-offline')
  @ApiOperation({
    summary:
      'Offline olvasási pufferből érkező vonalkódok idempotens kötegelt szinkronizálása',
  })
  syncOffline(
    @Body() dto: SyncOfflineScansDto,
    @CurrentUser() user: AuthUserDto,
  ) {
    return this.checkInsService.syncOfflineScans(dto, user.id, user.studioId);
  }
}
