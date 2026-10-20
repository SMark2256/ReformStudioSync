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
import { CreateGuestDto, UpdateGuestDto } from './guests.dto';
import { GuestsService } from './guests.service';

@ApiTags('Vendégek (Guests)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('guests')
export class GuestsController {
  constructor(private readonly guestsService: GuestsService) {}

  @Get()
  @ApiOperation({ summary: 'Vendégek listázása és gyorskeresés (név, vonalkód, telefon)' })
  @ApiQuery({ name: 'q', required: false })
  findAll(@Query('q') query: string | undefined, @CurrentUser() user: AuthUserDto) {
    return this.guestsService.findAll(query, user.studioId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Vendég részletes adatlapja bérletekkel és felhasználási naplóval' })
  findOne(@Param('id') id: string, @CurrentUser() user: AuthUserDto) {
    return this.guestsService.findOne(id, user.studioId);
  }

  @Post()
  @ApiOperation({ summary: 'Új vendég regisztrációja (automatikus vagy egyedi vonalkóddal)' })
  create(@Body() dto: CreateGuestDto, @CurrentUser() user: AuthUserDto) {
    return this.guestsService.create(dto, user.studioId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Vendég adatainak vagy vonalkódjának módosítása' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateGuestDto,
    @CurrentUser() user: AuthUserDto,
  ) {
    return this.guestsService.update(id, dto, user.studioId);
  }
}
