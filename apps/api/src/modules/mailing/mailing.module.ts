import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { EmailAutomationsService } from './email-automations.service';
import { EmailCampaignsService } from './email-campaigns.service';
import { EmailConsentService } from './email-consent.service';
import { EmailTemplatesService } from './email-templates.service';
import { MailOutboxService } from './mail-outbox.service';
import { MailingController } from './mailing.controller';
import { MailingScheduler } from './mailing.scheduler';
import { UnsubscribeController } from './unsubscribe.controller';

@Module({
  imports: [MailModule],
  controllers: [MailingController, UnsubscribeController],
  providers: [
    MailOutboxService,
    EmailTemplatesService,
    EmailAutomationsService,
    EmailCampaignsService,
    EmailConsentService,
    MailingScheduler,
  ],
  exports: [EmailAutomationsService],
})
export class MailingModule {}
