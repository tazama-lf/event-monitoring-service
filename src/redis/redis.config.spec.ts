import { ConfigService } from '@nestjs/config';
import { createRedisConfig } from './redis.config';

describe('Redis Config', () => {
  let configService: jest.Mocked<ConfigService>;

  beforeEach(() => {
    configService = {
      get: jest.fn(),
    } as any;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createRedisConfig', () => {
    it('should create Redis config with all required fields', () => {
      // Arrange
      configService.get.mockImplementation((key: string, defaultValue?: any) => {
        const configMap: Record<string, any> = {
          'redis.host': 'localhost',
          'redis.port': 6379,
          'redis.password': 'secret123',
          'redis.db': 1,
        };
        return configMap[key] ?? defaultValue;
      });

      // Act
      const result = createRedisConfig(configService);

      // Assert
      expect(result).toEqual({
        db: 1,
        servers: [
          {
            host: 'localhost',
            port: 6379,
          },
        ],
        password: 'secret123',
        isCluster: false,
      });
    });

    it('should use default db value when not configured', () => {
      // Arrange
      configService.get.mockImplementation((key: string, defaultValue?: any) => {
        const configMap: Record<string, any> = {
          'redis.host': 'localhost',
          'redis.port': 6379,
          'redis.password': 'secret123',
        };
        return configMap[key] ?? defaultValue;
      });

      // Act
      const result = createRedisConfig(configService);

      // Assert
      expect(result.db).toBe(0); // default value
      expect(configService.get).toHaveBeenCalledWith('redis.db', 0);
    });

    it('should throw error when host is missing', () => {
      // Arrange
      configService.get.mockImplementation((key: string, defaultValue?: any) => {
        const configMap: Record<string, any> = {
          'redis.port': 6379,
          'redis.password': 'secret123',
        };
        return configMap[key] ?? defaultValue;
      });

      // Act & Assert
      expect(() => createRedisConfig(configService)).toThrow(
        'Redis configuration is incomplete. Check REDIS_HOST, REDIS_PORT, and REDIS_PASSWORD environment variables.',
      );
    });

    it('should throw error when port is missing', () => {
      // Arrange
      configService.get.mockImplementation((key: string, defaultValue?: any) => {
        const configMap: Record<string, any> = {
          'redis.host': 'localhost',
          'redis.password': 'secret123',
        };
        return configMap[key] ?? defaultValue;
      });

      // Act & Assert
      expect(() => createRedisConfig(configService)).toThrow(
        'Redis configuration is incomplete. Check REDIS_HOST, REDIS_PORT, and REDIS_PASSWORD environment variables.',
      );
    });

    it('should throw error when password is missing', () => {
      // Arrange
      configService.get.mockImplementation((key: string, defaultValue?: any) => {
        const configMap: Record<string, any> = {
          'redis.host': 'localhost',
          'redis.port': 6379,
        };
        return configMap[key] ?? defaultValue;
      });

      // Act & Assert
      expect(() => createRedisConfig(configService)).toThrow(
        'Redis configuration is incomplete. Check REDIS_HOST, REDIS_PORT, and REDIS_PASSWORD environment variables.',
      );
    });

    it('should throw error when host is empty string', () => {
      // Arrange
      configService.get.mockImplementation((key: string, defaultValue?: any) => {
        const configMap: Record<string, any> = {
          'redis.host': '',
          'redis.port': 6379,
          'redis.password': 'secret123',
        };
        return configMap[key] ?? defaultValue;
      });

      // Act & Assert
      expect(() => createRedisConfig(configService)).toThrow(
        'Redis configuration is incomplete. Check REDIS_HOST, REDIS_PORT, and REDIS_PASSWORD environment variables.',
      );
    });

    it('should throw error when port is zero', () => {
      // Arrange
      configService.get.mockImplementation((key: string, defaultValue?: any) => {
        const configMap: Record<string, any> = {
          'redis.host': 'localhost',
          'redis.port': 0,
          'redis.password': 'secret123',
        };
        return configMap[key] ?? defaultValue;
      });

      // Act & Assert
      expect(() => createRedisConfig(configService)).toThrow(
        'Redis configuration is incomplete. Check REDIS_HOST, REDIS_PORT, and REDIS_PASSWORD environment variables.',
      );
    });

    it('should throw error when password is empty string', () => {
      // Arrange
      configService.get.mockImplementation((key: string, defaultValue?: any) => {
        const configMap: Record<string, any> = {
          'redis.host': 'localhost',
          'redis.port': 6379,
          'redis.password': '',
        };
        return configMap[key] ?? defaultValue;
      });

      // Act & Assert
      expect(() => createRedisConfig(configService)).toThrow(
        'Redis configuration is incomplete. Check REDIS_HOST, REDIS_PORT, and REDIS_PASSWORD environment variables.',
      );
    });

    it('should create config with different port numbers', () => {
      // Arrange
      configService.get.mockImplementation((key: string, defaultValue?: any) => {
        const configMap: Record<string, any> = {
          'redis.host': 'redis.example.com',
          'redis.port': 6380,
          'redis.password': 'complex-password-123',
          'redis.db': 5,
        };
        return configMap[key] ?? defaultValue;
      });

      // Act
      const result = createRedisConfig(configService);

      // Assert
      expect(result.servers[0]).toEqual({
        host: 'redis.example.com',
        port: 6380,
      });
      expect(result.password).toBe('complex-password-123');
      expect(result.db).toBe(5);
    });

    it('should always set isCluster to false', () => {
      // Arrange
      configService.get.mockImplementation((key: string, defaultValue?: any) => {
        const configMap: Record<string, any> = {
          'redis.host': 'localhost',
          'redis.port': 6379,
          'redis.password': 'secret123',
        };
        return configMap[key] ?? defaultValue;
      });

      // Act
      const result = createRedisConfig(configService);

      // Assert
      expect(result.isCluster).toBe(false);
    });
  });
});
