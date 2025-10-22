import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '@tazama-lf/frms-coe-lib';
import { createRedisConfig } from './redis.config';

@Module({
  providers: [
    {
      provide: RedisService,
      useFactory: async (configService: ConfigService) => {
        const redisConfig = createRedisConfig(configService);
        return await RedisService.create(redisConfig);
      },
      inject: [ConfigService],
    },
  ],
  exports: [RedisService],
})
export class RedisModule {}
