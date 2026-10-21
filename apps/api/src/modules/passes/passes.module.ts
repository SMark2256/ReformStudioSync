import { Module } from '@nestjs/common';
import { MonitorModule } from '../monitor/monitor.module';
import { PassesController } from './passes.controller';
import { PassesService } from './passes.service';

@Module({
  imports: [MonitorModule],
  controllers: [PassesController],
  providers: [PassesService],
  exports: [PassesService],
})
export class PassesModule {}
