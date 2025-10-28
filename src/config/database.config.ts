// SPDX-License-Identifier: Apache-2.0

import { registerAs } from '@nestjs/config';

export interface DatabaseConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  ssl?: boolean;
  connectionTimeoutMillis?: number;
  idleTimeoutMillis?: number;
  max?: number; // Maximum number of clients in the pool
  min?: number; // Minimum number of clients in the pool
}

export default registerAs('database', (): DatabaseConfig => {
  // At this point, environment variables have already been validated by env.validation.ts
  // We can safely use the validated configuration from the global config
  const config = process.env;

  return {
    host: config.DB_HOST!,
    port: parseInt(config.DB_PORT!, 10),
    user: config.DB_USER!,
    password: config.DB_PASSWORD!,
    database: config.DB_NAME!,
    ssl: config.NODE_ENV === 'production',
    connectionTimeoutMillis: parseInt(config.DB_CONNECTION_TIMEOUT!, 10),
    idleTimeoutMillis: parseInt(config.DB_IDLE_TIMEOUT!, 10),
    max: parseInt(config.DB_POOL_MAX!, 10),
    min: parseInt(config.DB_POOL_MIN!, 10),
  };
});
