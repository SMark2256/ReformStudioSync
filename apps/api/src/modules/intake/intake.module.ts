import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MailModule } from '../mail/mail.module';
import { MonitorModule } from '../monitor/monitor.module';
import { StorageModule } from '../storage/storage.module';
import { IntakeController } from './intake.controller';
import { IntakeDefinitionsService } from './intake-definitions.service';
import { IntakeDeviceController, IntakeGuestController } from './intake-guest.controller';
import { IntakeDeviceGuard, IntakeGuestGuard } from './intake.guards';
import { IntakePdfService } from './intake-pdf.service';
import { IntakeService } from './intake.service';

@Module({
  imports: [AuthModule, MailModule, MonitorModule, StorageModule],
  controllers: [IntakeController, IntakeGuestController, IntakeDeviceController],
  providers: [
    IntakeService,
    IntakeDefinitionsService,
    IntakePdfService,
    IntakeGuestGuard,
    IntakeDeviceGuard,
  ],
  exports: [IntakeDefinitionsService],
})
export class IntakeModule {}
