import { Module } from '@nestjs/common';
import { DemsEngineController } from './dems-engine.controller';
import { DemsEngineService } from './dems-engine.service';
import { LoggerModule } from '../logger-service/logger-service.module';
import { ConfigModule } from '@nestjs/config';
import { RedisModule } from '../redis/redis.module';
import { NatsModule } from '../nats/nats.module';
import { DatabaseOperationsService } from '../commons';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [LoggerModule, ConfigModule, RedisModule, NatsModule, AuthModule],
  controllers: [DemsEngineController],
  providers: [DemsEngineService, DatabaseOperationsService],
})
export class DemsEngineModule {}
