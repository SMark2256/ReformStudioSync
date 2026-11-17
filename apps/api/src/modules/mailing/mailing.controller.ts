import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseEnumPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUserDto, EmailAutomationKind, Role } from '@reform/shared';
import { CurrentUser } from '../../common/current-user.decorator';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { Roles } from '../../common/roles.decorator';
import { RolesGuard } from '../../common/roles.guard';
import { EmailAutomationsService } from './email-automations.service';
import { EmailCampaignsService } from './email-campaigns.service';
import { EmailTemplatesService } from './email-templates.service';
import { MailOutboxService } from './mail-outbox.service';
import {
  AudiencePreviewBodyDto,
  EmailContentDto,
  ListEmailMessagesQueryDto,
  SaveEmailTemplateBodyDto,
  SendBulkEmailBodyDto,
  SendGuestEmailBodyDto,
  UpdateEmailAutomationBodyDto,
} from './mailing.dto';

/**
 * Levelezés (TICKET-55). Jogosultság: a sablonok kezelése, az automatikus levelek és a csoportos
 * (marketing) küldés csak ADMIN; a sablonlista, az egyéni levél a vendégadatlapról, a napló és a
 * hibás levél újraküldése minden munkatársé (a recepciós is ír a vendégnek).
 */
@ApiTags('Levelezés (Mailing)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('mail')
export class MailingController {
  constructor(
    private readonly outbox: MailOutboxService,
    private readonly templates: EmailTemplatesService,
    private readonly automations: EmailAutomationsService,
    private readonly campaigns: EmailCampaignsService,
  ) {}

  @Get('status')
  @ApiOperation({ summary: 'A levélküldés állapota: beállítva-e, óránkénti korlát, várakozó és hibás levelek' })
  status(@CurrentUser() user: AuthUserDto) {
    return this.outbox.status(user.studioId);
  }

  @Get('templates')
  @ApiOperation({ summary: 'E-mail-sablonok listája' })
  listTemplates(@CurrentUser() user: AuthUserDto) {
    return this.templates.list(user.studioId);
  }

  @Post('templates')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Új e-mail-sablon (a HTML-t a szerver szanitizálja)' })
  createTemplate(@Body() dto: SaveEmailTemplateBodyDto, @CurrentUser() user: AuthUserDto) {
    return this.templates.create(dto, user);
  }

  @Patch('templates/:id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'E-mail-sablon módosítása' })
  updateTemplate(
    @Param('id') id: string,
    @Body() dto: SaveEmailTemplateBodyDto,
    @CurrentUser() user: AuthUserDto,
  ) {
    return this.templates.update(id, dto, user);
  }

  @Delete('templates/:id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'E-mail-sablon törlése (az automatikus levél „nincs beállítva” lesz)' })
  deleteTemplate(@Param('id') id: string, @CurrentUser() user: AuthUserDto) {
    return this.templates.remove(id, user);
  }

  @Post('test')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Tesztlevél a bejelentkezett munkatárs címére' })
  sendTest(@Body() dto: EmailContentDto, @CurrentUser() user: AuthUserDto) {
    return this.templates.sendTest(dto, user);
  }

  @Get('automations')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Automatikus levelek (üdvözlő, születésnapi, névnapi)' })
  listAutomations(@CurrentUser() user: AuthUserDto) {
    return this.automations.list(user.studioId);
  }

  @Patch('automations/:kind')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Automatikus levél be- és kikapcsolása, sablon hozzárendelése' })
  updateAutomation(
    @Param('kind', new ParseEnumPipe(EmailAutomationKind)) kind: EmailAutomationKind,
    @Body() dto: UpdateEmailAutomationBodyDto,
    @CurrentUser() user: AuthUserDto,
  ) {
    return this.automations.update(kind, dto, user);
  }

  @Post('audience/preview')
  @HttpCode(200)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Csoportos küldés: a címzettek száma és listája a szűrő szerint' })
  previewAudience(@Body() dto: AudiencePreviewBodyDto, @CurrentUser() user: AuthUserDto) {
    return this.campaigns.previewAudience(user.studioId, dto.filter);
  }

  @Post('bulk')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Csoportos (marketing) levél a jóváhagyott címzetteknek, hozzájárulással' })
  sendBulk(@Body() dto: SendBulkEmailBodyDto, @CurrentUser() user: AuthUserDto) {
    return this.campaigns.sendBulk(dto, user);
  }

  @Get('messages')
  @ApiOperation({ summary: 'Elküldött e-mailek (sor és napló), szűrhetően' })
  listMessages(@Query() query: ListEmailMessagesQueryDto, @CurrentUser() user: AuthUserDto) {
    return this.outbox.list(user.studioId, query);
  }

  @Post('messages/:id/retry')
  @HttpCode(200)
  @ApiOperation({ summary: 'Hibás levél újraküldése' })
  retryMessage(@Param('id') id: string, @CurrentUser() user: AuthUserDto) {
    return this.outbox.retry(id, user.studioId);
  }

  @Get('guests/:guestId/messages')
  @ApiOperation({ summary: 'A vendég levelezési előzményei' })
  guestMessages(@Param('guestId') guestId: string, @CurrentUser() user: AuthUserDto) {
    return this.outbox.listForGuest(guestId, user.studioId);
  }

  @Post('guests/:guestId/messages')
  @ApiOperation({ summary: 'Egyéni levél a vendégnek (egyedi szöveg vagy sablon alapján)' })
  sendToGuest(
    @Param('guestId') guestId: string,
    @Body() dto: SendGuestEmailBodyDto,
    @CurrentUser() user: AuthUserDto,
  ) {
    return this.campaigns.sendToGuest(guestId, dto, user);
  }
}
