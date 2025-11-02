import { Module } from '@nestjs/common';
import { ConfigNotifyService } from './config-notify.service';
import { LoggerModule } from '../logger-service/logger-service.module';
import { ConfigModule } from '@nestjs/config';
import { RedisModule } from '../redis/redis.module';
import { NatsModule } from '../nats/nats.module';

@Module({
  imports: [LoggerModule, ConfigModule, RedisModule, NatsModule],
  controllers: [],
  providers: [ConfigNotifyService],
})
export class ConfigNotifyModule {}
