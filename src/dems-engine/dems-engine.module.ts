import { Module } from '@nestjs/common';
import { DemsEngineController } from './dems-engine.controller';
import { DemsEngineService } from './dems-engine.service';
import { LoggerModule } from '../logger-service/logger-service.module';
import { ConfigModule } from '@nestjs/config';
import { RedisModule } from '../redis/redis.module';
import { KNEX_CONNECTION } from '../database/knex.provider';
import { NatsModule } from '../nats/nats.module';

@Module({
  imports: [LoggerModule, ConfigModule, RedisModule, NatsModule],
  controllers: [DemsEngineController],
  providers: [DemsEngineService, KNEX_CONNECTION],
})
export class DemsEngineModule {}
