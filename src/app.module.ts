import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigNotifyModule } from './config-notify/config-notify.module';
import { LoggerModule } from './logger-service/logger-service.module';
import { TcsSimulationModule } from './tcs-simulation/tcs-simulation.module';

@Module({
  imports: [ConfigNotifyModule, LoggerModule, TcsSimulationModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
