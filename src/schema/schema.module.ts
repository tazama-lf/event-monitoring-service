import { Module } from '@nestjs/common';
import { SchemaController } from './schema.controller';
import { SchemaService } from './schema.service';
import { LoggerModule } from '../logger-service/logger-service.module';
import { ConfigModule } from '@nestjs/config';
import { RedisModule } from '../redis/redis.module';
import { KNEX_CONNECTION } from '../database/knex.provider';
import { NatsModule } from '../nats/nats.module';

@Module({
  imports: [LoggerModule, ConfigModule, RedisModule, NatsModule],
  controllers: [SchemaController],
  providers: [SchemaService, KNEX_CONNECTION],
})
export class SchemaModule {}
