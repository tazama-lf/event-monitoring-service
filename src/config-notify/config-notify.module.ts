import { Module } from '@nestjs/common';
import { ConfigNotifyController } from './config-notify.controller';
import { ConfigNotifyService } from './config-notify.service';
import { LoggerModule } from '../logger-service/logger-service.module';
import { ConfigModule } from '@nestjs/config';
import { RedisModule } from '../redis/redis.module';
import { KNEX_CONNECTION } from '../database/knex.provider';

@Module({
  imports: [LoggerModule, ConfigModule, RedisModule],
  controllers: [ConfigNotifyController],
  providers: [ConfigNotifyService, KNEX_CONNECTION],
})
export class ConfigNotifyModule {}
