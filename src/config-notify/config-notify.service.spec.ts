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
  let mockDatabaseService: jest.Mocked<DatabaseService>;
  let mockNatsService: jest.Mocked<NatsService>;

  beforeEach(async () => {
    mockLogger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as any;

    mockRedis = {
      setJson: jest.fn(),
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
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key, defaultValue) => {
              if (key === 'CACHE_TTL') return 86400;
              if (key === 'CONSUMER_STREAM') return 'config.notification';
              if (key === 'PRODUCER_STREAM') return 'dems.notification.response';
              return defaultValue;
            }),
          },
        },
        { provide: DatabaseService, useValue: mockDatabaseService },
        { provide: NatsService, useValue: mockNatsService },
      ],
    }).compile();

    service = module.get<ConfigNotifyService>(ConfigNotifyService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('onModuleInit', () => {
    it('should register consumer and preload cache', async () => {
      mockDatabaseService.query.mockResolvedValue({
        rows: [{ endpointPath: '/test', schema: {}, mapping: {}, functions: {} }],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      await service.onModuleInit();

      expect(mockNatsService.registerConsumer).toHaveBeenCalled();
      expect(mockRedis.setJson).toHaveBeenCalled();
      expect(mockLogger.log).toHaveBeenCalledWith('NATS consumer registered for config.notification');
    });

    it('should throw error on failure', async () => {
      mockNatsService.registerConsumer.mockRejectedValue(new Error('Connection failed'));

      await expect(service.onModuleInit()).rejects.toThrow('Connection failed');
    });
  });

  describe('handleNatsMessage', () => {
    it('should update cache when config found', async () => {
      const message = { transactionID: '123' };
      mockDatabaseService.query.mockResolvedValue({
        rows: [{ endpointPath: '/test', schema: {}, mapping: {}, functions: {} }],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      await (service as any).handleNatsMessage(message);

      expect(mockRedis.setJson).toHaveBeenCalled();
      expect(mockLogger.log).toHaveBeenCalledWith('Updated cache for key: /test');
    });

    it('should log warning when config not found', async () => {
      const message = { transactionID: '456' };
      mockDatabaseService.query.mockResolvedValue({
        rows: [],
        rowCount: 0,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      await (service as any).handleNatsMessage(message);

      expect(mockLogger.warn).toHaveBeenCalledWith('Config not found for ID: 456');
    });

    it('should log error for invalid message', async () => {
      await (service as any).handleNatsMessage(null);

      expect(mockLogger.error).toHaveBeenCalledWith('Invalid NATS message: must be an object');
    });

    it('should log error for missing transactionID', async () => {
      await (service as any).handleNatsMessage({});

      expect(mockLogger.error).toHaveBeenCalledWith('Invalid NATS message: transactionID is required');
    });

    it('should log error on database error', async () => {
      const message = { transactionID: '789' };
      mockDatabaseService.query.mockRejectedValue(new Error('DB error'));

      await (service as any).handleNatsMessage(message);

      expect(mockLogger.error).toHaveBeenCalledWith('Error processing message: Error: DB error');
    });
  });

  describe('setCache', () => {
    it('should store config in Redis', async () => {
      const config = {
        endpointPath: '/test',
        schema: { type: 'object' },
        mapping: { field: 'value' },
        functions: { fn: 'test' },
        publishing_status: 'active',
      };

      await service.setCache(config);

      expect(mockRedis.setJson).toHaveBeenCalledWith(
        '/test',
        JSON.stringify({
          schema: { type: 'object' },
          mapping: { field: 'value' },
          functions: { fn: 'test' },
          publishing_status: 'active',
        }),
        86400,
      );
    });
  });
});
