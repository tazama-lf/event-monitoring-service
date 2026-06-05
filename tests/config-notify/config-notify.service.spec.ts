import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerService, RedisService } from '@tazama-lf/frms-coe-lib';
import { ConfigNotifyService } from '../../src/config-notify/config-notify.service';
import { DatabaseService } from '../../src/database/database.service';
import { PublishingStatus } from '../../src/enums/publishingStatus.enum';
import { NatsService } from '../../src/nats/nats.service';

const CACHE_TTL = 86400;

const makeDbRow = (overrides = {}) => ({
  tenant_id: 'test-tenant',
  endpointPath: '/test/endpoint',
  schema: { type: 'object' },
  mapping: { field: 'value' },
  functions: { fn: 'test' },
  related_transaction: 'rel-tx-id',
  publishing_status: 'active',
  ...overrides,
});

const makeQueryResult = (rows: object[]) => ({
  rows,
  rowCount: rows.length,
  command: 'SELECT',
  oid: 0,
  fields: [],
});

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

    mockNatsService = {
      registerConsumer: jest.fn(),
    } as any;

    mockDatabaseService = {
      query: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConfigNotifyService,
        { provide: LoggerService, useValue: mockLogger },
        { provide: RedisService, useValue: mockRedis },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue: unknown) => {
              if (key === 'cache.timeToLive') return CACHE_TTL;
              if (key === 'nats.consumerStream') return 'config.notification';
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

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  describe('onModuleInit', () => {
    it('should preload all active configs into cache on startup', async () => {
      const rows = [makeDbRow({ endpointPath: '/a' }), makeDbRow({ endpointPath: '/b' })];
      mockDatabaseService.query.mockResolvedValue(makeQueryResult(rows));

      await service.onModuleInit();

      expect(mockDatabaseService.query).toHaveBeenCalledTimes(1);
      expect(mockRedis.setJson).toHaveBeenCalledTimes(2);
      expect(mockLogger.log).toHaveBeenCalledWith('Cache preloaded: 2 configurations', 'ConfigNotifyService');
    });

    it('should preload nothing when no active configs exist', async () => {
      mockDatabaseService.query.mockResolvedValue(makeQueryResult([]));

      await service.onModuleInit();

      expect(mockRedis.setJson).not.toHaveBeenCalled();
      expect(mockLogger.log).toHaveBeenCalledWith('Cache preloaded: 0 configurations', 'ConfigNotifyService');
    });

    it('should log and rethrow when the DB query fails', async () => {
      const dbError = new Error('DB connection lost');
      mockDatabaseService.query.mockRejectedValue(dbError);

      await expect(service.onModuleInit()).rejects.toThrow('DB connection lost');
      expect(mockLogger.error).toHaveBeenCalledWith(`Failed to initialize ConfigNotifyService: ${String(dbError)}`, 'ConfigNotifyService');
    });
  });

  // ---------------------------------------------------------------------------
  describe('updateCache', () => {
    it('should fetch config by id, override publishing_status, and write to cache', async () => {
      const row = makeDbRow({ publishing_status: 'inactive' });
      mockDatabaseService.query.mockResolvedValue(makeQueryResult([row]));

      await service.updateCache(1, PublishingStatus.ACTIVE);

      expect(mockDatabaseService.query).toHaveBeenCalledWith(expect.stringContaining('WHERE id = $1'), [1]);
      // The publishing_status stored in Redis must reflect what was passed in, not what was in the DB
      expect(mockRedis.setJson).toHaveBeenCalledWith(
        `${row.tenant_id}:${row.endpointPath}`,
        JSON.stringify({
          schema: row.schema,
          mapping: row.mapping,
          functions: row.functions,
          related_transaction: row.related_transaction,
          publishing_status: PublishingStatus.ACTIVE,
        }),
        CACHE_TTL,
      );
    });

    it('should set publishing_status to inactive when requested', async () => {
      const row = makeDbRow({ publishing_status: 'active' });
      mockDatabaseService.query.mockResolvedValue(makeQueryResult([row]));

      await service.updateCache(5, PublishingStatus.INACTIVE);

      const [, storedJson] = mockRedis.setJson.mock.calls[0];
      expect(JSON.parse(storedJson as string).publishing_status).toBe(PublishingStatus.INACTIVE);
    });

    it('should log the update after writing to cache', async () => {
      const row = makeDbRow();
      mockDatabaseService.query.mockResolvedValue(makeQueryResult([row]));

      await service.updateCache(1, PublishingStatus.ACTIVE);

      expect(mockLogger.log).toHaveBeenCalledWith(
        `Updated cache for key: ${row.tenant_id}:${row.endpointPath} --> publishing status: ${PublishingStatus.ACTIVE}`,
        'ConfigNotifyService',
      );
    });

    it('should throw NotFoundException when no config matches the given id', async () => {
      mockDatabaseService.query.mockResolvedValue(makeQueryResult([]));

      await expect(service.updateCache(99, PublishingStatus.ACTIVE)).rejects.toThrow(new NotFoundException('Config not found for ID: 99'));
      expect(mockRedis.setJson).not.toHaveBeenCalled();
    });

    it('should propagate DB errors', async () => {
      mockDatabaseService.query.mockRejectedValue(new Error('Query failed'));

      await expect(service.updateCache(1, PublishingStatus.ACTIVE)).rejects.toThrow('Query failed');
    });
  });

  // ---------------------------------------------------------------------------
  describe('setCache', () => {
    it('should serialise all config fields and store in Redis under the endpointPath key', async () => {
      const config = makeDbRow();

      await service.setCache(config as any);

      expect(mockRedis.setJson).toHaveBeenCalledWith(
        `${config.tenant_id}:${config.endpointPath}`,
        JSON.stringify({
          schema: config.schema,
          mapping: config.mapping,
          functions: config.functions,
          related_transaction: config.related_transaction,
          publishing_status: config.publishing_status,
        }),
        CACHE_TTL,
      );
    });

    it('should use the configured TTL from ConfigService', async () => {
      await service.setCache(makeDbRow() as any);

      const [, , ttl] = mockRedis.setJson.mock.calls[0];
      expect(ttl).toBe(CACHE_TTL);
    });
  });
});
