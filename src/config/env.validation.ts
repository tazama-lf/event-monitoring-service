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
  readonly configurationDatabaseUrl: string;
  readonly database: {
    readonly host: string;
    readonly port: number;
    readonly user: string;
    readonly password: string;
    readonly name: string;
    readonly ssl: boolean;
    readonly min?: number;
    readonly max?: number;
  };
  readonly redis: {
    readonly host: string;
    readonly port: number;
    readonly password: string;
    readonly db: number;
    readonly isCluster: boolean;
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
  readonly auth: {
    readonly tazamaAuthUrl: string;
    readonly authPublicKeyPath: string;
    readonly certPathPublic: string;
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

  // Validate database port range
  if (dbPort < 1 || dbPort > 65535) {
    throw new Error('Environment variable DB_PORT must be between 1 and 65535');
  }

  // Validate cache TTL if provided (using TTL instead of CACHE_TTL)
  const cacheTtl = config.TTL as string;
  if (cacheTtl && (isNaN(parseInt(cacheTtl, 10)) || parseInt(cacheTtl, 10) <= 0)) {
    throw new Error('Environment variable TTL must be a positive number');
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
    port: parseInt(config.APP_PORT as string, 10),
    configurationDatabaseUrl: config.CONFIGURATION_DATABASE_URL as string,
    database: {
      host: (config.DB_HOST as string) || ('localhost' as string),
      port: dbPort,
      user: (config.DB_USER as string) || 'postgres',
      password: (config.DB_PASSWORD as string) || 'password',
      name: (config.DB_NAME as string) || 'event_monitoring_dev',
      ssl: config.NODE_ENV === 'production',
      min: config.DB_MIN_CONNECTIONS ? parseInt(config.DB_MIN_CONNECTIONS as string, 10) : undefined,
      max: config.DB_MAX_CONNECTIONS ? parseInt(config.DB_MAX_CONNECTIONS as string, 10) : undefined,
    },
    redis: {
      host: config.REDIS_HOST as string,
      port: redisPort,
      password: config.REDIS_PASSWORD as string,
      db: parseInt(config.REDIS_DB as string, 10) || 0,
      isCluster: config.REDIS_IS_CLUSTER as boolean,
    },
    nats: {
      serverUrl: config.SERVER_URL as string,
      startupType: config.STARTUP_TYPE as string,
      producerStream: (config.PRODUCER_STREAM as string) || 'config.notification',
      consumerStream: (config.CONSUMER_STREAM as string) || 'config.notification',
      streamSubject: (config.STREAM_SUBJECT as string) || 'config.notification',
    },
    cache: {
      timeToLive: parseInt(config.TTL as string, 10) || 3600, // Using TTL instead of CACHE_TTL
    },
    auth: {
      tazamaAuthUrl: (config.TAZAMA_AUTH_URL as string) || '',
      authPublicKeyPath: (config.AUTH_PUBLIC_KEY_PATH as string) || '',
      certPathPublic: (config.CERT_PATH_PUBLIC as string) || '',
    },
  };
}
