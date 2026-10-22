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
import {
  ApiBearerAuth,
  ApiOperation,
  ApiPropertyOptional,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import {
  AuthUserDto,
  MembershipStatus,
  PaymentMethod,
} from '@reform/shared';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { CurrentUser } from '../../common/current-user.decorator';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { FinanceService } from './finance.service';

export class CancelPaymentDto {
  @ApiPropertyOptional({ example: 'Téves fizetési mód / bérlettípus rögzítés' })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class RecordPaymentDto {
  @IsString()
  @IsNotEmpty()
  guestId: string;

  @IsNumber()
  @Min(1)
  amountHuf: number;

  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

  @IsOptional()
  @IsString()
  membershipDueId?: string | null;

  @IsOptional()
  @IsString()
  passId?: string | null;

  @IsOptional()
  @IsString()
  note?: string;
}

export class CreateMembershipInputDto {
  @IsString()
  @IsNotEmpty()
  guestId: string;

  @IsInt()
  @Min(1)
  monthlyFeeHuf: number;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsInt()
  dueDay?: number;
}

export class UpdateMembershipStatusInputDto {
  @IsEnum(MembershipStatus)
  status: MembershipStatus;

  @IsOptional()
  @IsInt()
  monthlyFeeHuf?: number;

  @IsOptional()
  @IsInt()
  dueDay?: number;
}

export class CreateMembershipDueInputDto {
  @IsString()
  @IsNotEmpty()
  period: string;

  @IsString()
  @IsNotEmpty()
  dueDate: string;

  @IsInt()
  @Min(1)
  amountHuf: number;
}

@ApiTags('Pénzügy, Havi Tagságok & Napi Összesítő (Finance, Memberships & Dashboard)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class FinanceController {
  constructor(private readonly financeService: FinanceService) {}

  @Get('finance/daily-summary')
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

  @Post('payments')
  @ApiOperation({
    summary:
      'Befizetés rögzítése (készpénz, kártya, átutalás) havi esedékességhez vagy bérlethez (POST /api/payments)',
  })
  recordPayment(
    @Body() dto: RecordPaymentDto,
    @CurrentUser() user: AuthUserDto,
  ) {
    return this.financeService.recordPayment(dto, user.id, user.studioId);
  }

  @Post('finance/payments/:id/cancel')
  @ApiOperation({
    summary:
      'Téves bérleteladás és fizetés sztornózása (Payment + GuestPass/MembershipDue korrekció)',
  })
  cancelPayment(
    @Param('id') id: string,
    @Body() dto: CancelPaymentDto,
    @CurrentUser() user: AuthUserDto,
  ) {
    return this.financeService.cancelPayment(
      id,
      dto.reason,
      user.studioId,
      user.id,
    );
  }

  @Get('memberships/overdue')
  @ApiOperation({
    summary:
      'Elmaradások és tartozások lekérdezése késési kategóriák szerint: 1–5, 6–15, 15 nap felett (GET /api/memberships/overdue)',
  })
  getOverdue(@CurrentUser() user: AuthUserDto) {
    return this.financeService.getOverdueMemberships(user.studioId);
  }

  @Post('memberships')
  @ApiOperation({ summary: 'Új havi köredzés tagság létrehozása vendégnek' })
  createMembership(
    @Body() dto: CreateMembershipInputDto,
    @CurrentUser() user: AuthUserDto,
  ) {
    return this.financeService.createMembership(dto, user.studioId);
  }

  @Patch('memberships/:id')
  @ApiOperation({
    summary: 'Havi tagság állapotának (aktív/szüneteltetett/megszűnt) vagy díjának módosítása',
  })
  updateMembership(
    @Param('id') id: string,
    @Body() dto: UpdateMembershipStatusInputDto,
    @CurrentUser() user: AuthUserDto,
  ) {
    return this.financeService.updateMembershipStatus(id, dto, user.studioId);
  }

  @Post('memberships/:id/dues')
  @ApiOperation({ summary: 'Új havi tagdíj-esedékesség előírása a tagsághoz' })
  addMembershipDue(
    @Param('id') id: string,
    @Body() dto: CreateMembershipDueInputDto,
    @CurrentUser() user: AuthUserDto,
  ) {
    return this.financeService.addMembershipDue(id, dto, user.studioId);
  }

  @Get('dashboard/today')
  @ApiOperation({
    summary:
      'Napi összesítő KPI-k: érkezések, bevétel, tartozások, lejáró bérletek, születés- és névnapok (GET /api/dashboard/today)',
  })
  getTodayDashboard(@CurrentUser() user: AuthUserDto) {
    return this.financeService.getTodayDashboard(user.studioId);
  }
}
