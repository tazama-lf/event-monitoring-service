import type { Knex } from 'knex';
import path from 'node:path';

const config: Record<string, Knex.Config> = {
  development: {
    client: 'pg',
    connection: {
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASS,
      database: process.env.DB_NAME,
    },

    migrations: {
      directory: path.join(__dirname, 'migrations'),
      extension: 'ts',
    },
  },
};

export default config;
