import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MonitorGateway } from './monitor.gateway';

@Module({
  imports: [AuthModule],
  providers: [MonitorGateway],
  exports: [MonitorGateway],
})
export class MonitorModule {}
