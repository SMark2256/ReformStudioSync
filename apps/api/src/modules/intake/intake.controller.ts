import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUserDto } from '@reform/shared';
import { CurrentUser } from '../../common/current-user.decorator';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import {
  CreateIntakeSessionDto,
  DuplicateCheckDto,
  ListIntakeSessionsQueryDto,
  SendIntakeToDeviceDto,
  UpdateIntakeSessionDto,
} from './intake.dto';
import { IntakeService } from './intake.service';

/** Vendégfelvétel a recepción (TICKET-56): előkészítés, átadás, ellenőrzés, jóváhagyás. */
@ApiTags('Vendégfelvétel (Intake)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class IntakeController {
  constructor(private readonly intake: IntakeService) {}

  @Get('intake/packages')
  @ApiOperation({ summary: 'Felvételi csomagok (Köredzés, Hypoxi, …)' })
  packages(@CurrentUser() user: AuthUserDto) {
    return this.intake.listPackages(user.studioId);
  }

  @Get('intake/forms')
  @ApiOperation({ summary: 'Aktív kérdőív-definíciók (kulcsonként a legújabb verzió)' })
  forms() {
    return this.intake.listForms();
  }

  @Post('intake/duplicates')
  @ApiOperation({ summary: 'Duplikáció-ellenőrzés név, születési dátum, telefon és e-mail alapján' })
  duplicates(@Body() dto: DuplicateCheckDto, @CurrentUser() user: AuthUserDto) {
    return this.intake.findDuplicates(dto, user.studioId);
  }

  @Get('intake/sessions')
  @ApiOperation({ summary: 'Vendégfelvételek (nyitottak és az utóbbi 30 nap)' })
  list(@Query() query: ListIntakeSessionsQueryDto, @CurrentUser() user: AuthUserDto) {
    return this.intake.listSessions(user.studioId, query);
  }

  @Post('intake/sessions')
  @ApiOperation({ summary: 'Vendégfelvétel előkészítése (új vagy meglévő vendég, csomagok)' })
  create(@Body() dto: CreateIntakeSessionDto, @CurrentUser() user: AuthUserDto) {
    return this.intake.createSession(dto, user);
  }

  @Get('intake/sessions/:id')
  @ApiOperation({ summary: 'Vendégfelvétel részletei, egészségügyi válaszok nélkül' })
  detail(@Param('id') id: string, @CurrentUser() user: AuthUserDto) {
    return this.intake.getDetail(id, user.studioId);
  }

  @Get('intake/sessions/:id/health')
  @ApiOperation({ summary: 'Egészségügyi válaszok (minden olvasás auditnaplóba kerül)' })
  health(@Param('id') id: string, @CurrentUser() user: AuthUserDto) {
    return this.intake.getHealth(id, user);
  }

  @Patch('intake/sessions/:id')
  @ApiOperation({ summary: 'Ellenőrzés: profiladatok, mérések, meglévő vendéghez kapcsolás' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateIntakeSessionDto,
    @CurrentUser() user: AuthUserDto,
  ) {
    return this.intake.updateSession(id, dto, user);
  }

  @Post('intake/sessions/:id/guest-mode')
  @ApiOperation({ summary: 'Vendégmód ezen az eszközön (rövid életű, a kitöltéshez kötött token)' })
  guestMode(@Param('id') id: string, @CurrentUser() user: AuthUserDto) {
    return this.intake.startGuestMode(id, user);
  }

  @Post('intake/sessions/:id/send-to-device')
  @ApiOperation({ summary: 'Küldés párosított tabletre (valós időben, socket.io)' })
  sendToDevice(
    @Param('id') id: string,
    @Body() dto: SendIntakeToDeviceDto,
    @CurrentUser() user: AuthUserDto,
  ) {
    return this.intake.sendToDevice(id, dto.deviceId, user);
  }

  @Post('intake/sessions/:id/release')
  @ApiOperation({ summary: 'A vendégmód lezárása a recepcióról' })
  release(@Param('id') id: string, @CurrentUser() user: AuthUserDto) {
    return this.intake.releaseGuestMode(id, user);
  }

  @Post('intake/sessions/:id/return')
  @ApiOperation({ summary: 'Visszaküldés a vendégnek javításra (új aláírás kell)' })
  returnToGuest(@Param('id') id: string, @CurrentUser() user: AuthUserDto) {
    return this.intake.returnToGuest(id, user);
  }

  @Post('intake/sessions/:id/approve')
  @ApiOperation({ summary: 'Jóváhagyás: profil szinkron, pillanatképek, mérés, majd PDF és tárolás' })
  approve(@Param('id') id: string, @CurrentUser() user: AuthUserDto) {
    return this.intake.approve(id, user);
  }

  @Post('intake/sessions/:id/retry')
  @ApiOperation({ summary: 'Sikertelen lezárás (PDF, tárolás) újrapróbálása' })
  retry(@Param('id') id: string, @CurrentUser() user: AuthUserDto) {
    return this.intake.retry(id, user);
  }

  @Post('intake/sessions/:id/cancel')
  @ApiOperation({ summary: 'Vendégfelvétel megszakítása' })
  cancel(@Param('id') id: string, @CurrentUser() user: AuthUserDto) {
    return this.intake.cancel(id, user);
  }

  @Get('guests/:id/intake-documents')
  @ApiOperation({ summary: 'A vendég aláírt felvételi dokumentumai (PDF)' })
  guestDocuments(@Param('id') id: string, @CurrentUser() user: AuthUserDto) {
    return this.intake.listGuestDocuments(id, user.studioId);
  }

  @Post('intake/documents/:id/link')
  @ApiOperation({ summary: 'Lejáró letöltési link az aláírt PDF-hez (naplózott)' })
  documentLink(@Param('id') id: string, @CurrentUser() user: AuthUserDto) {
    return this.intake.documentLink(id, user);
  }

  @Post('intake/documents/:id/email')
  @ApiOperation({ summary: 'Az aláírt PDF elküldése a vendégnek e-mailben' })
  emailDocument(@Param('id') id: string, @CurrentUser() user: AuthUserDto) {
    return this.intake.sendDocumentEmail(id, user);
  }
}
