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
    readonly min: number;
    readonly max: number;
    readonly connectionTimeoutMillis: number;
    readonly idleTimeoutMillis: number;
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
  /**
   * Helper function to parse and validate integer environment variables
   * @param name - Environment variable name
   * @param value - Raw environment variable value
   * @param opts - Parsing options (default, min, max)
   * @returns Parsed and validated integer
   */
  const parseIntEnv = (name: string, value: unknown, opts: { default?: number; min?: number; max?: number } = {}): number => {
    if (value === undefined || value === null || value === '') {
      if (opts.default !== undefined) return opts.default;
      throw new Error(`Environment variable ${name} is required`);
    }
    const str = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : JSON.stringify(value);
    if (!/^\d+$/.test(str)) {
      throw new Error(`Environment variable ${name} must be an integer`);
    }
    const n = Number.parseInt(str, 10);
    if (Number.isNaN(n)) throw new Error(`Environment variable ${name} must be an integer`);
    if (opts.min !== undefined && n < opts.min) {
      throw new Error(`Environment variable ${name} must be >= ${opts.min}`);
    }
    if (opts.max !== undefined && n > opts.max) {
      throw new Error(`Environment variable ${name} must be <= ${opts.max}`);
    }
    return n;
  };

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

  // Validate required database credentials in production
  if (config.NODE_ENV === 'production' && !config.DB_PASSWORD) {
    throw new Error('Environment variable DB_PASSWORD is required in production');
  }

  // Validate database configuration
  const dbPort = parseIntEnv('DB_PORT', config.DB_PORT, { default: 5432, min: 1, max: 65535 });

  // Validate cache TTL if provided (using TTL instead of CACHE_TTL)
  const cacheTtl = parseIntEnv('TTL', config.TTL, { default: 3600, min: 1 });

  // Validate Redis port
  const redisPort = parseIntEnv('REDIS_PORT', config.REDIS_PORT, { min: 1, max: 65535 });

  // Validate required APP_PORT
  const appPort = parseIntEnv('APP_PORT', config.APP_PORT, { min: 1, max: 65535 });

  // Validate database connection pool settings
  const dbMinConnections = parseIntEnv('DB_MIN_CONNECTIONS', config.DB_MIN_CONNECTIONS, { default: 2, min: 0 });
  const dbMaxConnections = parseIntEnv('DB_MAX_CONNECTIONS', config.DB_MAX_CONNECTIONS, { default: 20, min: 0 });
  const dbConnectionTimeout = parseIntEnv('DB_CONNECTION_TIMEOUT_MILLIS', config.DB_CONNECTION_TIMEOUT_MILLIS, { default: 10000, min: 1 });
  const dbIdleTimeout = parseIntEnv('DB_IDLE_TIMEOUT_MILLIS', config.DB_IDLE_TIMEOUT_MILLIS, { default: 30000, min: 1 });

  // Validate connection pool values
  if (dbMaxConnections < dbMinConnections) {
    throw new Error('Environment variable DB_MAX_CONNECTIONS must be greater than or equal to DB_MIN_CONNECTIONS');
  }

  return {
    functionName: (config.FUNCTION_NAME as string) || 'event-monitoring-service',
    nodeEnv: (config.NODE_ENV as string) || 'development',
    maxCpu: parseIntEnv('MAX_CPU', config.MAX_CPU, { default: 1, min: 1 }),
    port: appPort,
    configurationDatabaseUrl: config.CONFIGURATION_DATABASE_URL as string,
    database: {
      host: (config.DB_HOST as string) || ('localhost' as string),
      port: dbPort,
      user: (config.DB_USER as string) || 'postgres',
      password: (config.DB_PASSWORD as string) || 'CHANGEME',
      name: (config.DB_NAME as string) || 'event_monitoring_dev',
      ssl: config.NODE_ENV === 'production',
      min: dbMinConnections,
      max: dbMaxConnections,
      connectionTimeoutMillis: dbConnectionTimeout,
      idleTimeoutMillis: dbIdleTimeout,
    },
    redis: {
      host: config.REDIS_HOST as string,
      port: redisPort,
      password: config.REDIS_PASSWORD as string,
      db: parseIntEnv('REDIS_DB', config.REDIS_DB, { default: 0, min: 0 }),
      isCluster: config.REDIS_IS_CLUSTER === 'true' || config.REDIS_IS_CLUSTER === true,
    },
    nats: {
      serverUrl: config.SERVER_URL as string,
      startupType: config.STARTUP_TYPE as string,
      producerStream: (config.PRODUCER_STREAM as string) || 'config.notification',
      consumerStream: (config.CONSUMER_STREAM as string) || 'config.notification',
      streamSubject: (config.STREAM_SUBJECT as string) || 'config.notification',
    },
    cache: {
      timeToLive: cacheTtl,
    },
    auth: {
      tazamaAuthUrl: (config.TAZAMA_AUTH_URL as string) || '',
      authPublicKeyPath: (config.AUTH_PUBLIC_KEY_PATH as string) || '',
      certPathPublic: (config.CERT_PATH_PUBLIC as string) || '',
    },
  };
}
