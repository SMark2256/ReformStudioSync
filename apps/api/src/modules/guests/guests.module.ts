import { Module } from '@nestjs/common';
import { FinanceModule } from '../finance/finance.module';
import { MailingModule } from '../mailing/mailing.module';
import { GuestsController } from './guests.controller';
import { GuestsService } from './guests.service';

@Module({
  imports: [FinanceModule, MailingModule],
  controllers: [GuestsController],
  providers: [GuestsService],
  exports: [GuestsService],
})
export class GuestsModule {}
