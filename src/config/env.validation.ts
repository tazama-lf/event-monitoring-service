// SPDX-License-Identifier: Apache-2.0

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

  return {
    functionName: (config.FUNCTION_NAME as string) || 'event-monitoring-service',
    nodeEnv: (config.NODE_ENV as string) || 'development',
    maxCpu: parseInt(config.MAX_CPU as string, 10) || 1,
    port: parseInt(config.APP_PORT as string, 10) || 3002,
    databaseUrl: config.DATABASE_URL as string,
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
    nats: {
      serverUrl: config.SERVER_URL as string,
      startupType: config.STARTUP_TYPE as string,
      producerStream: (config.PRODUCER_STREAM as string) || 'config.notification',
      consumerStream: (config.CONSUMER_STREAM as string) || 'config.notification',
      streamSubject: (config.STREAM_SUBJECT as string) || 'config.notification',
    },
  };
}
