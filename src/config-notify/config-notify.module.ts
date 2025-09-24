import { Module } from '@nestjs/common';
import { ConfigNotifyController } from './config-notify.controller';
import { ConfigNotifyService } from './config-notify.service';
import { LoggerModule } from '../logger-service/logger-service.module';
import { ConfigModule } from '@nestjs/config';
import { RedisService } from '@tazama-lf/frms-coe-lib';
import { KNEX_CONNECTION } from '../database/knex.provider';

@Module({
  imports: [LoggerModule, ConfigModule],
  controllers: [ConfigNotifyController],
  providers: [
    ConfigNotifyService,
    KNEX_CONNECTION,
    {
      provide: RedisService,
      useFactory: async () => {
        if (!process.env.REDIS_HOST) {
          throw new Error('REDIS_HOST environment variable is required');
        }
        if (!process.env.REDIS_PORT) {
          throw new Error('REDIS_PORT environment variable is required');
        }
        if (!process.env.REDIS_PASSWORD) {
          throw new Error('REDIS_PASSWORD environment variable is required');
        }

        const redisConfig = {
          db: 0,
          servers: [
            {
              host: process.env.REDIS_HOST,
              port: parseInt(process.env.REDIS_PORT),
            },
          ],
          password: process.env.REDIS_PASSWORD,
          isCluster: false,
        };
        return await RedisService.create(redisConfig);
      },
    },
  ],
  exports: [RedisService],
})
export class ConfigNotifyModule {}
