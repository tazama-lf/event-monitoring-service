import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { LoggerService, RedisService } from '@tazama-lf/frms-coe-lib';
import { DemsEngineService } from './dems-engine.service';
import { NatsService } from '../nats/nats.service';
import { DatabaseOperationsService } from '../commons';
import { DatabaseService } from '../database/database.service';

jest.mock('xml2js', () => ({
  parseString: jest.fn(),
}));

describe('DemsEngineService', () => {
  let service: DemsEngineService;
  let mockLoggerService: jest.Mocked<LoggerService>;
  let mockRedisService: jest.Mocked<RedisService>;
  let mockNatsService: jest.Mocked<NatsService>;
  let mockDatabaseOperationsService: jest.Mocked<DatabaseOperationsService>;
  let mockConfigService: jest.Mocked<ConfigService>;
  let mockDatabaseService: jest.Mocked<DatabaseService>;

  const mockSchema = {
    type: 'object',
    properties: {
      name: { type: 'string' },
      age: { type: 'number' },
    },
    required: ['name'],
  };

  const mockMapping = [
    {
      source: ['name'],
      destination: 'redis.userName',
      delimiter: '',
      prefix: '',
      suffix: '',
    },
  ];

  const mockFunctions = [
    {
      functionName: 'saveTransactionRelationship',
      params: ['transactionDetails.source', 'transactionDetails.destination'],
    },
  ];

  const createMockQueryResult = (rows: any[]) => ({
    rows,
    rowCount: rows.length,
    command: 'SELECT' as const,
    oid: 0,
    fields: [],
  });

  beforeEach(async () => {
    mockLoggerService = {
      log: jest.fn(),
      error: jest.fn(),
    } as any;

    mockRedisService = {
      getJson: jest.fn(),
      setJson: jest.fn(),
    } as any;

    mockNatsService = {
      notifyEventDirector: jest.fn(),
    } as any;

    mockDatabaseOperationsService = {
      saveTransactionHistory: jest.fn(),
      saveTransactionRelationship: jest.fn(),
    } as any;

    mockConfigService = {
      get: jest.fn().mockReturnValue(3600),
    } as any;

    mockDatabaseService = {
      query: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DemsEngineService,
        { provide: LoggerService, useValue: mockLoggerService },
        { provide: RedisService, useValue: mockRedisService },
        { provide: NatsService, useValue: mockNatsService },
        { provide: DatabaseOperationsService, useValue: mockDatabaseOperationsService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: DatabaseService, useValue: mockDatabaseService },
      ],
    }).compile();

    service = module.get<DemsEngineService>(DemsEngineService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findSchemaAndMapping', () => {
    it('should return cached schema on cache hit', async () => {
      const cachedData = {
        schema: mockSchema,
        mapping: mockMapping,
        functions: mockFunctions,
      };
      (mockRedisService.getJson as jest.Mock).mockResolvedValue(cachedData);

      const result = await service.findSchemaAndMapping('/test');

      expect(result).toEqual([mockSchema, mockMapping, mockFunctions]);
      expect(mockLoggerService.log).toHaveBeenCalledWith('Cache hit for endpoint: /test');
    });

    it('should parse string cached data', async () => {
      const cachedDataString = JSON.stringify({
        schema: mockSchema,
        mapping: mockMapping,
        functions: mockFunctions,
      });
      (mockRedisService.getJson as jest.Mock).mockResolvedValue(cachedDataString);

      const result = await service.findSchemaAndMapping('/test');

      expect(result).toEqual([mockSchema, mockMapping, mockFunctions]);
    });

    it('should query database on cache miss', async () => {
      (mockRedisService.getJson as jest.Mock).mockResolvedValue(null);
      mockDatabaseService.query.mockResolvedValue(
        createMockQueryResult([
          {
            schema: mockSchema,
            mapping: mockMapping,
            functions: mockFunctions,
          },
        ]),
      );

      const result = await service.findSchemaAndMapping('/test');

      expect(mockLoggerService.log).toHaveBeenCalledWith('Cache miss for endpoint: /test. Querying database...');
      expect(result).toEqual([mockSchema, mockMapping, mockFunctions]);
    });

    it('should return null when no schema found', async () => {
      (mockRedisService.getJson as jest.Mock).mockResolvedValue(null);
      mockDatabaseService.query.mockResolvedValue(createMockQueryResult([]));

      const result = await service.findSchemaAndMapping('/test');

      expect(result).toBeNull();
    });

    it('should handle parsing error', async () => {
      (mockRedisService.getJson as jest.Mock).mockResolvedValue('invalid json');
      mockDatabaseService.query.mockResolvedValue(
        createMockQueryResult([
          {
            schema: mockSchema,
            mapping: mockMapping,
            functions: mockFunctions,
          },
        ]),
      );

      const result = await service.findSchemaAndMapping('/test');

      expect(mockLoggerService.error).toHaveBeenCalled();
      expect(result).toEqual([mockSchema, mockMapping, mockFunctions]);
    });
  });

  describe('handleMessage', () => {
    beforeEach(() => {
      mockDatabaseService.query.mockResolvedValue(
        createMockQueryResult([
          {
            schema: mockSchema,
            mapping: mockMapping,
            functions: mockFunctions,
          },
        ]),
      );
      mockRedisService.getJson.mockResolvedValue(null);
      mockDatabaseOperationsService.saveTransactionHistory.mockResolvedValue(undefined);
      mockDatabaseOperationsService.saveTransactionRelationship.mockResolvedValue(undefined);
      mockNatsService.notifyEventDirector.mockResolvedValue(undefined);
    });

    it('should return error when schema not found', async () => {
      mockDatabaseService.query.mockResolvedValue(createMockQueryResult([]));

      const result = await service.handleMessage({}, '/test', 'tenant1', false);

      expect(result).toEqual({
        isMatch: false,
        message: 'Schema not found for the specified endpoint',
        differences: ['No schema exists for this endpoint'],
      });
    });

    it('should process valid JSON payload', async () => {
      const payload = { name: 'John', age: 30 };

      const result = await service.handleMessage(payload, '/test', 'tenant1', false);

      expect(result).toEqual(
        expect.objectContaining({
          success: true,
          configuredSchema: mockSchema,
        }),
      );
    });

    it('should return error for invalid payload', async () => {
      const payload = { age: 30 }; // missing required 'name'

      const result = await service.handleMessage(payload, '/test', 'tenant1', false);

      expect(result).toEqual(
        expect.objectContaining({
          isMatch: false,
          message: 'Payload structure does not match the schema',
        }),
      );
    });

    it('should handle XML payload', async () => {
      const xmlPayload = '<root><name>John</name><age>30</age></root>';
      const { parseString } = require('xml2js');
      parseString.mockImplementation((xml: any, options: any, callback: any) => {
        callback(null, { name: 'John', age: 30 });
      });

      const result = await service.handleMessage(xmlPayload, '/test', 'tenant1', true);

      expect(result).toEqual(
        expect.objectContaining({
          success: true,
        }),
      );
    });

    it('should handle XML parsing error', async () => {
      const xmlPayload = '<invalid>xml';
      const { parseString } = require('xml2js');
      parseString.mockImplementation((xml: any, options: any, callback: any) => {
        callback(new Error('XML parsing failed'));
      });

      await expect(service.handleMessage(xmlPayload, '/test', 'tenant1', true)).rejects.toThrow('XML parsing failed');
    });

    it('should handle function execution failure', async () => {
      mockDatabaseOperationsService.saveTransactionRelationship.mockRejectedValue(new Error('Function failed'));
      const payload = { name: 'John', age: 30 };

      const result = await service.handleMessage(payload, '/test', 'tenant1', false);

      expect(result).toEqual(
        expect.objectContaining({
          isMatch: false,
          message: 'compare functions with mapping',
        }),
      );
    });

    it('should handle unexpected errors', async () => {
      mockDatabaseService.query.mockRejectedValue(new Error('Unexpected error'));

      const result = await service.handleMessage({}, '/test', 'tenant1', false);

      expect(result).toEqual(
        expect.objectContaining({
          isMatch: false,
          message: 'Unexpected error occurred while processing message',
        }),
      );
    });
  });

  describe('saveTransactionDataAndNotify', () => {
    const testPayload = {
      transaction: { test: 'data' },
      TxTp: 'test.type',
      dataCache: {},
    };

    it('should save and notify successfully', async () => {
      mockDatabaseOperationsService.saveTransactionHistory.mockResolvedValue(undefined);
      mockNatsService.notifyEventDirector.mockResolvedValue(undefined);

      await service.saveTransactionDataAndNotify(testPayload, 'test.type', 'end-to-end-123');

      expect(mockDatabaseOperationsService.saveTransactionHistory).toHaveBeenCalled();
      expect(mockNatsService.notifyEventDirector).toHaveBeenCalled();
    });

    it('should handle saveTransactionHistory error', async () => {
      mockDatabaseOperationsService.saveTransactionHistory.mockRejectedValue(new Error('Save failed'));

      await expect(service.saveTransactionDataAndNotify(testPayload, 'test.type', 'end-to-end-123')).rejects.toThrow('Save failed');
      expect(mockLoggerService.error).toHaveBeenCalled();
    });

    it('should handle notifyEventDirector error', async () => {
      mockDatabaseOperationsService.saveTransactionHistory.mockResolvedValue(undefined);
      mockNatsService.notifyEventDirector.mockRejectedValue(new Error('Notify failed'));

      await expect(service.saveTransactionDataAndNotify(testPayload, 'test.type', 'end-to-end-123')).rejects.toThrow('Notify failed');
      expect(mockLoggerService.error).toHaveBeenCalled();
    });
  });
});
