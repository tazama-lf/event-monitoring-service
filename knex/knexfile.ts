import type { Knex } from 'knex';
import path from 'node:path';
import { getDatabaseConfig } from './database.config';

const databaseConfig = getDatabaseConfig();

const config: Record<string, Knex.Config> = {
  development: {
    client: 'pg',
    connection: databaseConfig,
    migrations: {
      directory: path.join(__dirname, 'migrations'),
      extension: 'ts',
    },
  },
};

export default config;
