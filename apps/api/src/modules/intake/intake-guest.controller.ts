import { Body, Controller, Get, Post, Put, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DisplayDevice, IntakeSession } from '@prisma/client';
import { DEVICE_TOKEN_HEADER, INTAKE_TOKEN_HEADER } from '@reform/shared';
import {
  ExitIntakeGuestModeDto,
  SaveIntakeAnswersDto,
  SaveIntakePhotoDto,
  SubmitIntakeDto,
} from './intake.dto';
import {
  CurrentDevice,
  CurrentIntakeSession,
  IntakeDeviceGuard,
  IntakeGuestGuard,
} from './intake.guards';
import { IntakeService } from './intake.service';

/**
 * Vendégmód (TICKET-56). Csak a kitöltéshez kötött tokennel érhető el, azonosítót nem fogad:
 * minden adat a tokenhez tartozó munkamenetből jön.
 */
@ApiTags('Vendégfelvétel – vendégmód')
@ApiHeader({ name: INTAKE_TOKEN_HEADER, required: true })
@UseGuards(IntakeGuestGuard)
@Controller('intake/guest')
export class IntakeGuestController {
  constructor(private readonly intake: IntakeService) {}

  @Get('session')
  @ApiOperation({ summary: 'A saját kitöltés: kérdőívek és eddigi válaszok' })
  view(@CurrentIntakeSession() session: IntakeSession) {
    return this.intake.getGuestView(session);
  }

  @Put('answers')
  @ApiOperation({ summary: 'Egy kérdőív válaszainak mentése (egészségügyi: külön táblába)' })
  answers(@CurrentIntakeSession() session: IntakeSession, @Body() dto: SaveIntakeAnswersDto) {
    return this.intake.saveGuestAnswers(session, dto.formKey, dto.answers);
  }

  @Put('photo')
  @ApiOperation({ summary: 'Belső azonosító profilkép (nem marketingcélú)' })
  photo(@CurrentIntakeSession() session: IntakeSession, @Body() dto: SaveIntakePhotoDto) {
    return this.intake.saveGuestPhoto(session, dto.dataUrl);
  }

  @Post('submit')
  @ApiOperation({ summary: 'Beküldés aláírással: ellenőrzésre vár' })
  submit(@CurrentIntakeSession() session: IntakeSession, @Body() dto: SubmitIntakeDto) {
    return this.intake.submitGuest(session, dto.signatureDataUrl);
  }

  @Post('exit')
  @ApiOperation({ summary: 'Kilépés a vendégmódból a munkatárs kilépési kódjával' })
  exit(@CurrentIntakeSession() session: IntakeSession, @Body() dto: ExitIntakeGuestModeDto) {
    return this.intake.exitGuestMode(session, dto.exitCode);
  }
}

/** Párosított vendégfelvételi tablet: a neki küldött kitöltés átvétele. */
@ApiTags('Vendégfelvétel – tablet')
@ApiHeader({ name: DEVICE_TOKEN_HEADER, required: true })
@UseGuards(IntakeDeviceGuard)
@Controller('intake/device')
export class IntakeDeviceController {
  constructor(private readonly intake: IntakeService) {}

  @Post('claim')
  @ApiOperation({ summary: 'A tabletre küldött kitöltés átvétele (friss vendégtoken)' })
  async claim(@CurrentDevice() device: DisplayDevice) {
    return { assignment: await this.intake.claimForDevice(device) };
  }
}
