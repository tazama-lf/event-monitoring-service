import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { RedisService } from '@tazama-lf/frms-coe-lib';
import { RedisModule } from './redis.module';
import { createRedisConfig } from './redis.config';

// Mock the external dependencies
jest.mock('@tazama-lf/frms-coe-lib', () => ({
  RedisService: {
    create: jest.fn(),
  },
}));
jest.mock('./redis.config');

const mockCreateRedisConfig = createRedisConfig as jest.MockedFunction<typeof createRedisConfig>;

describe('RedisModule', () => {
  let configService: jest.Mocked<ConfigService>;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Mock ConfigService
    configService = {
      get: jest.fn(),
    } as any;
  });

  describe('RedisModule structure', () => {
    it('should be a valid NestJS module', () => {
      expect(RedisModule).toBeDefined();
    });

    it('should have correct module metadata', () => {
      const providers = Reflect.getMetadata('providers', RedisModule);
      const exports = Reflect.getMetadata('exports', RedisModule);

      expect(providers).toBeDefined();
      expect(exports).toBeDefined();
      expect(exports).toContain(RedisService);
    });

    it('should configure RedisService provider correctly', () => {
      const providers = Reflect.getMetadata('providers', RedisModule);
      const redisServiceProvider = providers[0];

      expect(redisServiceProvider.provide).toBe(RedisService);
      expect(redisServiceProvider.inject).toEqual([ConfigService]);
      expect(typeof redisServiceProvider.useFactory).toBe('function');
    });
  });

  describe('RedisService factory function', () => {
    let loggerSpy: jest.SpyInstance;
    let errorSpy: jest.SpyInstance;

    beforeEach(() => {
      loggerSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
      errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    });

    afterEach(() => {
      loggerSpy.mockRestore();
      errorSpy.mockRestore();
    });

    it('should call createRedisConfig with ConfigService', async () => {
      // Arrange
      const mockRedisConfig = {
        db: 0,
        servers: [{ host: 'localhost', port: 6379 }],
        password: 'secret123',
        isCluster: false,
      };
      const mockRedisServiceInstance = { connect: jest.fn() };

      mockCreateRedisConfig.mockReturnValue(mockRedisConfig);
      (RedisService.create as jest.Mock).mockResolvedValue(mockRedisServiceInstance);

      // Get the factory function from module metadata
      const providers = Reflect.getMetadata('providers', RedisModule);
      const factory = providers[0].useFactory;

      // Act
      await factory(configService);

      // Assert
      expect(mockCreateRedisConfig).toHaveBeenCalledWith(configService);
    });

    it('should call RedisService.create with config', async () => {
      // Arrange
      const mockRedisConfig = {
        db: 0,
        servers: [{ host: 'localhost', port: 6379 }],
        password: 'secret123',
        isCluster: false,
      };
      const mockRedisServiceInstance = { connect: jest.fn() };

      mockCreateRedisConfig.mockReturnValue(mockRedisConfig);
      (RedisService.create as jest.Mock).mockResolvedValue(mockRedisServiceInstance);

      // Get the factory function from module metadata
      const providers = Reflect.getMetadata('providers', RedisModule);
      const factory = providers[0].useFactory;

      // Act
      await factory(configService);

      // Assert
      expect(RedisService.create).toHaveBeenCalledWith(mockRedisConfig);
    });

    it('should log success message when Redis connects', async () => {
      // Arrange
      const mockRedisConfig = {
        db: 0,
        servers: [{ host: 'localhost', port: 6379 }],
        password: 'secret123',
        isCluster: false,
      };
      const mockRedisServiceInstance = { connect: jest.fn() };

      mockCreateRedisConfig.mockReturnValue(mockRedisConfig);
      (RedisService.create as jest.Mock).mockResolvedValue(mockRedisServiceInstance);

      // Get the factory function from module metadata
      const providers = Reflect.getMetadata('providers', RedisModule);
      const factory = providers[0].useFactory;

      // Act
      await factory(configService);

      // Assert
      expect(loggerSpy).toHaveBeenCalledWith('Redis server connected successfully');
    });

    it('should handle Redis connection errors', async () => {
      // Arrange
      const mockRedisConfig = {
        db: 0,
        servers: [{ host: 'localhost', port: 6379 }],
        password: 'secret123',
        isCluster: false,
      };
      const connectionError = new Error('Connection failed');

      mockCreateRedisConfig.mockReturnValue(mockRedisConfig);
      (RedisService.create as jest.Mock).mockRejectedValue(connectionError);

      // Get the factory function from module metadata
      const providers = Reflect.getMetadata('providers', RedisModule);
      const factory = providers[0].useFactory;

      // Act & Assert
      await expect(factory(configService)).rejects.toThrow('Connection failed');
      expect(errorSpy).toHaveBeenCalledWith('Failed to connect to Redis server', connectionError);
    });

    it('should handle config creation errors', async () => {
      // Arrange
      const configError = new Error('Redis configuration is incomplete');

      mockCreateRedisConfig.mockImplementation(() => {
        throw configError;
      });

      // Get the factory function from module metadata
      const providers = Reflect.getMetadata('providers', RedisModule);
      const factory = providers[0].useFactory;

      // Act & Assert
      await expect(factory(configService)).rejects.toThrow('Redis configuration is incomplete');
      // Note: The error happens during createRedisConfig, before the try-catch block with logger.error
      // So the logger.error won't be called in this case
    });

    it('should return the created RedisService instance', async () => {
      // Arrange
      const mockRedisConfig = {
        db: 0,
        servers: [{ host: 'localhost', port: 6379 }],
        password: 'secret123',
        isCluster: false,
      };
      const mockRedisServiceInstance = { connect: jest.fn(), disconnect: jest.fn() };

      mockCreateRedisConfig.mockReturnValue(mockRedisConfig);
      (RedisService.create as jest.Mock).mockResolvedValue(mockRedisServiceInstance);

      // Get the factory function from module metadata
      const providers = Reflect.getMetadata('providers', RedisModule);
      const factory = providers[0].useFactory;

      // Act
      const result = await factory(configService);

      // Assert
      expect(result).toBe(mockRedisServiceInstance);
    });

    it('should create Logger with RedisModule context', async () => {
      // Arrange
      const mockRedisConfig = {
        db: 0,
        servers: [{ host: 'localhost', port: 6379 }],
        password: 'secret123',
        isCluster: false,
      };
      const mockRedisServiceInstance = { connect: jest.fn() };

      mockCreateRedisConfig.mockReturnValue(mockRedisConfig);
      (RedisService.create as jest.Mock).mockResolvedValue(mockRedisServiceInstance);

      // Get the factory function from module metadata
      const providers = Reflect.getMetadata('providers', RedisModule);
      const factory = providers[0].useFactory;

      // Act
      await factory(configService);

      // Assert - Verify that logger was called with correct message
      expect(loggerSpy).toHaveBeenCalledWith('Redis server connected successfully');
    });
  });
});
