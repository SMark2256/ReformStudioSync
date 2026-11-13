import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './config/env.validation';
import { AuthModule } from './modules/auth/auth.module';
import { CheckInsModule } from './modules/check-ins/check-ins.module';
import { FinanceModule } from './modules/finance/finance.module';
import { GuestsModule } from './modules/guests/guests.module';
import { HealthModule } from './modules/health/health.module';
import { MonitorModule } from './modules/monitor/monitor.module';
import { PassesModule } from './modules/passes/passes.module';
import { ToursModule } from './modules/tours/tours.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    PrismaModule,
    HealthModule,
    AuthModule,
    GuestsModule,
    PassesModule,
    FinanceModule,
    MonitorModule,
    CheckInsModule,
    ToursModule,
  ],
})
export class AppModule {}
