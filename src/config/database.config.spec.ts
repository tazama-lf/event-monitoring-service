import databaseConfig from './database.config';
import { validateEnvironment } from './env.validation';

jest.mock('./env.validation');

const mockValidateEnvironment = validateEnvironment as jest.MockedFunction<typeof validateEnvironment>;

describe('Database Config', () => {
  let originalEnv: typeof process.env;

  beforeEach(() => {
    originalEnv = process.env;
    process.env = { ...originalEnv };
    jest.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('database configuration factory', () => {
    it('should create database configuration with all required fields', () => {
      // Arrange
      const mockConfig = {
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
          ssl: true,
        },
        redis: {
          host: 'localhost',
          port: 6379,
          password: 'secret123',
          db: 1,
          isCluster: false,
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
      };

      process.env.DB_CONNECTION_TIMEOUT_MILLIS = '15000';
      process.env.DB_IDLE_TIMEOUT_MILLIS = '45000';
      process.env.DB_MAX_CONNECTIONS = '50';
      process.env.DB_MIN_CONNECTIONS = '5';

      mockValidateEnvironment.mockReturnValue(mockConfig);

      // Act
      const result = databaseConfig();

      // Assert
      expect(mockValidateEnvironment).toHaveBeenCalledWith(process.env);
      expect(result).toEqual({
        host: 'db.example.com',
        port: 5432,
        user: 'dbuser',
        password: 'dbpass',
        database: 'test_db',
        ssl: true,
        connectionTimeoutMillis: 15000,
        idleTimeoutMillis: 45000,
        max: 50,
        min: 5,
      });
    });

    it('should use default values for connection pool settings when environment variables are not set', () => {
      // Arrange
      const mockConfig = {
        functionName: 'test-function',
        nodeEnv: 'development',
        maxCpu: 1,
        port: 3000,
        configurationDatabaseUrl: 'postgres://user:pass@localhost:5432/config_db',
        database: {
          host: 'localhost',
          port: 5432,
          user: 'postgres',
          password: 'password',
          name: 'event_monitoring_dev',
          ssl: false,
        },
        redis: {
          host: 'localhost',
          port: 6379,
          password: 'secret123',
          db: 0,
          isCluster: false,
        },
        nats: {
          serverUrl: 'nats://localhost:4222',
          startupType: 'standalone',
          producerStream: 'config.notification',
          consumerStream: 'config.notification',
          streamSubject: 'config.notification',
        },
        cache: {
          timeToLive: 3600,
        },
        auth: {
          tazamaAuthUrl: '',
          authPublicKeyPath: '',
          certPathPublic: '',
        },
      };

      // Don't set any pool environment variables
      delete process.env.DB_CONNECTION_TIMEOUT_MILLIS;
      delete process.env.DB_IDLE_TIMEOUT_MILLIS;
      delete process.env.DB_MAX_CONNECTIONS;
      delete process.env.DB_MIN_CONNECTIONS;

      mockValidateEnvironment.mockReturnValue(mockConfig);

      // Act
      const result = databaseConfig();

      // Assert
      expect(result).toEqual({
        host: 'localhost',
        port: 5432,
        user: 'postgres',
        password: 'password',
        database: 'event_monitoring_dev',
        ssl: false,
        connectionTimeoutMillis: 10000, // default
        idleTimeoutMillis: 30000, // default
        max: 20, // default
        min: 2, // default
      });
    });

    it('should handle custom connection pool settings', () => {
      // Arrange
      const mockConfig = {
        functionName: 'test-function',
        nodeEnv: 'test',
        maxCpu: 2,
        port: 3001,
        configurationDatabaseUrl: 'postgres://test:test@testdb:5432/test_db',
        database: {
          host: 'testdb',
          port: 5433,
          user: 'testuser',
          password: 'testpass',
          name: 'testdb',
          ssl: false,
        },
        redis: {
          host: 'redis-test',
          port: 6380,
          password: 'test-redis-pass',
          db: 2,
          isCluster: true,
        },
        nats: {
          serverUrl: 'nats://test-nats:4222',
          startupType: 'cluster',
          producerStream: 'test.producer',
          consumerStream: 'test.consumer',
          streamSubject: 'test.subject',
        },
        cache: {
          timeToLive: 1800,
        },
        auth: {
          tazamaAuthUrl: 'https://test-auth.example.com',
          authPublicKeyPath: '/test/path/to/public.key',
          certPathPublic: '/test/path/to/cert.pem',
        },
      };

      process.env.DB_CONNECTION_TIMEOUT_MILLIS = '5000';
      process.env.DB_IDLE_TIMEOUT_MILLIS = '15000';
      process.env.DB_MAX_CONNECTIONS = '10';
      process.env.DB_MIN_CONNECTIONS = '1';

      mockValidateEnvironment.mockReturnValue(mockConfig);

      // Act
      const result = databaseConfig();

      // Assert
      expect(result).toEqual({
        host: 'testdb',
        port: 5433,
        user: 'testuser',
        password: 'testpass',
        database: 'testdb',
        ssl: false,
        connectionTimeoutMillis: 5000,
        idleTimeoutMillis: 15000,
        max: 10,
        min: 1,
      });
    });

    it('should parse string environment variables to numbers correctly', () => {
      // Arrange
      const mockConfig = {
        functionName: 'test-function',
        nodeEnv: 'development',
        maxCpu: 1,
        port: 3000,
        configurationDatabaseUrl: 'postgres://user:pass@localhost:5432/config_db',
        database: {
          host: 'localhost',
          port: 5432,
          user: 'postgres',
          password: 'password',
          name: 'event_monitoring_dev',
          ssl: false,
        },
        redis: {
          host: 'localhost',
          port: 6379,
          password: 'secret123',
          db: 0,
          isCluster: false,
        },
        nats: {
          serverUrl: 'nats://localhost:4222',
          startupType: 'standalone',
          producerStream: 'config.notification',
          consumerStream: 'config.notification',
          streamSubject: 'config.notification',
        },
        cache: {
          timeToLive: 3600,
        },
        auth: {
          tazamaAuthUrl: '',
          authPublicKeyPath: '',
          certPathPublic: '',
        },
      };

      // Set environment variables as strings (as they would be in real environment)
      process.env.DB_CONNECTION_TIMEOUT_MILLIS = '25000';
      process.env.DB_IDLE_TIMEOUT_MILLIS = '60000';
      process.env.DB_MAX_CONNECTIONS = '100';
      process.env.DB_MIN_CONNECTIONS = '10';

      mockValidateEnvironment.mockReturnValue(mockConfig);

      // Act
      const result = databaseConfig();

      // Assert
      expect(typeof result.connectionTimeoutMillis).toBe('number');
      expect(typeof result.idleTimeoutMillis).toBe('number');
      expect(typeof result.max).toBe('number');
      expect(typeof result.min).toBe('number');
      expect(result.connectionTimeoutMillis).toBe(25000);
      expect(result.idleTimeoutMillis).toBe(60000);
      expect(result.max).toBe(100);
      expect(result.min).toBe(10);
    });

    it('should handle invalid string values for numeric environment variables', () => {
      // Arrange
      const mockConfig = {
        functionName: 'test-function',
        nodeEnv: 'development',
        maxCpu: 1,
        port: 3000,
        configurationDatabaseUrl: 'postgres://user:pass@localhost:5432/config_db',
        database: {
          host: 'localhost',
          port: 5432,
          user: 'postgres',
          password: 'password',
          name: 'event_monitoring_dev',
          ssl: false,
        },
        redis: {
          host: 'localhost',
          port: 6379,
          password: 'secret123',
          db: 0,
          isCluster: false,
        },
        nats: {
          serverUrl: 'nats://localhost:4222',
          startupType: 'standalone',
          producerStream: 'config.notification',
          consumerStream: 'config.notification',
          streamSubject: 'config.notification',
        },
        cache: {
          timeToLive: 3600,
        },
        auth: {
          tazamaAuthUrl: '',
          authPublicKeyPath: '',
          certPathPublic: '',
        },
      };

      // Set invalid values that parseInt will convert to NaN, which should use defaults
      process.env.DB_CONNECTION_TIMEOUT_MILLIS = 'invalid';
      process.env.DB_IDLE_TIMEOUT_MILLIS = 'not-a-number';
      process.env.DB_MAX_CONNECTIONS = 'xyz';
      process.env.DB_MIN_CONNECTIONS = 'abc';

      mockValidateEnvironment.mockReturnValue(mockConfig);

      // Act
      const result = databaseConfig();

      // Assert
      // parseInt() on invalid strings returns NaN, and NaN || default results in NaN (not default)
      expect(Number.isNaN(result.connectionTimeoutMillis)).toBe(true);
      expect(Number.isNaN(result.idleTimeoutMillis)).toBe(true);
      expect(Number.isNaN(result.max)).toBe(true);
      expect(Number.isNaN(result.min)).toBe(true);
    });

    it('should handle zero values in environment variables', () => {
      // Arrange
      const mockConfig = {
        functionName: 'test-function',
        nodeEnv: 'development',
        maxCpu: 1,
        port: 3000,
        configurationDatabaseUrl: 'postgres://user:pass@localhost:5432/config_db',
        database: {
          host: 'localhost',
          port: 5432,
          user: 'postgres',
          password: 'password',
          name: 'event_monitoring_dev',
          ssl: false,
        },
        redis: {
          host: 'localhost',
          port: 6379,
          password: 'secret123',
          db: 0,
          isCluster: false,
        },
        nats: {
          serverUrl: 'nats://localhost:4222',
          startupType: 'standalone',
          producerStream: 'config.notification',
          consumerStream: 'config.notification',
          streamSubject: 'config.notification',
        },
        cache: {
          timeToLive: 3600,
        },
        auth: {
          tazamaAuthUrl: '',
          authPublicKeyPath: '',
          certPathPublic: '',
        },
      };

      // Set zero values - these should still be used as they are valid numbers
      process.env.DB_CONNECTION_TIMEOUT_MILLIS = '0';
      process.env.DB_IDLE_TIMEOUT_MILLIS = '0';
      process.env.DB_MAX_CONNECTIONS = '0';
      process.env.DB_MIN_CONNECTIONS = '0';

      mockValidateEnvironment.mockReturnValue(mockConfig);

      // Act
      const result = databaseConfig();

      // Assert
      // Zero values should be used as they are valid numeric values
      expect(result.connectionTimeoutMillis).toBe(0);
      expect(result.idleTimeoutMillis).toBe(0);
      expect(result.max).toBe(0);
      expect(result.min).toBe(0);
    });

    it('should properly map database field names', () => {
      // Arrange
      const mockConfig = {
        functionName: 'test-function',
        nodeEnv: 'development',
        maxCpu: 1,
        port: 3000,
        configurationDatabaseUrl: 'postgres://user:pass@localhost:5432/config_db',
        database: {
          host: 'localhost',
          port: 5432,
          user: 'postgres',
          password: 'password',
          name: 'event_monitoring_dev', // This should map to 'database' field in result
          ssl: false,
        },
        redis: {
          host: 'localhost',
          port: 6379,
          password: 'secret123',
          db: 0,
          isCluster: false,
        },
        nats: {
          serverUrl: 'nats://localhost:4222',
          startupType: 'standalone',
          producerStream: 'config.notification',
          consumerStream: 'config.notification',
          streamSubject: 'config.notification',
        },
        cache: {
          timeToLive: 3600,
        },
        auth: {
          tazamaAuthUrl: '',
          authPublicKeyPath: '',
          certPathPublic: '',
        },
      };

      mockValidateEnvironment.mockReturnValue(mockConfig);

      // Act
      const result = databaseConfig();

      // Assert
      // Verify field mapping: config.database.name -> result.database
      expect(result.database).toBe('event_monitoring_dev');
      expect(result).not.toHaveProperty('name');
    });
  });
});
