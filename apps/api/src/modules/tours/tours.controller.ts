import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUserDto, TourEventDto } from '@reform/shared';
import { CurrentUser } from '../../common/current-user.decorator';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { RecordTourEventDto } from './tours.dto';
import { ToursService } from './tours.service';

@ApiTags('Oldalbemutató')
@Controller('tours')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ToursController {
  constructor(private readonly tours: ToursService) {}

  @Get()
  @ApiOperation({ summary: 'A bejelentkezett fiók látott oldalbemutatói' })
  getState(@CurrentUser() user: AuthUserDto) {
    return this.tours.getState(user.id);
  }

  @Post()
  @HttpCode(200)
  @ApiOperation({
    summary: 'Bemutató bezárva (seen), „Többet ne mutass” (all) vagy újraindítás (reset)',
  })
  recordEvent(@Body() dto: RecordTourEventDto, @CurrentUser() user: AuthUserDto) {
    return this.tours.recordEvent(user.id, dto as TourEventDto);
  }
}
