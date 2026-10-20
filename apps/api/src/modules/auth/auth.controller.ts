import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUserDto, Role } from '@reform/shared';
import { CurrentUser } from '../../common/current-user.decorator';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { Roles } from '../../common/roles.decorator';
import { RolesGuard } from '../../common/roles.guard';
import {
  CreateStaffUserDto,
  InitDisplayPairingDto,
  LoginDto,
  VerifyDisplayPairingDto,
} from './auth.dto';
import { AuthService } from './auth.service';

@ApiTags('Autentikáció & Kijelző Párosítás')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @ApiOperation({ summary: 'Recepciós vagy Admin bejelentkezés (JWT)' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
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
}
