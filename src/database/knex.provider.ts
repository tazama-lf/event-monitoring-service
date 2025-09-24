import type { Provider } from '@nestjs/common';
import Knex from 'knex';

const DEFAULT_DB_PORT = 5432;
const DEFAULT_POOL_MIN = 2;
const DEFAULT_POOL_MAX = 10;

export const KNEX_CONNECTION: Provider = {
  provide: 'KNEX',
  useFactory: () =>
    Knex({
      client: 'pg',
      connection: {
        host: process.env.DB_HOST ?? 'localhost',
        user: process.env.DB_USER ?? 'postgres',
        password: process.env.DB_PASSWORD ?? 'password',
        database: process.env.DB_NAME ?? 'event_monitoring_dev',
        port: parseInt(process.env.DB_PORT ?? DEFAULT_DB_PORT.toString()),
      },
      pool: {
        min: DEFAULT_POOL_MIN,
        max: DEFAULT_POOL_MAX,
      },
      migrations: {
        tableName: 'knex_migrations',
        directory: './migrations',
      },
    }),
};
