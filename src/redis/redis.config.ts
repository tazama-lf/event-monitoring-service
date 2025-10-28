import { ConfigService } from '@nestjs/config';
import { RedisConfig } from '@tazama-lf/frms-coe-lib/lib/interfaces';

export const createRedisConfig = (configService: ConfigService): RedisConfig => {
  const host = configService.get<string>('redis.host');
  const port = configService.get<number>('redis.port');
  const password = configService.get<string>('redis.password');

  if (!host || !port || !password) {
    throw new Error('Redis configuration is incomplete. Check REDIS_HOST, REDIS_PORT, and REDIS_PASSWORD environment variables.');
  }

  return {
    db: configService.get<number>('redis.db', 0),
    servers: [
      {
        host,
        port,
      },
    ],
    password,
    isCluster: false,
  };
};
