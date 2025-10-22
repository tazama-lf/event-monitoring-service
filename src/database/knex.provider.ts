import type { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Knex from 'knex';

export const KNEX_CONNECTION: Provider = {
  provide: 'KNEX',
  useFactory: (configService: ConfigService) =>
    Knex({
      client: 'pg',
      connection: {
        host: configService.get<string>('database.host'),
        user: configService.get<string>('database.user'),
        password: configService.get<string>('database.password'),
        database: configService.get<string>('database.name'),
        port: configService.get<number>('database.port'),
      },
      pool: { min: 2, max: 10 },
    }),
  inject: [ConfigService],
};
