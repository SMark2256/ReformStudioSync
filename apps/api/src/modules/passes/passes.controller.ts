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
  ExtendPassDto,
  SellPassDto,
  ToggleFreezePassDto,
  UpdatePassTemplateDto,
} from './passes.dto';
import { PassesService } from './passes.service';

@ApiTags('Bérletek & Bérletsablonok (Passes)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('passes')
export class PassesController {
  constructor(private readonly passesService: PassesService) {}

  @Get('templates')
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

  @Post('templates')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Új bérletsablon létrehozása (Csak Admin)' })
  createTemplate(
    @Body() dto: CreatePassTemplateDto,
    @CurrentUser() user: AuthUserDto,
  ) {
    return this.passesService.createTemplate(dto, user.studioId);
  }

  @Patch('templates/:id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Bérletsablon módosítása (Csak Admin)' })
  updateTemplate(
    @Param('id') id: string,
    @Body() dto: UpdatePassTemplateDto,
    @CurrentUser() user: AuthUserDto,
  ) {
    return this.passesService.updateTemplate(id, dto, user.studioId);
  }

  @Post('sell')
  @ApiOperation({
    summary: 'Bérlet értékesítése vendégnek (GuestPass + Payment atomi tranzakcióban)',
  })
  sellPass(@Body() dto: SellPassDto, @CurrentUser() user: AuthUserDto) {
    return this.passesService.sellPass(dto, user.id, user.studioId);
  }

  @Patch(':id/extend')
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

  @Patch(':id/toggle-freeze')
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
    return this.passesService.toggleFreezePass(id, dto, user.studioId);
  }
}
