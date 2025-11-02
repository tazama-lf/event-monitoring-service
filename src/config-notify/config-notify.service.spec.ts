import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { LoggerService, RedisService } from '@tazama-lf/frms-coe-lib';
import { ConfigNotifyService } from './config-notify.service';
import { DatabaseService } from '../database/database.service';
import { NatsService } from '../nats/nats.service';

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
      registerConsumer: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConfigNotifyService,
        { provide: LoggerService, useValue: mockLogger },
        { provide: RedisService, useValue: mockRedis },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: DatabaseService, useValue: mockDatabaseService },
        { provide: NatsService, useValue: mockNatsService },
      ],
    }).compile();

    service = module.get<ConfigNotifyService>(ConfigNotifyService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });
  });

  describe('onModuleInit', () => {
    it('should successfully initialize service', async () => {
      mockNatsService.registerConsumer.mockResolvedValue(undefined);
      mockDatabaseService.query.mockResolvedValue(mockQueryResult);
      mockRedis.setJson.mockResolvedValue(undefined);

      await service.onModuleInit();

      expect(mockNatsService.registerConsumer).toHaveBeenCalled();
      expect(mockDatabaseService.query).toHaveBeenCalled();
      expect(mockRedis.setJson).toHaveBeenCalled();
      expect(mockLogger.log).toHaveBeenCalledWith('NATS consumer registered for config.notification');
    });

    it('should handle database query failure', async () => {
      const error = new Error('Database connection failed');
      mockNatsService.registerConsumer.mockResolvedValue(undefined);
      mockDatabaseService.query.mockRejectedValue(error);

      await expect(service.onModuleInit()).rejects.toThrow('Database connection failed');
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to initialize ConfigNotifyService: Error: Database connection failed');
    });
  });

  describe('onModuleDestroy', () => {
    it('should log destruction', () => {
      service.onModuleDestroy();
      expect(mockLogger.log).toHaveBeenCalledWith('ConfigNotifyService destroyed');
    });
  });

  describe('handleNatsMessage', () => {
    const handleResponse = jest.fn();

    beforeEach(() => {
      handleResponse.mockClear();
    });

    it('should successfully process config found message', async () => {
      const message = { transactionID: '123' };
      mockDatabaseService.query.mockResolvedValue(mockQueryResult);
      mockRedis.setJson.mockResolvedValue(undefined);

      await (service as any).handleNatsMessage(message, handleResponse);

      expect(mockLogger.log).toHaveBeenCalledWith('Updated cache for key: /test/endpoint');
      expect(handleResponse).toHaveBeenCalledWith({
        transactionID: '123',
        status: 'ACK',
        timestamp: expect.any(String),
      });
    });

    it('should handle config not found', async () => {
      const message = { transactionID: '456' };
      const emptyResult = { rows: [], rowCount: 0, command: 'SELECT', oid: 0, fields: [] };
      mockDatabaseService.query.mockResolvedValue(emptyResult);

      await (service as any).handleNatsMessage(message, handleResponse);

      expect(mockLogger.warn).toHaveBeenCalledWith('Config not found for ID: 456');
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
        transactionID: 'error-occurred',
        status: 'NACK',
        error: 'Database query failed',
        timestamp: expect.any(String),
      });
    });

    it('should handle malformed NATS message', async () => {
      const malformedMessage = {};
      await (service as any).handleNatsMessage(malformedMessage, handleResponse);
      expect(mockLogger.error).toHaveBeenCalledWith('Invalid NATS message: transactionID is required');
    });

    it('should handle missing transactionID', async () => {
      const messageWithoutId = {};
      await (service as any).handleNatsMessage(messageWithoutId, handleResponse);
      expect(mockLogger.error).toHaveBeenCalledWith('Invalid NATS message: transactionID is required');
    });
  });

  describe('setCache', () => {
    it('should set cache with correct parameters', async () => {
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
  });
});
