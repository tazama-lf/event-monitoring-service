// SPDX-License-Identifier: Apache-2.0

import { registerAs } from '@nestjs/config';
import { DatabaseConfig } from '../interfaces/iDatabaseConfig';
import { validateEnvironment } from './env.validation';

export default registerAs('database', (): DatabaseConfig => {
  const config = validateEnvironment(process.env);
  const db = config.database;

  return {
    host: db.host,
    port: db.port,
    user: db.user,
    password: db.password,
    database: db.name,
    ssl: db.ssl,
    connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT_MILLIS || '10000', 10),
    idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT_MILLIS || '30000', 10),
    max: parseInt(process.env.DB_MAX_CONNECTIONS || '20', 10),
    min: parseInt(process.env.DB_MIN_CONNECTIONS || '2', 10),
  };
});
