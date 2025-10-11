import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigNotifyModule } from './config-notify/config-notify.module';
import { LoggerModule } from './logger-service/logger-service.module';
import { NatsModule } from './nats/nats.module';
import { DemsEngineModule } from './dems-engine/dems-engine.module';

@Module({
  imports: [ConfigNotifyModule, LoggerModule, DemsEngineModule, NatsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
