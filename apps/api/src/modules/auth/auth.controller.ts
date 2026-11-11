import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUserDto, Role } from '@reform/shared';
import { CurrentUser } from '../../common/current-user.decorator';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { Roles } from '../../common/roles.decorator';
import { RolesGuard } from '../../common/roles.guard';
import {
  CreateStaffUserDto,
  InitDisplayPairingDto,
  RequestLoginCodeDto,
  SendMonitorTestSignalDto,
  UnpairSelfDeviceDto,
  UpdateDisplayDeviceDto,
  VerifyDisplayPairingDto,
  VerifyLoginCodeDto,
} from './auth.dto';
import { AuthService } from './auth.service';
import { LoginCodeService } from './login-code.service';

@ApiTags('Autentikáció & Kijelző Párosítás')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly loginCodes: LoginCodeService,
  ) {}

  @Post('code')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Belépőkód kérése e-mailben (ismeretlen címre is ugyanaz a válasz, levél nélkül)',
  })
  requestLoginCode(@Body() dto: RequestLoginCodeDto) {
    return this.loginCodes.requestCode(dto);
  }

  @Post('verify')
  @HttpCode(200)
  @ApiOperation({ summary: 'Belépés az e-mailben kapott kóddal (JWT)' })
  verifyLoginCode(@Body() dto: VerifyLoginCodeDto) {
    return this.loginCodes.verifyCode(dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Aktuális bejelentkezett felhasználó lekérdezése' })
  me(@CurrentUser() user: AuthUserDto) {
    return user;
  }

  @Get('users')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Munkatársak listázása (Csak Admin)' })
  listUsers(@CurrentUser() user: AuthUserDto) {
    return this.authService.listStaffUsers(user.studioId);
  }

  @Post('users')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Új munkatárs létrehozása (Csak Admin)' })
  createUser(
    @Body() dto: CreateStaffUserDto,
    @CurrentUser() user: AuthUserDto,
  ) {
    return this.authService.createStaffUser(dto, user.studioId);
  }

  @Post('monitor/pair-init')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Új 6 jegyű párosító kód generálása különálló Tablet/TV kijelzőhöz',
  })
  initDisplayPairing(
    @Body() dto: InitDisplayPairingDto,
    @CurrentUser() user: AuthUserDto,
  ) {
    return this.authService.initDisplayPairing(dto, user.studioId);
  }

  @Post('monitor/pair-verify')
  @ApiOperation({
    summary: 'Tablet/TV kijelző párosítása 6 jegyű kóddal (deviceToken kiadása)',
  })
  verifyDisplayPairing(@Body() dto: VerifyDisplayPairingDto) {
    return this.authService.verifyDisplayPairing(dto);
  }

  @Get('monitor/devices')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Párosított ügyfélkijelzők listázása' })
  listDevices(@CurrentUser() user: AuthUserDto) {
    return this.authService.listDisplayDevices(user.studioId);
  }

  @Post('monitor/devices/:id/unpair')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Párosítás bontása és új 6 jegyű párosító kód generálása meglévő eszközhöz',
  })
  regeneratePairingCode(
    @Param('id') id: string,
    @CurrentUser() user: AuthUserDto,
  ) {
    return this.authService.regenerateDisplayPairingCode(id, user.studioId);
  }

  @Patch('monitor/devices/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Kijelző eszköz átnevezése (egyedi név ellenőrzéssel)' })
  renameDevice(
    @Param('id') id: string,
    @Body() dto: UpdateDisplayDeviceDto,
    @CurrentUser() user: AuthUserDto,
  ) {
    return this.authService.renameDisplayDevice(id, dto, user.studioId);
  }

  @Delete('monitor/devices/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Folyamatban lévő párosító kód visszavonása vagy párosított eszköz végleges törlése',
  })
  deleteDevice(@Param('id') id: string, @CurrentUser() user: AuthUserDto) {
    return this.authService.deleteDisplayDevice(id, user.studioId);
  }

  @Post('monitor/unpair-self')
  @ApiOperation({
    summary: 'Párosítás megszakítása közvetlenül a párosított Tabletről / Monitorról',
  })
  unpairSelf(@Body() dto: UnpairSelfDeviceDto) {
    return this.authService.unpairSelfDevice(dto);
  }

  @Post('monitor/test-signal')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Teszt jel küldése a csatlakoztatott Vendégmonitorokra',
  })
  sendTestSignal(
    @Body() dto: SendMonitorTestSignalDto,
    @CurrentUser() user: AuthUserDto,
  ) {
    return this.authService.sendMonitorTestSignal(
      dto,
      user.name,
      user.studioId,
    );
  }
}
