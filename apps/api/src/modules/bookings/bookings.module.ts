import { forwardRef, Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { MonitorModule } from '../monitor/monitor.module';
import { BookingEvents } from './booking-events';
import { BookingNotificationsService } from './booking-notifications.service';
import { BookingsController } from './bookings.controller';
import { BookingsScheduler } from './bookings.scheduler';
import { BookingsService } from './bookings.service';
import { CalendarSyncService } from './calendar-sync.service';
import { GoogleCalendarClient } from './google-calendar.client';
import { PublicBookingController } from './public-booking.controller';
import { PublicBookingService } from './public-booking.service';
import { PublicRateLimitGuard } from './public-rate-limit.guard';
import { WaitlistService } from './waitlist.service';

@Module({
  imports: [MailModule, forwardRef(() => MonitorModule)],
  controllers: [BookingsController, PublicBookingController],
  providers: [
    BookingsService,
    PublicBookingService,
    BookingNotificationsService,
    WaitlistService,
    CalendarSyncService,
    GoogleCalendarClient,
    BookingEvents,
    BookingsScheduler,
    PublicRateLimitGuard,
  ],
})
export class BookingsModule {}
