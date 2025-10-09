import type { Knex } from 'knex';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(__dirname, '..', '.env') });

const config: { [key: string]: Knex.Config } = {
  development: {
    client: 'pg',
    connection: {
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT!),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
    },
    migrations: {
      directory: './migrations',
      extension: 'ts',
      tableName: 'knex_migrations',
    },
    seeds: {
      directory: './seeds',
      extension: 'ts',
    },
  },
  production: {
    client: 'pg',
    connection: {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      database: process.env.DB_NAME || 'event_monitoring_dev',
    },
    migrations: {
      directory: './migrations',
      extension: 'ts',
      tableName: 'knex_migrations',
    },
    seeds: {
      directory: './seeds',
      extension: 'ts',
    },
  },
};

module.exports = config;
