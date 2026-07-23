// SPDX-License-Identifier: Apache-2.0

import { registerAs } from '@nestjs/config';
import type { DatabaseConfig } from '../interfaces/iDatabaseConfig';
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
    connectionTimeoutMillis: db.connectionTimeoutMillis,
    idleTimeoutMillis: db.idleTimeoutMillis,
    max: db.max,
    min: db.min,
  };
});
