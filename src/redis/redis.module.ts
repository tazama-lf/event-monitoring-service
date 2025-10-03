import { Module } from '@nestjs/common';
import { RedisService } from '@tazama-lf/frms-coe-lib';
import redisConfig from './redis.config';

@Module({
  providers: [
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

        return await RedisService.create(redisConfig);
      },
    },
  ],
  exports: [RedisService],
})
export class RedisModule {}
