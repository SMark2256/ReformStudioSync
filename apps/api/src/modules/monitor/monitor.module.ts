import { forwardRef, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MonitorGateway } from './monitor.gateway';

@Module({
  imports: [forwardRef(() => AuthModule)],
  providers: [MonitorGateway],
  exports: [MonitorGateway],
})
export class MonitorModule {}
