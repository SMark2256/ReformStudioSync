import { Module } from '@nestjs/common';
import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';
import { MembershipDuesScheduler } from './membership-dues.scheduler';

@Module({
  controllers: [FinanceController],
  providers: [FinanceService, MembershipDuesScheduler],
  exports: [FinanceService],
})
export class FinanceModule {}
