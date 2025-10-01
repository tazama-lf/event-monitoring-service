import type { Provider } from '@nestjs/common';
import Knex from 'knex';

export const KNEX_CONNECTION: Provider = {
  provide: 'KNEX',
  useFactory: () =>
    Knex({
      client: 'pg',
      connection: {
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        port: parseInt(process.env.DB_PORT ?? '5432'),
      },
      pool: { min: 2, max: 10 },
    }),
};
