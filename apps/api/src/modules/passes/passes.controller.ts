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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUserDto, Role } from '@reform/shared';
import { CurrentUser } from '../../common/current-user.decorator';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { Roles } from '../../common/roles.decorator';
import { RolesGuard } from '../../common/roles.guard';
import {
  CreatePassTemplateDto,
  CreateServiceDto,
  DeductPassUsageDto,
  ExtendPassDto,
  ReversePassUsageDto,
  SellPassDto,
  ToggleFreezePassDto,
  UpdatePassTemplateDto,
} from './passes.dto';
import { PassesService } from './passes.service';

@ApiTags('Bérletek, Szolgáltatások & Kezeléslevonások (Passes & Services)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class PassesController {
  constructor(private readonly passesService: PassesService) {}

  @Get('services')
  @ApiOperation({ summary: 'Szolgáltatások / kezelések listázása (GET /api/services)' })
  listServices(
    @Query('includeInactive') includeInactive: string | undefined,
    @CurrentUser() user: AuthUserDto,
  ) {
    return this.passesService.listServices(
      includeInactive === 'true',
      user.studioId,
    );
  }

  @Post('services')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Új szolgáltatás / kezelés létrehozása (POST /api/services)' })
  createService(
    @Body() dto: CreateServiceDto,
    @CurrentUser() user: AuthUserDto,
  ) {
    return this.passesService.createService(dto, user.studioId);
  }

  @Get('passes/templates')
  @ApiOperation({ summary: 'Bérletsablonok listázása' })
  listTemplates(
    @Query('includeInactive') includeInactive: string | undefined,
    @CurrentUser() user: AuthUserDto,
  ) {
    return this.passesService.listTemplates(
      includeInactive === 'true',
      user.studioId,
    );
  }

  @Post('passes/templates')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Új bérletsablon létrehozása (Csak Admin)' })
  createTemplate(
    @Body() dto: CreatePassTemplateDto,
    @CurrentUser() user: AuthUserDto,
  ) {
    return this.passesService.createTemplate(dto, user.studioId);
  }

  @Patch('passes/templates/:id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Bérletsablon módosítása (Csak Admin)' })
  updateTemplate(
    @Param('id') id: string,
    @Body() dto: UpdatePassTemplateDto,
    @CurrentUser() user: AuthUserDto,
  ) {
    return this.passesService.updateTemplate(id, dto, user.studioId);
  }

  @Post('passes/sell')
  @ApiOperation({
    summary: 'Bérlet értékesítése vendégnek (GuestPass + Payment atomi tranzakcióban)',
  })
  sellPass(@Body() dto: SellPassDto, @CurrentUser() user: AuthUserDto) {
    return this.passesService.sellPass(dto, user.id, user.studioId);
  }

  @Post('pass-usages')
  @ApiOperation({
    summary:
      'Kézi kezelésválasztás és atomi bérletalkalom-levonás (POST /api/pass-usages)',
  })
  deductUsage(
    @Body() dto: DeductPassUsageDto,
    @CurrentUser() user: AuthUserDto,
  ) {
    return this.passesService.deductTreatmentUsage(dto, user.id, user.studioId);
  }

  @Post('pass-usages/:id/reverse')
  @ApiOperation({
    summary:
      'Téves alkalomlevonás visszavonása indoklással és naplózással (POST /api/pass-usages/:id/reverse)',
  })
  reverseUsage(
    @Param('id') id: string,
    @Body() dto: ReversePassUsageDto,
    @CurrentUser() user: AuthUserDto,
  ) {
    return this.passesService.reversePassUsage(id, dto, user.id, user.studioId);
  }

  @Patch('passes/:id/extend')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Egyedi bérlet meghosszabbítása +N nappal (Admin funkció)',
  })
  extendPass(
    @Param('id') id: string,
    @Body() dto: ExtendPassDto,
    @CurrentUser() user: AuthUserDto,
  ) {
    return this.passesService.extendPass(id, dto, user.studioId);
  }

  @Patch('passes/:id/toggle-freeze')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary:
      'Egyedi bérlet fagyasztása vagy feloldása automatikus lejárat-korrekcióval (Admin funkció)',
  })
  toggleFreezePass(
    @Param('id') id: string,
    @Body() dto: ToggleFreezePassDto,
    @CurrentUser() user: AuthUserDto,
  ) {
    return this.passesService.toggleFreezePass(id, dto, user.id, user.studioId);
  }
}
