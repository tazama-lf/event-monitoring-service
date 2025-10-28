// SPDX-License-Identifier: Apache-2.0
// This file ensures that the application has all the necessary environment variables configured correctly before it starts running, preventing runtime failures due to missing or invalid configuration.

/**
 * Configuration validation schema for the Event Monitoring Service
 */
export interface AppConfiguration {
  readonly functionName: string;
  readonly nodeEnv: string;
  readonly maxCpu: number;
  readonly port: number;
  readonly databaseUrl: string;
  readonly database: {
    readonly host: string;
    readonly port: number;
    readonly user: string;
    readonly password: string;
    readonly name: string;
    readonly ssl: boolean;
    readonly connectionTimeoutMillis: number;
    readonly idleTimeoutMillis: number;
    readonly max: number;
    readonly min: number;
  };
  readonly redis: {
    readonly host: string;
    readonly port: number;
    readonly password: string;
    readonly db: number;
  };
  readonly nats: {
    readonly serverUrl: string;
    readonly startupType: string;
    readonly producerStream: string;
    readonly consumerStream: string;
    readonly streamSubject: string;
  };
  readonly cache: {
    readonly timeToLive: number;
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

  // Validate required NATS environment variables
  if (!config.SERVER_URL) {
    throw new Error('Environment variable SERVER_URL is required');
  }
  if (!config.STARTUP_TYPE) {
    throw new Error('Environment variable STARTUP_TYPE is required');
  }

  // Validate database configuration
  const dbPort = parseInt(config.DB_PORT as string, 10) || 5432;
  const dbConnectionTimeout = parseInt(config.DB_CONNECTION_TIMEOUT as string, 10) || 10000;
  const dbIdleTimeout = parseInt(config.DB_IDLE_TIMEOUT as string, 10) || 10000;
  const dbPoolMax = parseInt(config.DB_POOL_MAX as string, 10) || 10;
  const dbPoolMin = parseInt(config.DB_POOL_MIN as string, 10) || 2;

  // Validate database port range
  if (dbPort < 1 || dbPort > 65535) {
    throw new Error('Environment variable DB_PORT must be between 1 and 65535');
  }

  // Validate timeout values
  if (dbConnectionTimeout < 1000) {
    throw new Error('Environment variable DB_CONNECTION_TIMEOUT must be at least 1000ms');
  }
  if (dbIdleTimeout < 1000) {
    throw new Error('Environment variable DB_IDLE_TIMEOUT must be at least 1000ms');
  }

  // Validate pool configuration
  if (dbPoolMax < 1) {
    throw new Error('Environment variable DB_POOL_MAX must be at least 1');
  }
  if (dbPoolMin < 0) {
    throw new Error('Environment variable DB_POOL_MIN must be at least 0');
  }
  if (dbPoolMin > dbPoolMax) {
    throw new Error('Environment variable DB_POOL_MIN cannot be greater than DB_POOL_MAX');
  }

  // Validate cache TTL if provided
  const cacheTtl = config.CACHE_TTL as string;
  if (cacheTtl && (isNaN(parseInt(cacheTtl, 10)) || parseInt(cacheTtl, 10) <= 0)) {
    throw new Error('Environment variable CACHE_TTL must be a positive number');
  }

  // Validate Redis port
  const redisPort = parseInt(config.REDIS_PORT as string, 10);
  if (isNaN(redisPort) || redisPort < 1 || redisPort > 65535) {
    throw new Error('Environment variable REDIS_PORT must be a valid port number between 1 and 65535');
  }

  return {
    functionName: (config.FUNCTION_NAME as string) || 'event-monitoring-service',
    nodeEnv: (config.NODE_ENV as string) || 'development',
    maxCpu: parseInt(config.MAX_CPU as string, 10) || 1,
    port: parseInt(config.APP_PORT as string, 10) || 3002,
    databaseUrl: config.DATABASE_URL as string,
    database: {
      host: (config.DB_HOST as string) || 'localhost',
      port: dbPort,
      user: (config.DB_USER as string) || 'postgres',
      password: (config.DB_PASSWORD as string) || 'password',
      name: (config.DB_NAME as string) || 'event_monitoring_dev',
      ssl: config.NODE_ENV === 'production',
      connectionTimeoutMillis: dbConnectionTimeout,
      idleTimeoutMillis: dbIdleTimeout,
      max: dbPoolMax,
      min: dbPoolMin,
    },
    redis: {
      host: config.REDIS_HOST as string,
      port: redisPort,
      password: config.REDIS_PASSWORD as string,
      db: parseInt(config.REDIS_DB as string, 10) || 0,
    },
    nats: {
      serverUrl: config.SERVER_URL as string,
      startupType: config.STARTUP_TYPE as string,
      producerStream: (config.PRODUCER_STREAM as string) || 'config.notification',
      consumerStream: (config.CONSUMER_STREAM as string) || 'config.notification',
      streamSubject: (config.STREAM_SUBJECT as string) || 'config.notification',
    },
    cache: {
      timeToLive: parseInt(config.CACHE_TTL as string, 10) || 3600, // Default to 1 hour if not specified
    },
  };
}
