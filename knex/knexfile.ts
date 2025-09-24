import type { Knex } from 'knex';
import path from 'node:path';

const config: Record<string, Knex.Config> = {
  development: {
    client: 'pg',
    connection: {
      host: process.env.DB_HOST ?? 'localhost',
      port: parseInt(process.env.DB_PORT ?? '5432'),
      user: process.env.DB_USER ?? 'postgres',
      password: process.env.DB_PASSWORD ?? 'password',
      database: process.env.DB_NAME ?? 'event_monitoring_dev',
    },

    migrations: {
      directory: path.join(__dirname, 'migrations'),
      extension: 'ts',
    },
  },
};

export default config;
