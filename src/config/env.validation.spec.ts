import { validateEnvironment } from './env.validation';

describe('Environment Validation', () => {
  let originalEnv: typeof process.env;

  beforeEach(() => {
    originalEnv = process.env;
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('validateEnvironment', () => {
    it('should validate all required environment variables and return valid configuration', () => {
      // Arrange
      const config = {
        CONFIGURATION_DATABASE_URL: 'postgres://user:pass@localhost:5432/config_db',
        REDIS_HOST: 'localhost',
        REDIS_PORT: '6379',
        REDIS_PASSWORD: 'secret123',
        SERVER_URL: 'nats://localhost:4222',
        STARTUP_TYPE: 'standalone',
        FUNCTION_NAME: 'test-function',
        NODE_ENV: 'production',
        MAX_CPU: '4',
        APP_PORT: '3000',
        DB_HOST: 'db.example.com',
        DB_PORT: '5432',
        DB_USER: 'dbuser',
        DB_PASSWORD: 'dbpass',
        DB_NAME: 'test_db',
        REDIS_DB: '1',
        REDIS_IS_CLUSTER: 'true',
        PRODUCER_STREAM: 'test.producer',
        CONSUMER_STREAM: 'test.consumer',
        STREAM_SUBJECT: 'test.subject',
        TTL: '7200',
        TAZAMA_AUTH_URL: 'https://auth.example.com',
        AUTH_PUBLIC_KEY_PATH: '/path/to/public.key',
        CERT_PATH_PUBLIC: '/path/to/cert.pem',
      };

      // Act
      const result = validateEnvironment(config);

      // Assert
      expect(result).toEqual({
        functionName: 'test-function',
        nodeEnv: 'production',
        maxCpu: 4,
        port: 3000,
        configurationDatabaseUrl: 'postgres://user:pass@localhost:5432/config_db',
        database: {
          host: 'db.example.com',
          port: 5432,
          user: 'dbuser',
          password: 'dbpass',
          name: 'test_db',
          ssl: true, // NODE_ENV is production
        },
        redis: {
          host: 'localhost',
          port: 6379,
          password: 'secret123',
          db: 1,
          isCluster: 'true',
        },
        nats: {
          serverUrl: 'nats://localhost:4222',
          startupType: 'standalone',
          producerStream: 'test.producer',
          consumerStream: 'test.consumer',
          streamSubject: 'test.subject',
        },
        cache: {
          timeToLive: 7200,
        },
        auth: {
          tazamaAuthUrl: 'https://auth.example.com',
          authPublicKeyPath: '/path/to/public.key',
          certPathPublic: '/path/to/cert.pem',
        },
      });
    });

    it('should use default values when optional environment variables are not provided', () => {
      // Arrange
      const config = {
        CONFIGURATION_DATABASE_URL: 'postgres://user:pass@localhost:5432/config_db',
        REDIS_HOST: 'localhost',
        REDIS_PORT: '6379',
        REDIS_PASSWORD: 'secret123',
        SERVER_URL: 'nats://localhost:4222',
        STARTUP_TYPE: 'standalone',
        NODE_ENV: 'development',
      };

      // Act
      const result = validateEnvironment(config);

      // Assert
      expect(result.functionName).toBe('event-monitoring-service');
      expect(result.nodeEnv).toBe('development');
      expect(result.maxCpu).toBe(1);
      expect(result.database.host).toBe('localhost');
      expect(result.database.port).toBe(5432);
      expect(result.database.user).toBe('postgres');
      expect(result.database.password).toBe('password');
      expect(result.database.name).toBe('event_monitoring_dev');
      expect(result.database.ssl).toBe(false); // NODE_ENV is not production
      expect(result.redis.db).toBe(0);
      expect(result.nats.producerStream).toBe('config.notification');
      expect(result.nats.consumerStream).toBe('config.notification');
      expect(result.nats.streamSubject).toBe('config.notification');
      expect(result.cache.timeToLive).toBe(3600);
      expect(result.auth.tazamaAuthUrl).toBe('');
      expect(result.auth.authPublicKeyPath).toBe('');
      expect(result.auth.certPathPublic).toBe('');
    });

    // Required environment variable validation tests
    it('should throw error when CONFIGURATION_DATABASE_URL is missing', () => {
      // Arrange
      const config = {
        REDIS_HOST: 'localhost',
        REDIS_PORT: '6379',
        REDIS_PASSWORD: 'secret123',
        SERVER_URL: 'nats://localhost:4222',
        STARTUP_TYPE: 'standalone',
      };

      // Act & Assert
      expect(() => validateEnvironment(config)).toThrow('Environment variable CONFIGURATION_DATABASE_URL is required');
    });

    it('should throw error when REDIS_HOST is missing', () => {
      // Arrange
      const config = {
        CONFIGURATION_DATABASE_URL: 'postgres://user:pass@localhost:5432/config_db',
        REDIS_PORT: '6379',
        REDIS_PASSWORD: 'secret123',
        SERVER_URL: 'nats://localhost:4222',
        STARTUP_TYPE: 'standalone',
      };

      // Act & Assert
      expect(() => validateEnvironment(config)).toThrow('Environment variable REDIS_HOST is required');
    });

    it('should throw error when REDIS_PORT is missing', () => {
      // Arrange
      const config = {
        CONFIGURATION_DATABASE_URL: 'postgres://user:pass@localhost:5432/config_db',
        REDIS_HOST: 'localhost',
        REDIS_PASSWORD: 'secret123',
        SERVER_URL: 'nats://localhost:4222',
        STARTUP_TYPE: 'standalone',
      };

      // Act & Assert
      expect(() => validateEnvironment(config)).toThrow('Environment variable REDIS_PORT is required');
    });

    it('should throw error when REDIS_PASSWORD is missing', () => {
      // Arrange
      const config = {
        CONFIGURATION_DATABASE_URL: 'postgres://user:pass@localhost:5432/config_db',
        REDIS_HOST: 'localhost',
        REDIS_PORT: '6379',
        SERVER_URL: 'nats://localhost:4222',
        STARTUP_TYPE: 'standalone',
      };

      // Act & Assert
      expect(() => validateEnvironment(config)).toThrow('Environment variable REDIS_PASSWORD is required');
    });

    it('should throw error when SERVER_URL is missing', () => {
      // Arrange
      const config = {
        CONFIGURATION_DATABASE_URL: 'postgres://user:pass@localhost:5432/config_db',
        REDIS_HOST: 'localhost',
        REDIS_PORT: '6379',
        REDIS_PASSWORD: 'secret123',
        STARTUP_TYPE: 'standalone',
      };

      // Act & Assert
      expect(() => validateEnvironment(config)).toThrow('Environment variable SERVER_URL is required');
    });

    it('should throw error when STARTUP_TYPE is missing', () => {
      // Arrange
      const config = {
        CONFIGURATION_DATABASE_URL: 'postgres://user:pass@localhost:5432/config_db',
        REDIS_HOST: 'localhost',
        REDIS_PORT: '6379',
        REDIS_PASSWORD: 'secret123',
        SERVER_URL: 'nats://localhost:4222',
      };

      // Act & Assert
      expect(() => validateEnvironment(config)).toThrow('Environment variable STARTUP_TYPE is required');
    });

    // Port validation tests
    it('should use default DB_PORT when DB_PORT is 0 (due to logical OR)', () => {
      // Arrange
      const config = {
        CONFIGURATION_DATABASE_URL: 'postgres://user:pass@localhost:5432/config_db',
        REDIS_HOST: 'localhost',
        REDIS_PORT: '6379',
        REDIS_PASSWORD: 'secret123',
        SERVER_URL: 'nats://localhost:4222',
        STARTUP_TYPE: 'standalone',
        DB_PORT: '0',
      };

      // Act
      const result = validateEnvironment(config);

      // Assert
      // Due to parseInt('0') || 5432, this should use the default 5432
      expect(result.database.port).toBe(5432);
    });

    it('should throw error when DB_PORT is explicitly invalid after parsing', () => {
      // Arrange
      const config = {
        CONFIGURATION_DATABASE_URL: 'postgres://user:pass@localhost:5432/config_db',
        REDIS_HOST: 'localhost',
        REDIS_PORT: '6379',
        REDIS_PASSWORD: 'secret123',
        SERVER_URL: 'nats://localhost:4222',
        STARTUP_TYPE: 'standalone',
        DB_PORT: '65536',
      };

      // Act & Assert
      expect(() => validateEnvironment(config)).toThrow('Environment variable DB_PORT must be between 1 and 65535');
    });

    it('should throw error when REDIS_PORT is not a valid number', () => {
      // Arrange
      const config = {
        CONFIGURATION_DATABASE_URL: 'postgres://user:pass@localhost:5432/config_db',
        REDIS_HOST: 'localhost',
        REDIS_PORT: 'invalid',
        REDIS_PASSWORD: 'secret123',
        SERVER_URL: 'nats://localhost:4222',
        STARTUP_TYPE: 'standalone',
      };

      // Act & Assert
      expect(() => validateEnvironment(config)).toThrow('Environment variable REDIS_PORT must be a valid port number between 1 and 65535');
    });

    it('should throw error when REDIS_PORT is below valid range', () => {
      // Arrange
      const config = {
        CONFIGURATION_DATABASE_URL: 'postgres://user:pass@localhost:5432/config_db',
        REDIS_HOST: 'localhost',
        REDIS_PORT: '0',
        REDIS_PASSWORD: 'secret123',
        SERVER_URL: 'nats://localhost:4222',
        STARTUP_TYPE: 'standalone',
      };

      // Act & Assert
      expect(() => validateEnvironment(config)).toThrow('Environment variable REDIS_PORT must be a valid port number between 1 and 65535');
    });

    it('should throw error when REDIS_PORT is above valid range', () => {
      // Arrange
      const config = {
        CONFIGURATION_DATABASE_URL: 'postgres://user:pass@localhost:5432/config_db',
        REDIS_HOST: 'localhost',
        REDIS_PORT: '65536',
        REDIS_PASSWORD: 'secret123',
        SERVER_URL: 'nats://localhost:4222',
        STARTUP_TYPE: 'standalone',
      };

      // Act & Assert
      expect(() => validateEnvironment(config)).toThrow('Environment variable REDIS_PORT must be a valid port number between 1 and 65535');
    });

    // TTL validation tests
    it('should throw error when TTL is not a valid number', () => {
      // Arrange
      const config = {
        CONFIGURATION_DATABASE_URL: 'postgres://user:pass@localhost:5432/config_db',
        REDIS_HOST: 'localhost',
        REDIS_PORT: '6379',
        REDIS_PASSWORD: 'secret123',
        SERVER_URL: 'nats://localhost:4222',
        STARTUP_TYPE: 'standalone',
        TTL: 'invalid',
      };

      // Act & Assert
      expect(() => validateEnvironment(config)).toThrow('Environment variable TTL must be a positive number');
    });

    it('should throw error when TTL is zero', () => {
      // Arrange
      const config = {
        CONFIGURATION_DATABASE_URL: 'postgres://user:pass@localhost:5432/config_db',
        REDIS_HOST: 'localhost',
        REDIS_PORT: '6379',
        REDIS_PASSWORD: 'secret123',
        SERVER_URL: 'nats://localhost:4222',
        STARTUP_TYPE: 'standalone',
        TTL: '0',
      };

      // Act & Assert
      expect(() => validateEnvironment(config)).toThrow('Environment variable TTL must be a positive number');
    });

    it('should throw error when TTL is negative', () => {
      // Arrange
      const config = {
        CONFIGURATION_DATABASE_URL: 'postgres://user:pass@localhost:5432/config_db',
        REDIS_HOST: 'localhost',
        REDIS_PORT: '6379',
        REDIS_PASSWORD: 'secret123',
        SERVER_URL: 'nats://localhost:4222',
        STARTUP_TYPE: 'standalone',
        TTL: '-100',
      };

      // Act & Assert
      expect(() => validateEnvironment(config)).toThrow('Environment variable TTL must be a positive number');
    });

    // SSL configuration tests
    it('should set ssl to true when NODE_ENV is production', () => {
      // Arrange
      const config = {
        CONFIGURATION_DATABASE_URL: 'postgres://user:pass@localhost:5432/config_db',
        REDIS_HOST: 'localhost',
        REDIS_PORT: '6379',
        REDIS_PASSWORD: 'secret123',
        SERVER_URL: 'nats://localhost:4222',
        STARTUP_TYPE: 'standalone',
        NODE_ENV: 'production',
      };

      // Act
      const result = validateEnvironment(config);

      // Assert
      expect(result.database.ssl).toBe(true);
    });

    it('should set ssl to false when NODE_ENV is not production', () => {
      // Arrange
      const config = {
        CONFIGURATION_DATABASE_URL: 'postgres://user:pass@localhost:5432/config_db',
        REDIS_HOST: 'localhost',
        REDIS_PORT: '6379',
        REDIS_PASSWORD: 'secret123',
        SERVER_URL: 'nats://localhost:4222',
        STARTUP_TYPE: 'standalone',
        NODE_ENV: 'development',
      };

      // Act
      const result = validateEnvironment(config);

      // Assert
      expect(result.database.ssl).toBe(false);
    });

    // Edge cases for port validation
    it('should use default DB_PORT 5432 when DB_PORT is invalid string', () => {
      // Arrange
      const config = {
        CONFIGURATION_DATABASE_URL: 'postgres://user:pass@localhost:5432/config_db',
        REDIS_HOST: 'localhost',
        REDIS_PORT: '6379',
        REDIS_PASSWORD: 'secret123',
        SERVER_URL: 'nats://localhost:4222',
        STARTUP_TYPE: 'standalone',
        DB_PORT: 'invalid',
      };

      // Act
      const result = validateEnvironment(config);

      // Assert
      expect(result.database.port).toBe(5432);
    });

    it('should validate boundary values for DB_PORT', () => {
      // Arrange
      const config = {
        CONFIGURATION_DATABASE_URL: 'postgres://user:pass@localhost:5432/config_db',
        REDIS_HOST: 'localhost',
        REDIS_PORT: '6379',
        REDIS_PASSWORD: 'secret123',
        SERVER_URL: 'nats://localhost:4222',
        STARTUP_TYPE: 'standalone',
        DB_PORT: '1',
      };

      // Act
      const result = validateEnvironment(config);

      // Assert
      expect(result.database.port).toBe(1);
    });

    it('should validate max boundary values for DB_PORT', () => {
      // Arrange
      const config = {
        CONFIGURATION_DATABASE_URL: 'postgres://user:pass@localhost:5432/config_db',
        REDIS_HOST: 'localhost',
        REDIS_PORT: '6379',
        REDIS_PASSWORD: 'secret123',
        SERVER_URL: 'nats://localhost:4222',
        STARTUP_TYPE: 'standalone',
        DB_PORT: '65535',
      };

      // Act
      const result = validateEnvironment(config);

      // Assert
      expect(result.database.port).toBe(65535);
    });

    it('should validate boundary values for REDIS_PORT', () => {
      // Arrange
      const config = {
        CONFIGURATION_DATABASE_URL: 'postgres://user:pass@localhost:5432/config_db',
        REDIS_HOST: 'localhost',
        REDIS_PORT: '1',
        REDIS_PASSWORD: 'secret123',
        SERVER_URL: 'nats://localhost:4222',
        STARTUP_TYPE: 'standalone',
      };

      // Act
      const result = validateEnvironment(config);

      // Assert
      expect(result.redis.port).toBe(1);
    });

    it('should validate max boundary values for REDIS_PORT', () => {
      // Arrange
      const config = {
        CONFIGURATION_DATABASE_URL: 'postgres://user:pass@localhost:5432/config_db',
        REDIS_HOST: 'localhost',
        REDIS_PORT: '65535',
        REDIS_PASSWORD: 'secret123',
        SERVER_URL: 'nats://localhost:4222',
        STARTUP_TYPE: 'standalone',
      };

      // Act
      const result = validateEnvironment(config);

      // Assert
      expect(result.redis.port).toBe(65535);
    });
  });
});
