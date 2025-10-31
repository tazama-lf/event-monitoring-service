// SPDX-License-Identifier: Apache-2.0

import { registerAs } from '@nestjs/config';
import { DatabaseConfig } from '../interfaces/iDatabaseConfig';
import { ConfigService } from '@nestjs/config';

export default registerAs('database', (): DatabaseConfig => {
  // At this point, environment variables have already been validated by env.validation.ts
  // We can safely use the validated configuration from the global config
  const configService = new ConfigService();
  const dbConfig = configService.get<DatabaseConfig>('database');

  if (!dbConfig) {
    throw new Error('Database configuration not found');
  }

  return {
    host: dbConfig.host,
    port: dbConfig.port,
    user: dbConfig.user,
    password: dbConfig.password,
    database: dbConfig.database,
    ssl: dbConfig.ssl,
    connectionTimeoutMillis: dbConfig.connectionTimeoutMillis,
    idleTimeoutMillis: dbConfig.idleTimeoutMillis,
    max: dbConfig.max,
    min: dbConfig.min,
  };
});
