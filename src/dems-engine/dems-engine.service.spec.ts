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

  const mockFunctions = []; // Empty functions array to avoid execution issues

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
      warn: jest.fn(),
      debug: jest.fn(),
      verbose: jest.fn(),
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
      saveToQuarantine: jest.fn(),
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
    it('should return cached schema on cache hit (object format)', async () => {
      const cachedData = { schema: mockSchema, mapping: mockMapping, functions: mockFunctions };
      (mockRedisService.getJson as jest.Mock).mockResolvedValue(cachedData);

      const result = await service.findSchemaAndMapping('/test');

      expect(result).toEqual([mockSchema, mockMapping, mockFunctions]);
      expect(mockLoggerService.log).toHaveBeenCalledWith('Cache hit for endpoint: /test');
    });

    it('should parse cached schema when it is a string', async () => {
      const cachedString = JSON.stringify({ schema: mockSchema, mapping: mockMapping, functions: mockFunctions });
      (mockRedisService.getJson as jest.Mock).mockResolvedValue(cachedString);

      const result = await service.findSchemaAndMapping('/test');

      expect(result).toEqual([mockSchema, mockMapping, mockFunctions]);
    });

    it('should handle cache parsing error and fallback to database', async () => {
      (mockRedisService.getJson as jest.Mock).mockResolvedValue('invalid-json-string');
      mockDatabaseService.query.mockResolvedValue(
        createMockQueryResult([{ schema: mockSchema, mapping: mockMapping, functions: mockFunctions }]),
      );

      const result = await service.findSchemaAndMapping('/test');

      expect(mockLoggerService.error).toHaveBeenCalledWith(expect.stringContaining('Failed to parse cached schema'));
      expect(result).toEqual([mockSchema, mockMapping, mockFunctions]);
    });

    it('should query database on cache miss', async () => {
      (mockRedisService.getJson as jest.Mock).mockResolvedValue(null);
      mockDatabaseService.query.mockResolvedValue(
        createMockQueryResult([{ schema: mockSchema, mapping: mockMapping, functions: mockFunctions }]),
      );

      const result = await service.findSchemaAndMapping('/test');

      expect(result).toEqual([mockSchema, mockMapping, mockFunctions]);
      expect(mockRedisService.setJson).toHaveBeenCalledWith(
        '/test',
        JSON.stringify({ schema: mockSchema, mapping: mockMapping, functions: mockFunctions }),
        3600,
      );
    });

    it('should return null when no schema found', async () => {
      (mockRedisService.getJson as jest.Mock).mockResolvedValue(null);
      mockDatabaseService.query.mockResolvedValue(createMockQueryResult([]));

      const result = await service.findSchemaAndMapping('/test');

      expect(result).toBeNull();
      expect(mockLoggerService.log).toHaveBeenCalledWith('No schema found for endpoint: /test');
    });

    it('should handle database query errors', async () => {
      (mockRedisService.getJson as jest.Mock).mockResolvedValue(null);
      mockDatabaseService.query.mockRejectedValue(new Error('Database connection failed'));

      await expect(service.findSchemaAndMapping('/test')).rejects.toThrow('Database connection failed');
    });
  });

  describe('handleMessage', () => {
    beforeEach(() => {
      mockDatabaseService.query.mockResolvedValue(
        createMockQueryResult([{ schema: mockSchema, mapping: mockMapping, functions: mockFunctions }]),
      );
      (mockRedisService.getJson as jest.Mock).mockResolvedValue(null);
      mockDatabaseOperationsService.saveTransactionHistory.mockResolvedValue(undefined);
      mockDatabaseOperationsService.saveTransactionRelationship.mockResolvedValue(undefined);
      mockDatabaseOperationsService.saveToQuarantine.mockResolvedValue(undefined);
      mockNatsService.notifyEventDirector.mockResolvedValue(undefined);
    });

    it('should return error when schema not found', async () => {
      mockDatabaseService.query.mockResolvedValue(createMockQueryResult([]));

      const result = await service.handleMessage({}, '/test', 'tenant1', false);

      expect(result).toMatchObject({ isMatch: false, message: 'Schema not found for the specified endpoint' });
    });

    it('should process valid JSON payload', async () => {
      const result = await service.handleMessage({ name: 'John', age: 30 }, '/test', 'tenant1', false);

      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('configuredSchema');
      expect(result).toHaveProperty('tazamaPayload');
      expect(result).toHaveProperty('dataCache');
    });

    it('should return error for invalid payload', async () => {
      const result = await service.handleMessage({ age: 30 }, '/test', 'tenant1', false);

      expect(result).toMatchObject({ isMatch: false });
      expect(mockDatabaseOperationsService.saveToQuarantine).toHaveBeenCalled();
    });

    it('should handle XML payload successfully', async () => {
      const { parseString } = require('xml2js');
      parseString.mockImplementation((xml: any, options: any, callback: any) => callback(null, { root: { name: 'John', age: '30' } }));

      const xmlSchema = {
        type: 'object',
        properties: {
          root: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              age: { type: 'string' },
            },
            required: ['name'],
          },
        },
      };
      mockDatabaseService.query.mockResolvedValue(
        createMockQueryResult([{ schema: xmlSchema, mapping: mockMapping, functions: mockFunctions }]),
      );

      const result = await service.handleMessage('<root><name>John</name><age>30</age></root>', '/test', 'tenant1', true);

      expect(parseString).toHaveBeenCalled();
      expect(result).toHaveProperty('success', true);
    });

    it('should handle XML parsing errors', async () => {
      const { parseString } = require('xml2js');
      const parseError = new Error('XML parse error');
      parseString.mockImplementation((xml: any, options: any, callback: any) => {
        callback(parseError, null);
      });

      const xmlSchema = {
        ...mockSchema,
        properties: {
          root: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              age: { type: 'string' },
            },
          },
        },
      };
      mockDatabaseService.query.mockResolvedValue(
        createMockQueryResult([{ schema: xmlSchema, mapping: mockMapping, functions: mockFunctions }]),
      );

      await expect(service.handleMessage('<invalid-xml>', '/test', 'tenant1', true)).rejects.toThrow('XML parse error');
      expect(parseString).toHaveBeenCalled();
    });

    it('should handle validation errors with detailed error info', async () => {
      const result = await service.handleMessage({ age: 'invalid' }, '/test', 'tenant1', false);

      expect(result).toMatchObject({ isMatch: false });
      expect(result).toHaveProperty('differences');
      expect(mockDatabaseOperationsService.saveToQuarantine).toHaveBeenCalled();
    });

    it('should handle AJV validation exception', async () => {
      const invalidSchema = {
        type: 'object',
        properties: {
          // This will cause AJV to throw during validation
          name: { $ref: 'nonexistent' },
        },
      };
      mockDatabaseService.query.mockResolvedValue(
        createMockQueryResult([{ schema: invalidSchema, mapping: mockMapping, functions: mockFunctions }]),
      );

      const result = await service.handleMessage({ name: 'John' }, '/test', 'tenant1', false);

      expect(result).toMatchObject({ isMatch: false });
    });

    it('should handle additional properties validation error', async () => {
      const strictSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
        additionalProperties: false,
      };
      mockDatabaseService.query.mockResolvedValue(
        createMockQueryResult([{ schema: strictSchema, mapping: mockMapping, functions: mockFunctions }]),
      );

      const result = await service.handleMessage({ name: 'John', unexpectedField: 'value' }, '/test', 'tenant1', false);

      expect(result).toMatchObject({ isMatch: false });
      expect(mockDatabaseOperationsService.saveToQuarantine).toHaveBeenCalled();
    });

    it('should handle missing mapped fields gracefully', async () => {
      const mappingWithMissingField = [
        {
          source: ['name'],
          destination: 'redis.userName',
          delimiter: '',
          prefix: '',
          suffix: '',
        },
        {
          source: ['nonexistent.field'],
          destination: 'redis.missingData',
          delimiter: '',
          prefix: '',
          suffix: '',
        },
      ];
      mockDatabaseService.query.mockResolvedValue(
        createMockQueryResult([{ schema: mockSchema, mapping: mappingWithMissingField, functions: mockFunctions }]),
      );

      const result = await service.handleMessage({ name: 'John', age: 30 }, '/test', 'tenant1', false);

      // Should still succeed even with missing fields
      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('dataCache');
    });

    it('should handle database errors', async () => {
      mockDatabaseService.query.mockRejectedValue(new Error('DB error'));

      const result = await service.handleMessage({}, '/test', 'tenant1', false);

      expect(result).toMatchObject({ isMatch: false });
      expect(mockLoggerService.error).toHaveBeenCalledWith(expect.stringContaining('DB error'));
    });

    it('should handle transaction relationship saving', async () => {
      const mappingWithRelationship = [
        {
          source: ['name'],
          destination: 'redis.userName',
          delimiter: '',
          prefix: '',
          suffix: '',
        },
        {
          source: ['DataCache.dbtrAcctId'],
          destination: 'transactionDetails.dbtrAcctId',
          delimiter: '',
          prefix: '',
          suffix: '',
        },
        {
          source: ['DataCache.cdtrAcctId'],
          destination: 'transactionDetails.cdtrAcctId',
          delimiter: '',
          prefix: '',
          suffix: '',
        },
      ];
      mockDatabaseService.query.mockResolvedValue(
        createMockQueryResult([{ schema: mockSchema, mapping: mappingWithRelationship, functions: mockFunctions }]),
      );

      const payloadWithRelationship = {
        name: 'John',
        age: 30,
        DataCache: {
          dbtrAcctId: 'account123',
          cdtrAcctId: 'account456',
        },
      };

      const result = await service.handleMessage(payloadWithRelationship, '/test', 'tenant1', false);

      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('transactionRelationship');
    });

    it('should handle transaction relationship with SUM transformation', async () => {
      const mappingWithTransactionSum = [
        {
          source: ['amount1', 'amount2'],
          destination: 'transactionDetails.totalAmount',
          delimiter: '',
          prefix: '',
          suffix: '',
          transformation: 'SUM',
        },
      ];
      const schemaWithAmounts = {
        type: 'object',
        properties: {
          amount1: { type: 'number' },
          amount2: { type: 'number' },
        },
      };
      mockDatabaseService.query.mockResolvedValue(
        createMockQueryResult([{ schema: schemaWithAmounts, mapping: mappingWithTransactionSum, functions: mockFunctions }]),
      );

      const result = await service.handleMessage({ amount1: 500, amount2: 250 }, '/test', 'tenant1', false);

      expect(result).toHaveProperty('success', true);
      if ('transactionRelationship' in result) {
        expect((result.transactionRelationship as any).totalAmount).toBe('750');
      }
    });

    it('should extract EndToEndId from transaction relationship mapping', async () => {
      const mappingWithEndToEndId = [
        {
          source: ['txId'],
          destination: 'transactionDetails.EndToEndId',
          delimiter: '',
          prefix: 'TXN-',
          suffix: '',
        },
      ];
      const schemaWithTxId = {
        type: 'object',
        properties: {
          txId: { type: 'string' },
        },
      };
      mockDatabaseService.query.mockResolvedValue(
        createMockQueryResult([{ schema: schemaWithTxId, mapping: mappingWithEndToEndId, functions: mockFunctions }]),
      );

      const result = await service.handleMessage({ txId: '123456' }, '/test', 'tenant1', false);

      expect(result).toHaveProperty('success', true);
      if ('endToEndId' in result) {
        expect(result.endToEndId).toBe('TXN-123456');
      }
    });

    it('should handle mapping with SUM transformation', async () => {
      const mappingWithSum = [
        {
          source: ['amount1', 'amount2'],
          destination: 'redis.totalAmount',
          delimiter: '',
          prefix: '',
          suffix: '',
          transformation: 'SUM',
        },
      ];
      const schemaWithAmounts = {
        type: 'object',
        properties: {
          amount1: { type: 'number' },
          amount2: { type: 'number' },
        },
      };
      mockDatabaseService.query.mockResolvedValue(
        createMockQueryResult([{ schema: schemaWithAmounts, mapping: mappingWithSum, functions: mockFunctions }]),
      );

      const result = await service.handleMessage({ amount1: 100, amount2: 200 }, '/test', 'tenant1', false);

      expect(result).toHaveProperty('success', true);
      if ('dataCache' in result) {
        expect((result.dataCache as any).totalAmount).toBe('300');
      }
    });

    it('should handle mapping with prefix and suffix', async () => {
      const mappingWithPrefixSuffix = [
        {
          source: ['name'],
          destination: 'redis.formattedName',
          delimiter: '',
          prefix: 'USER-',
          suffix: '-001',
        },
      ];
      mockDatabaseService.query.mockResolvedValue(
        createMockQueryResult([{ schema: mockSchema, mapping: mappingWithPrefixSuffix, functions: mockFunctions }]),
      );

      const result = await service.handleMessage({ name: 'John', age: 30 }, '/test', 'tenant1', false);

      expect(result).toHaveProperty('success', true);
      if ('dataCache' in result) {
        expect((result.dataCache as any).formattedName).toBe('USER-John-001');
      }
    });

    it('should handle mapping with split values to multiple destinations', async () => {
      const mappingWithSplit = [
        {
          source: ['fullName'],
          destination: ['redis.firstName', 'redis.lastName'],
          delimiter: ' ',
        },
      ];
      const schemaWithFullName = {
        type: 'object',
        properties: {
          fullName: { type: 'string' },
        },
      };
      mockDatabaseService.query.mockResolvedValue(
        createMockQueryResult([{ schema: schemaWithFullName, mapping: mappingWithSplit, functions: mockFunctions }]),
      );

      const result = await service.handleMessage({ fullName: 'John Doe' }, '/test', 'tenant1', false);

      expect(result).toHaveProperty('success', true);
      if ('dataCache' in result) {
        expect((result.dataCache as any).firstName).toBe('John');
        expect((result.dataCache as any).lastName).toBe('Doe');
      }
    });

    it('should handle mapping with constant values', async () => {
      const mappingWithConstant = [
        {
          constantValue: 'CONSTANT_VALUE',
          destination: 'redis.constantField',
        },
      ];
      mockDatabaseService.query.mockResolvedValue(
        createMockQueryResult([{ schema: mockSchema, mapping: mappingWithConstant, functions: mockFunctions }]),
      );

      const result = await service.handleMessage({ name: 'John', age: 30 }, '/test', 'tenant1', false);

      expect(result).toHaveProperty('success', true);
      if ('dataCache' in result) {
        expect((result.dataCache as any).constantField).toBe('CONSTANT_VALUE');
      }
    });

    it('should handle mapping errors gracefully', async () => {
      const mappingThatThrows = [
        {
          source: ['deeply.nested.nonexistent.path'],
          destination: 'redis.data',
          delimiter: '',
        },
      ];
      mockDatabaseService.query.mockResolvedValue(
        createMockQueryResult([{ schema: mockSchema, mapping: mappingThatThrows, functions: mockFunctions }]),
      );

      const result = await service.handleMessage({ name: 'John', age: 30 }, '/test', 'tenant1', false);

      // Should still succeed even with mapping errors
      expect(result).toHaveProperty('success', true);
    });

    it('should handle function execution errors', async () => {
      const functionsWithError = [
        {
          functionName: 'saveTransactionHistory',
          params: ['name'],
        },
      ];
      mockDatabaseService.query.mockResolvedValue(
        createMockQueryResult([{ schema: mockSchema, mapping: mockMapping, functions: functionsWithError }]),
      );
      mockDatabaseOperationsService.saveTransactionHistory.mockRejectedValue(new Error('Function execution failed'));

      const result = await service.handleMessage({ name: 'John', age: 30 }, '/test', 'tenant1', false);

      expect(result).toMatchObject({ isMatch: false });
      expect(result).toHaveProperty('differences');
      if ('differences' in result) {
        expect(result.differences[0]).toContain('Function execution failed');
      }
      expect(mockLoggerService.error).toHaveBeenCalledWith(expect.stringContaining('Failed to execute configured functions'));
    });

    it('should execute configured functions with constant value params', async () => {
      const functionsWithConstant = [
        {
          functionName: 'saveTransactionHistory',
          params: ['name'],
        },
      ];
      const mappingWithConstant = [
        {
          constantValue: 'CONSTANT',
          destination: 'name',
        },
      ];
      mockDatabaseService.query.mockResolvedValue(
        createMockQueryResult([{ schema: mockSchema, mapping: mappingWithConstant, functions: functionsWithConstant }]),
      );
      mockDatabaseOperationsService.saveTransactionHistory.mockResolvedValue(undefined);

      const result = await service.handleMessage({ name: 'John', age: 30 }, '/test', 'tenant1', false);

      expect(result).toHaveProperty('success', true);
      expect(mockDatabaseOperationsService.saveTransactionHistory).toHaveBeenCalled();
    });

    it('should execute configured functions with array destination params', async () => {
      const functionsWithArrayDest = [
        {
          functionName: 'saveTransactionHistory',
          params: ['firstName'],
        },
      ];
      const mappingWithArrayDest = [
        {
          source: ['fullName'],
          destination: ['firstName', 'lastName'],
          delimiter: ' ',
        },
      ];
      const schemaWithFullName = {
        type: 'object',
        properties: {
          fullName: { type: 'string' },
        },
      };
      mockDatabaseService.query.mockResolvedValue(
        createMockQueryResult([{ schema: schemaWithFullName, mapping: mappingWithArrayDest, functions: functionsWithArrayDest }]),
      );
      mockDatabaseOperationsService.saveTransactionHistory.mockResolvedValue(undefined);

      const result = await service.handleMessage({ fullName: 'John Doe' }, '/test', 'tenant1', false);

      expect(result).toHaveProperty('success', true);
      expect(mockDatabaseOperationsService.saveTransactionHistory).toHaveBeenCalled();
    });
  });

  describe('saveTransactionDataAndNotify', () => {
    const mockTazamaPayload = {
      transaction: { name: 'John', age: 30 },
      TxTp: 'pacs.002',
      dataCache: { userName: 'John' },
    };

    beforeEach(() => {
      mockDatabaseOperationsService.saveTransactionHistory.mockResolvedValue(undefined);
      mockNatsService.notifyEventDirector.mockResolvedValue(undefined);
    });

    it('should successfully save transaction and notify', async () => {
      await service.saveTransactionDataAndNotify(mockTazamaPayload, 'pacs.002', 'test123');

      expect(mockDatabaseOperationsService.saveTransactionHistory).toHaveBeenCalledWith(mockTazamaPayload, 'pacs.002_test123');
      expect(mockNatsService.notifyEventDirector).toHaveBeenCalledWith(mockTazamaPayload);
      expect(mockLoggerService.log).toHaveBeenCalledWith(expect.stringContaining('Successfully saved transaction history'));
    });

    it('should handle transaction history save errors', async () => {
      const error = new Error('Failed to save transaction history');
      mockDatabaseOperationsService.saveTransactionHistory.mockRejectedValue(error);

      await expect(service.saveTransactionDataAndNotify(mockTazamaPayload, 'pacs.002', 'test123')).rejects.toThrow();
      expect(mockLoggerService.error).toHaveBeenCalledWith(expect.stringContaining('Failed to save transaction history'));
    });

    it('should handle event director notification errors', async () => {
      const error = new Error('Failed to notify event-director');
      mockNatsService.notifyEventDirector.mockRejectedValue(error);

      await expect(service.saveTransactionDataAndNotify(mockTazamaPayload, 'pacs.002', 'test123')).rejects.toThrow();
      expect(mockLoggerService.error).toHaveBeenCalledWith(expect.stringContaining('Failed to notify event-director'));
    });

    it('should handle generic operation errors', async () => {
      const error = new Error('Some other error');
      mockDatabaseOperationsService.saveTransactionHistory.mockRejectedValue(error);

      await expect(service.saveTransactionDataAndNotify(mockTazamaPayload, 'pacs.002', 'test123')).rejects.toThrow();
      expect(mockLoggerService.error).toHaveBeenCalledWith(expect.stringContaining('Failed to complete transaction operations'));
    });
  });

  describe('saveTransactionDataAndNotify', () => {
    const testPayload = { transaction: { test: 'data' }, TxTp: 'test.type', dataCache: {} };

    it('should save and notify successfully', async () => {
      mockDatabaseOperationsService.saveTransactionHistory.mockResolvedValue(undefined);
      mockNatsService.notifyEventDirector.mockResolvedValue(undefined);

      await service.saveTransactionDataAndNotify(testPayload, 'test.type', 'end-to-end-123');

      expect(mockDatabaseOperationsService.saveTransactionHistory).toHaveBeenCalled();
      expect(mockNatsService.notifyEventDirector).toHaveBeenCalled();
    });

    it('should handle errors', async () => {
      mockDatabaseOperationsService.saveTransactionHistory.mockRejectedValue(new Error('Save failed'));

      await expect(service.saveTransactionDataAndNotify(testPayload, 'test.type', 'end-to-end-123')).rejects.toThrow('Save failed');
    });
  });
});
