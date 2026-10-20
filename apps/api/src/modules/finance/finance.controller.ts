import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiPropertyOptional,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { AuthUserDto } from '@reform/shared';
import { IsOptional, IsString } from 'class-validator';
import { CurrentUser } from '../../common/current-user.decorator';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { FinanceService } from './finance.service';

export class CancelPaymentDto {
  @ApiPropertyOptional({ example: 'Téves fizetési mód / bérlettípus rögzítés' })
  @IsOptional()
  @IsString()
  reason?: string;
}

@ApiTags('Pénzügy & Napi Kasszazárás (Finance)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('finance')
export class FinanceController {
  constructor(private readonly financeService: FinanceService) {}

  @Get('daily-summary')
  @ApiOperation({
    summary:
      'Napi pénzügyi kimutatás és kasszazárás fizetési mód szerinti bontásban',
  })
  @ApiQuery({ name: 'date', required: false, example: '2026-10-20' })
  getDailySummary(
    @Query('date') date: string | undefined,
    @CurrentUser() user: AuthUserDto,
  ) {
    return this.financeService.getDailySummary(date, user.studioId);
  }

  @Post('payments/:id/cancel')
  @ApiOperation({
    summary:
      'Téves bérleteladás és fizetés sztornózása (Payment + GuestPass inaktiválás)',
  })
  cancelPayment(
    @Param('id') id: string,
    @Body() dto: CancelPaymentDto,
    @CurrentUser() user: AuthUserDto,
  ) {
    return this.financeService.cancelPayment(id, dto.reason, user.studioId);
  }
}
