import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigNotifyModule } from './config-notify/config-notify.module';
import { LoggerModule } from './logger-service/logger-service.module';
import { DatabaseModule } from './database/database.module';
import { RedisModule } from './redis/redis.module';

@Module({
  imports: [ConfigNotifyModule, LoggerModule, DatabaseModule, RedisModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
