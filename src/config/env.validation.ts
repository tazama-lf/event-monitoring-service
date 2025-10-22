// SPDX-License-Identifier: Apache-2.0

/**
 * Configuration validation schema for the Event Monitoring Service
 */
export interface AppConfiguration {
  readonly port: number;
  readonly nodeEnv: string;
  readonly configurationDatabaseUrl: string;
  readonly database: {
    readonly host: string;
    readonly port: number;
    readonly user: string;
    readonly password: string;
    readonly name: string;
  };
  readonly redis: {
    readonly host: string;
    readonly port: number;
    readonly password: string;
    readonly db: number;
  };
}

/**
 * Validates and transforms environment variables into a strongly-typed configuration object
 * @param config - Raw environment variables
 * @returns Validated and typed configuration
 */
export function validateEnvironment(config: Record<string, unknown>): AppConfiguration {
  // Validate required environment variables
  if (!config.CONFIGURATION_DATABASE_URL) {
    throw new Error('Environment variable CONFIGURATION_DATABASE_URL is required');
  }

  // Validate required Redis environment variables
  if (!config.REDIS_HOST) {
    throw new Error('Environment variable REDIS_HOST is required');
  }
  if (!config.REDIS_PORT) {
    throw new Error('Environment variable REDIS_PORT is required');
  }
  if (!config.REDIS_PASSWORD) {
    throw new Error('Environment variable REDIS_PASSWORD is required');
  }

  return {
    port: parseInt(config.APP_PORT as string, 10) || 3002,
    nodeEnv: (config.NODE_ENV as string) || 'development',
    configurationDatabaseUrl: config.CONFIGURATION_DATABASE_URL as string,
    database: {
      host: (config.DB_HOST as string) || 'localhost',
      port: parseInt(config.DB_PORT as string, 10) || 5432,
      user: (config.DB_USER as string) || 'postgres',
      password: (config.DB_PASSWORD as string) || 'password',
      name: (config.DB_NAME as string) || 'event_monitoring_dev',
    },
    redis: {
      host: config.REDIS_HOST as string,
      port: parseInt(config.REDIS_PORT as string, 10),
      password: config.REDIS_PASSWORD as string,
      db: parseInt(config.REDIS_DB as string, 10) || 0,
    },
  };
}
