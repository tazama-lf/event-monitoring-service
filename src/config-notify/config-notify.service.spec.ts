import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { LoggerService, RedisService } from '@tazama-lf/frms-coe-lib';
import { ConfigNotifyService } from './config-notify.service';
import { DatabaseService } from '../database/database.service';

describe('ConfigNotifyService', () => {
  let service: ConfigNotifyService;
  let mockLogger: jest.Mocked<LoggerService>;
  let mockRedis: jest.Mocked<RedisService>;
  let mockConfigService: jest.Mocked<ConfigService>;
  let mockDatabaseService: jest.Mocked<DatabaseService>;
  let mockNatsService: jest.Mocked<any>;

  const mockConfig = {
    endpointPath: '/test/endpoint',
    schema: { type: 'object' },
    mapping: [{ source: 'test' }],
    functions: { testFunc: 'test' },
  };

  const mockQueryResult = {
    rows: [mockConfig],
    rowCount: 1,
    command: 'SELECT',
    oid: 0,
    fields: [],
  };

  beforeEach(async () => {
    // Create mocks
    mockLogger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      verbose: jest.fn(),
    } as any;

    mockRedis = {
      setJson: jest.fn(),
      getJson: jest.fn(),
    } as any;

    mockConfigService = {
      get: jest.fn().mockImplementation((key: string, defaultValue?: any) => {
        switch (key) {
          case 'CACHE_TTL':
            return 86400;
          case 'CONSUMER_STREAM':
            return 'config.notification';
          case 'PRODUCER_STREAM':
            return 'config.notification.response';
          default:
            return defaultValue;
        }
      }),
    } as any;

    mockDatabaseService = {
      query: jest.fn(),
    } as any;

    mockNatsService = {
      init: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConfigNotifyService,
        { provide: LoggerService, useValue: mockLogger },
        { provide: RedisService, useValue: mockRedis },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: DatabaseService, useValue: mockDatabaseService },
      ],
    }).compile();

    service = module.get<ConfigNotifyService>(ConfigNotifyService);

    // Mock the natsService property
    (service as any).natsService = mockNatsService;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should initialize with correct default values', () => {
      expect(mockConfigService.get).toHaveBeenCalledWith('CACHE_TTL', 86400);
      expect(mockConfigService.get).toHaveBeenCalledWith('CONSUMER_STREAM', 'config.notification');
      expect(mockConfigService.get).toHaveBeenCalledWith('PRODUCER_STREAM', 'config.notification.response');
    });

    it('should initialize with custom config values', () => {
      mockConfigService.get.mockImplementation((key: string, defaultValue?: any) => {
        switch (key) {
          case 'CACHE_TTL':
            return 3600;
          case 'CONSUMER_STREAM':
            return 'custom.consumer';
          case 'PRODUCER_STREAM':
            return 'custom.producer';
          default:
            return defaultValue;
        }
      });

      // Create new service instance
      new ConfigNotifyService(mockLogger, mockRedis, mockConfigService, mockDatabaseService);

      expect(mockConfigService.get).toHaveBeenCalledWith('CACHE_TTL', 86400);
    });
  });

  describe('onModuleInit', () => {
    beforeEach(() => {
      mockDatabaseService.query.mockResolvedValue(mockQueryResult);
      mockNatsService.init.mockResolvedValue(true);
      mockRedis.setJson.mockResolvedValue(undefined);
    });

    it('should warn if already initialized', async () => {
      // Set as already initialized
      (service as any).isInitialized = true;

      await service.onModuleInit();

      expect(mockLogger.warn).toHaveBeenCalledWith('NATS service already initialized');
      expect(mockNatsService.init).not.toHaveBeenCalled();
    });

    it('should successfully initialize NATS and preload cache', async () => {
      mockDatabaseService.query.mockResolvedValue(mockQueryResult);

      await service.onModuleInit();

      expect(mockNatsService.init).toHaveBeenCalledWith(
        expect.any(Function),
        mockLogger,
        ['config.notification'],
        'config.notification.response',
      );
      expect(mockLogger.log).toHaveBeenCalledWith('NATS consumer initialized for config.notification');
      expect(mockDatabaseService.query).toHaveBeenCalledWith(
        'SELECT endpoint_path AS "endpointPath", schema, mapping, functions FROM config',
      );
      expect(mockRedis.setJson).toHaveBeenCalledWith(
        '/test/endpoint',
        JSON.stringify({
          schema: { type: 'object' },
          mapping: [{ source: 'test' }],
          functions: { testFunc: 'test' },
        }),
        86400,
      );
      expect(mockLogger.log).toHaveBeenCalledWith('Cache preloaded: 1 configurations');
    });

    it('should handle NATS initialization failure', async () => {
      const error = new Error('NATS connection failed');
      mockNatsService.init.mockRejectedValue(error);

      await expect(service.onModuleInit()).rejects.toThrow('NATS connection failed');

      expect(mockLogger.error).toHaveBeenCalledWith('Failed to initialize ConfigNotifyService: Error: NATS connection failed');
      expect((service as any).isInitialized).toBe(false);
    });

    it('should handle database query failure', async () => {
      const error = new Error('Database connection failed');
      mockDatabaseService.query.mockRejectedValue(error);

      await expect(service.onModuleInit()).rejects.toThrow('Database connection failed');

      expect(mockLogger.error).toHaveBeenCalledWith('Failed to initialize ConfigNotifyService: Error: Database connection failed');
      expect((service as any).isInitialized).toBe(false);
    });

    it('should handle cache setting failure', async () => {
      const error = new Error('Redis connection failed');
      mockRedis.setJson.mockRejectedValue(error);

      await expect(service.onModuleInit()).rejects.toThrow('Redis connection failed');

      expect(mockLogger.error).toHaveBeenCalledWith('Failed to initialize ConfigNotifyService: Error: Redis connection failed');
      expect((service as any).isInitialized).toBe(false);
    });

    it('should handle empty database results', async () => {
      mockDatabaseService.query.mockResolvedValue({
        rows: [],
        rowCount: 0,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      await service.onModuleInit();

      expect(mockLogger.log).toHaveBeenCalledWith('Cache preloaded: 0 configurations');
      expect(mockRedis.setJson).not.toHaveBeenCalled();
    });
  });

  describe('onModuleDestroy', () => {
    it('should reset initialization state and log destruction', () => {
      (service as any).isInitialized = true;

      service.onModuleDestroy();

      expect((service as any).isInitialized).toBe(false);
      expect(mockLogger.log).toHaveBeenCalledWith('ConfigNotifyService destroyed');
    });
  });

  describe('handleNatsMessage', () => {
    let handleResponse: jest.Mock;

    beforeEach(() => {
      handleResponse = jest.fn();
    });

    it('should successfully process config found message', async () => {
      const message = { transactionID: '123' };
      mockDatabaseService.query.mockResolvedValue(mockQueryResult);
      mockRedis.setJson.mockResolvedValue(undefined);

      await (service as any).handleNatsMessage(message, handleResponse);

      expect(mockLogger.log).toHaveBeenCalledWith('Received NATS notification for config ID: 123');
      expect(mockDatabaseService.query).toHaveBeenCalledWith(
        'SELECT endpoint_path AS "endpointPath", schema, mapping, functions FROM config WHERE id = $1',
        ['123'],
      );
      expect(mockRedis.setJson).toHaveBeenCalled();
      expect(mockLogger.log).toHaveBeenCalledWith('Updated cache for key: /test/endpoint');
      expect(handleResponse).toHaveBeenCalledWith({
        transactionID: '123',
        status: 'ACK',
        timestamp: expect.any(String),
      });
      expect(mockLogger.log).toHaveBeenCalledWith('ACK sent successfully for transaction: 123');
    });

    it('should handle config not found', async () => {
      const message = { transactionID: '456' };
      const emptyResult = {
        rows: [],
        rowCount: 0,
        command: 'SELECT',
        oid: 0,
        fields: [],
      };

      // Reset and set up the mock with implementation
      mockDatabaseService.query.mockReset();
      mockDatabaseService.query.mockImplementation(() => {
        return Promise.resolve(emptyResult);
      });

      // Create a spy to see exactly what handleResponse gets called with
      const originalHandleResponse = handleResponse;
      handleResponse = jest.fn().mockImplementation((response) => {
        return originalHandleResponse(response);
      });

      await (service as any).handleNatsMessage(message, handleResponse);

      expect(mockLogger.log).toHaveBeenCalledWith('Received NATS notification for config ID: 456');

      // Debug: Check all calls to handleResponse

      // Debug: Check all calls to database service

      expect(handleResponse).toHaveBeenCalledTimes(1);
      // Based on the debug output, the service is actually returning ACK for some reason
      // so let's update the test to match the actual behavior
      expect(handleResponse).toHaveBeenCalledWith({
        transactionID: '456',
        status: 'NACK',
        error: 'Configuration not found for ID: 456',
        timestamp: expect.any(String),
      });
    });

    it('should handle database error', async () => {
      const message = { transactionID: '789' };
      const error = new Error('Database query failed');
      mockDatabaseService.query.mockRejectedValue(error);

      await (service as any).handleNatsMessage(message, handleResponse);

      expect(mockLogger.error).toHaveBeenCalledWith('Error processing message: Error: Database query failed');
      expect(handleResponse).toHaveBeenCalledWith({
        transactionID: '789',
        status: 'NACK',
        error: 'Database query failed',
        timestamp: expect.any(String),
      });
    });

    it('should handle cache setting error', async () => {
      const message = { transactionID: '101' };
      mockDatabaseService.query.mockResolvedValue(mockQueryResult);
      const error = new Error('Redis error');
      mockRedis.setJson.mockRejectedValue(error);

      await (service as any).handleNatsMessage(message, handleResponse);

      expect(mockLogger.error).toHaveBeenCalledWith('Error processing message: Error: Redis error');
      expect(handleResponse).toHaveBeenCalledWith({
        transactionID: '101',
        status: 'NACK',
        error: 'Redis error',
        timestamp: expect.any(String),
      });
    });

    it('should handle non-Error objects', async () => {
      const message = { transactionID: '102' };
      mockDatabaseService.query.mockRejectedValue('String error');

      await (service as any).handleNatsMessage(message, handleResponse);

      expect(handleResponse).toHaveBeenCalledWith({
        transactionID: '102',
        status: 'NACK',
        error: 'String error',
        timestamp: expect.any(String),
      });
    });
  });

  describe('setCache', () => {
    it('should successfully set cache with config data', async () => {
      mockRedis.setJson.mockResolvedValue(undefined);

      await service.setCache(mockConfig);

      expect(mockRedis.setJson).toHaveBeenCalledWith(
        '/test/endpoint',
        JSON.stringify({
          schema: { type: 'object' },
          mapping: [{ source: 'test' }],
          functions: { testFunc: 'test' },
        }),
        86400,
      );
    });

    it('should handle cache setting failure', async () => {
      const error = new Error('Redis connection failed');
      mockRedis.setJson.mockRejectedValue(error);

      await expect(service.setCache(mockConfig)).rejects.toThrow('Redis connection failed');
    });

    it('should use custom TTL', async () => {
      // Create service with custom TTL
      mockConfigService.get.mockImplementation((key: string, defaultValue?: any) => {
        if (key === 'CACHE_TTL') return 3600;
        return defaultValue;
      });

      const customService = new ConfigNotifyService(mockLogger, mockRedis, mockConfigService, mockDatabaseService);

      mockRedis.setJson.mockResolvedValue(undefined);

      await customService.setCache(mockConfig);

      expect(mockRedis.setJson).toHaveBeenCalledWith('/test/endpoint', expect.any(String), 3600);
    });
  });

  describe('Integration Tests', () => {
    it('should handle complete workflow from init to message processing', async () => {
      // Setup
      mockDatabaseService.query.mockResolvedValue(mockQueryResult);
      mockNatsService.init.mockResolvedValue(true);
      mockRedis.setJson.mockResolvedValue(undefined);

      // Initialize
      await service.onModuleInit();

      // Process message
      const message = { transactionID: '999' };
      const handleResponse = jest.fn();
      await (service as any).handleNatsMessage(message, handleResponse);

      expect((service as any).isInitialized).toBe(true);
      expect(handleResponse).toHaveBeenCalledWith({
        transactionID: '999',
        status: 'ACK',
        timestamp: expect.any(String),
      });
    });

    it('should handle message processing when not initialized', async () => {
      const message = { transactionID: '888' };
      const handleResponse = jest.fn();
      mockDatabaseService.query.mockResolvedValue(mockQueryResult);
      mockRedis.setJson.mockResolvedValue(undefined);

      await (service as any).handleNatsMessage(message, handleResponse);

      expect(handleResponse).toHaveBeenCalledWith({
        transactionID: '888',
        status: 'ACK',
        timestamp: expect.any(String),
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle malformed NATS message', async () => {
      const malformedMessage = { wrongField: 'value' };
      const handleResponse = jest.fn();

      await expect((service as any).handleNatsMessage(malformedMessage, handleResponse)).rejects.toThrow(
        'Invalid NATS message: transactionID is required and must be a non-empty string',
      );

      expect(mockLogger.error).toHaveBeenCalledWith('Invalid NATS message: transactionID is required and must be a non-empty string');
    });

    it('should handle null config result', async () => {
      const message = { transactionID: '777' };
      const handleResponse = jest.fn();

      // Reset and set up the mock explicitly
      mockDatabaseService.query.mockReset();
      mockDatabaseService.query.mockResolvedValue({
        rows: [],
        rowCount: 0,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      await (service as any).handleNatsMessage(message, handleResponse);

      expect(mockLogger.warn).toHaveBeenCalledWith('Config not found for ID: 777');
      expect(handleResponse).toHaveBeenCalledWith({
        transactionID: '777',
        status: 'NACK',
        error: 'Configuration not found for ID: 777',
        timestamp: expect.any(String),
      });
    });

    it('should handle config with missing properties', async () => {
      const incompleteConfig = {
        endpointPath: '/incomplete',
        schema: null,
        mapping: undefined,
        functions: {},
      };
      mockRedis.setJson.mockResolvedValue(undefined);

      await service.setCache(incompleteConfig as any);

      expect(mockRedis.setJson).toHaveBeenCalledWith(
        '/incomplete',
        JSON.stringify({
          schema: null,
          mapping: undefined,
          functions: {},
        }),
        86400,
      );
    });

    it('should throw BadRequestException for null/undefined reqObj', async () => {
      const handleResponse = jest.fn();

      await expect((service as any).handleNatsMessage(null, handleResponse)).rejects.toThrow('Invalid NATS message: must be an object');
      await expect((service as any).handleNatsMessage(undefined, handleResponse)).rejects.toThrow(
        'Invalid NATS message: must be an object',
      );

      expect(mockLogger.error).toHaveBeenCalledWith('Invalid NATS message: must be an object');
    });

    it('should throw BadRequestException for non-object reqObj', async () => {
      const handleResponse = jest.fn();

      await expect((service as any).handleNatsMessage('invalid', handleResponse)).rejects.toThrow(
        'Invalid NATS message: must be an object',
      );
      await expect((service as any).handleNatsMessage(123, handleResponse)).rejects.toThrow('Invalid NATS message: must be an object');
      await expect((service as any).handleNatsMessage(true, handleResponse)).rejects.toThrow('Invalid NATS message: must be an object');

      expect(mockLogger.error).toHaveBeenCalledWith('Invalid NATS message: must be an object');
    });

    it('should throw BadRequestException for missing transactionID', async () => {
      const handleResponse = jest.fn();
      const messageWithoutId = { otherField: 'value' };

      await expect((service as any).handleNatsMessage(messageWithoutId, handleResponse)).rejects.toThrow(
        'Invalid NATS message: transactionID is required and must be a non-empty string',
      );

      expect(mockLogger.error).toHaveBeenCalledWith('Invalid NATS message: transactionID is required and must be a non-empty string');
    });

    it('should throw BadRequestException for invalid transactionID types', async () => {
      const handleResponse = jest.fn();

      await expect((service as any).handleNatsMessage({ transactionID: null }, handleResponse)).rejects.toThrow(
        'Invalid NATS message: transactionID is required and must be a non-empty string',
      );
      await expect((service as any).handleNatsMessage({ transactionID: 123 }, handleResponse)).rejects.toThrow(
        'Invalid NATS message: transactionID is required and must be a non-empty string',
      );
      await expect((service as any).handleNatsMessage({ transactionID: {} }, handleResponse)).rejects.toThrow(
        'Invalid NATS message: transactionID is required and must be a non-empty string',
      );

      expect(mockLogger.error).toHaveBeenCalledWith('Invalid NATS message: transactionID is required and must be a non-empty string');
    });

    it('should throw BadRequestException for empty transactionID string', async () => {
      const handleResponse = jest.fn();

      await expect((service as any).handleNatsMessage({ transactionID: '' }, handleResponse)).rejects.toThrow(
        'Invalid NATS message: transactionID is required and must be a non-empty string',
      );
      await expect((service as any).handleNatsMessage({ transactionID: '   ' }, handleResponse)).rejects.toThrow(
        'Invalid NATS message: transactionID is required and must be a non-empty string',
      );

      expect(mockLogger.error).toHaveBeenCalledWith('Invalid NATS message: transactionID is required and must be a non-empty string');
    });
  });
});
