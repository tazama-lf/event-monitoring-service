import { ConfigService } from '@nestjs/config';
import { RedisConfig } from '@tazama-lf/frms-coe-lib/lib/interfaces';

export const createRedisConfig = (configService: ConfigService): RedisConfig => ({
  db: configService.get<number>('redis.db', 0),
  servers: [
    {
      host: configService.get<string>('redis.host')!,
      port: configService.get<number>('redis.port')!,
    },
  ],
  password: configService.get<string>('redis.password')!,
  isCluster: false,
});
