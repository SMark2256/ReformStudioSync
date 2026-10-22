import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AuthUserDto } from '@reform/shared';
import { CurrentUser } from '../../common/current-user.decorator';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import {
  CreateGuestDocumentDto,
  CreateGuestDto,
  CreateGuestNoteDto,
  CreateGuestPhotoDto,
  CreateMeasurementDto,
  SendGuestMessageDto,
  SignGuestDocumentDto,
  UpdateGuestDto,
} from './guests.dto';
import { GuestsService } from './guests.service';

@ApiTags('Vendégek, Mérések, Fotók & Dokumentumok (Guests)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class GuestsController {
  constructor(private readonly guestsService: GuestsService) {}

  @Get('guests')
  @ApiOperation({
    summary: 'Vendégek listázása és gyorskeresés (GET /api/guests?search= vagy ?q=)',
  })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'q', required: false })
  findAll(
    @Query('search') search: string | undefined,
    @Query('q') query: string | undefined,
    @CurrentUser() user: AuthUserDto,
  ) {
    return this.guestsService.findAll(search ?? query, user.studioId);
  }

  @Get('guests/:id')
  @ApiOperation({
    summary: 'Vendég teljes adatlapja (GET /api/guests/:id)',
  })
  findOne(@Param('id') id: string, @CurrentUser() user: AuthUserDto) {
    return this.guestsService.findOne(id, user.studioId);
  }

  @Get('guests/:id/passes')
  @ApiOperation({
    summary:
      'Vendég bérleteinek lekérdezése a nem visszavont felhasználásokból számított egyenleggel (GET /api/guests/:id/passes)',
  })
  findPasses(@Param('id') id: string, @CurrentUser() user: AuthUserDto) {
    return this.guestsService.findGuestPasses(id, user.studioId);
  }

  @Post('guests')
  @ApiOperation({
    summary: 'Új vendég regisztrációja (POST /api/guests)',
  })
  create(@Body() dto: CreateGuestDto, @CurrentUser() user: AuthUserDto) {
    return this.guestsService.create(dto, user.studioId);
  }

  @Patch('guests/:id')
  @ApiOperation({ summary: 'Vendég adatainak vagy vonalkódjának módosítása' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateGuestDto,
    @CurrentUser() user: AuthUserDto,
  ) {
    return this.guestsService.update(id, dto, user.studioId);
  }

  @Post('guests/:id/measurements')
  @ApiOperation({ summary: 'Új testösszetétel / körméret mérés rögzítése (2. ütem)' })
  addMeasurement(
    @Param('id') id: string,
    @Body() dto: CreateMeasurementDto,
    @CurrentUser() user: AuthUserDto,
  ) {
    return this.guestsService.addMeasurement(id, dto, user.id);
  }

  @Post('guests/:id/photos')
  @ApiOperation({
    summary: 'Méretoptimalizált (WebP) kezelési / állapotfotó mentése a vendéghez (2. ütem)',
  })
  addPhoto(@Param('id') id: string, @Body() dto: CreateGuestPhotoDto) {
    return this.guestsService.addPhoto(id, dto);
  }

  @Post('guests/:id/documents')
  @ApiOperation({
    summary: 'Új dokumentum / nyilatkozat létrehozása vagy kiküldése tabletre (2. ütem)',
  })
  createDocument(
    @Param('id') id: string,
    @Body() dto: CreateGuestDocumentDto,
  ) {
    return this.guestsService.createDocument(id, dto);
  }

  @Get('documents/pending')
  @ApiOperation({ summary: 'Tableten aláírásra váró dokumentumok listázása' })
  listPendingDocuments() {
    return this.guestsService.listPendingDocuments();
  }

  @Post('documents/:id/sign')
  @ApiOperation({ summary: 'Dokumentum aláírása tableten (Canvas aláírás mentése)' })
  signDocument(
    @Param('id') id: string,
    @Body() dto: SignGuestDocumentDto,
  ) {
    return this.guestsService.signDocument(id, dto);
  }

  @Post('guests/:id/notes')
  @ApiOperation({ summary: 'Új belső megjegyzés rögzítése a vendéghez' })
  addNote(
    @Param('id') id: string,
    @Body() dto: CreateGuestNoteDto,
    @CurrentUser() user: AuthUserDto,
  ) {
    return this.guestsService.addInternalNote(id, dto, user.id);
  }

  @Post('guests/:id/messages')
  @ApiOperation({ summary: 'E-mail értesítés kiküldése és naplózása (message_logs)' })
  sendMessage(
    @Param('id') id: string,
    @Body() dto: SendGuestMessageDto,
  ) {
    return this.guestsService.sendGuestEmailLog(id, dto);
  }
}
