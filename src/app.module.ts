import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigNotifyModule } from './config-notify/config-notify.module';
import { LoggerModule } from './logger-service/logger-service.module';
import { SchemaModule } from './schema/schema.module';
import { NatsModule } from './nats/nats.module';

@Module({
  imports: [ConfigNotifyModule, LoggerModule, SchemaModule, NatsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
