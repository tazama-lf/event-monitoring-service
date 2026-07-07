import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { LoggerService, RedisService } from '@tazama-lf/frms-coe-lib';
import { DemsEngineService } from '../../src/dems-engine/dems-engine.service';
import { NatsService } from '../../src/nats/nats.service';
import { DatabaseOperationsService } from '../../src/commons';
import { DatabaseService } from '../../src/database/database.service';
import {
  SaveTransactionHistoryError,
  NotifyEventDirectorError,
  SaveTransactionRelationshipError,
} from '../../src/errors/transaction-operation.errors';

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
      FIToFIPmtSts: { type: 'object', additionalProperties: true },
    },
    required: ['name'],
    additionalProperties: true,
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
      getPacs008ByEndToEndId: jest.fn(),
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
    const mockTenantId = 'tenant1';
    it('should return cached schema on cache hit (object format)', async () => {
      const cachedData = { schema: mockSchema, mapping: mockMapping, functions: mockFunctions };
      (mockRedisService.getJson as jest.Mock).mockResolvedValue(cachedData);

      const result = await service.findSchemaAndMapping('/test', mockTenantId);

      expect(result).toEqual([mockSchema, mockMapping, mockFunctions]);
      expect(mockLoggerService.log).toHaveBeenCalledWith('Cache hit for endpoint: /test');
    });

    it('should parse cached schema when it is a string', async () => {
      const cachedString = JSON.stringify({ schema: mockSchema, mapping: mockMapping, functions: mockFunctions });
      (mockRedisService.getJson as jest.Mock).mockResolvedValue(cachedString);

      const mockTenantId = 'tenant1';
      const result = await service.findSchemaAndMapping('/test', mockTenantId);

      expect(result).toEqual([mockSchema, mockMapping, mockFunctions]);
    });

    it('should handle cache parsing error and fallback to database', async () => {
      (mockRedisService.getJson as jest.Mock).mockResolvedValue('invalid-json-string');
      mockDatabaseService.query.mockResolvedValue(
        createMockQueryResult([
          { schema: mockSchema, mapping: mockMapping, functions: mockFunctions, related_transaction: '', publishing_status: 'active' },
        ]),
      );

      const result = await service.findSchemaAndMapping('/test', mockTenantId);

      expect(mockLoggerService.error).toHaveBeenCalledWith(expect.stringContaining('Failed to parse cached schema'));
      expect(result).toEqual([mockSchema, mockMapping, mockFunctions, '']);
    });

    it('should query database on cache miss', async () => {
      (mockRedisService.getJson as jest.Mock).mockResolvedValue(null);
      mockDatabaseService.query.mockResolvedValue(
        createMockQueryResult([
          { schema: mockSchema, mapping: mockMapping, functions: mockFunctions, related_transaction: '', publishing_status: 'active' },
        ]),
      );

      const result = await service.findSchemaAndMapping('/test', mockTenantId);

      expect(result).toEqual([mockSchema, mockMapping, mockFunctions, '']);
      expect(mockRedisService.setJson).toHaveBeenCalledWith(
        `${mockTenantId}:/test`,
        JSON.stringify({
          schema: mockSchema,
          mapping: mockMapping,
          functions: mockFunctions,
          related_transaction: '',
          publishing_status: 'active',
        }),
        3600,
      );
    });

    it('should return null when no schema found', async () => {
      (mockRedisService.getJson as jest.Mock).mockResolvedValue(null);
      mockDatabaseService.query.mockResolvedValue(createMockQueryResult([]));

      const result = await service.findSchemaAndMapping('/test', mockTenantId);

      expect(result).toBeNull();
      expect(mockLoggerService.log).toHaveBeenCalledWith('No schema found for endpoint: /test');
    });

    it('should handle database query errors', async () => {
      (mockRedisService.getJson as jest.Mock).mockResolvedValue(null);
      mockDatabaseService.query.mockRejectedValue(new Error('Database connection failed'));

      await expect(service.findSchemaAndMapping('/test', mockTenantId)).rejects.toThrow('Database connection failed');
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
            relatedTransaction: null,
            related_transaction: '',
            publishing_status: 'active',
          },
        ]),
      );
      (mockRedisService.getJson as jest.Mock).mockResolvedValue(null);
      mockDatabaseOperationsService.saveTransactionHistory.mockResolvedValue(undefined);
      mockDatabaseOperationsService.saveTransactionRelationship.mockResolvedValue(undefined);
      mockDatabaseOperationsService.saveToQuarantine.mockResolvedValue(undefined);
      mockDatabaseOperationsService.getPacs008ByEndToEndId.mockResolvedValue(undefined);
      mockNatsService.notifyEventDirector.mockResolvedValue(undefined);
    });

    it('should return error when schema not found', async () => {
      mockDatabaseService.query.mockResolvedValue(createMockQueryResult([]));

      const result = await service.handleMessage({}, '/test', 'tenant1', false);

      expect(result).toMatchObject({ isMatch: false, message: 'Schema not found for the specified endpoint' });
    });

    it('should process valid JSON payload', async () => {
      const testPayload = {
        name: 'John',
        age: 30,
        FIToFIPmtSts: {
          TxInfAndSts: {
            OrgnlEndToEndId: 'test-end-to-end-id',
          },
        },
      };
      const result = await service.handleMessage(testPayload, '/test', 'tenant1', false);

      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('configuredSchema');
      expect(result).toHaveProperty('tazamaPayload');
      expect(result).toHaveProperty('DataCache');
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
        createMockQueryResult([{ schema: xmlSchema, mapping: mockMapping, functions: mockFunctions, publishing_status: 'active' }]),
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
        createMockQueryResult([{ schema: xmlSchema, mapping: mockMapping, functions: mockFunctions, publishing_status: 'active' }]),
      );

      const result = await service.handleMessage('<invalid-xml>', '/test', 'tenant1', true);
      expect(result).toHaveProperty('isMatch', false);
      expect(result).toHaveProperty('message', 'Unexpected error occurred while processing message');
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
        createMockQueryResult([{ schema: invalidSchema, mapping: mockMapping, functions: mockFunctions, publishing_status: 'active' }]),
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
        createMockQueryResult([{ schema: strictSchema, mapping: mockMapping, functions: mockFunctions, publishing_status: 'active' }]),
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
        createMockQueryResult([
          { schema: mockSchema, mapping: mappingWithMissingField, functions: mockFunctions, publishing_status: 'active' },
        ]),
      );

      const result = await service.handleMessage({ name: 'John', age: 30 }, '/test', 'tenant1', false);

      // Should still succeed even with missing fields
      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('DataCache');
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
        createMockQueryResult([
          { schema: mockSchema, mapping: mappingWithRelationship, functions: mockFunctions, publishing_status: 'active' },
        ]),
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

    it('should extract EndToEndId from transaction relationship mapping', async () => {
      const mappingWithEndToEndId = [
        {
          source: ['TxTp'],
          destination: 'transactionDetails.EndToEndId',
          delimiter: '',
          prefix: 'TXN-',
          suffix: '',
        },
      ];
      const schemaWithTxId = {
        type: 'object',
        properties: {
          TxTp: { type: 'string' },
        },
      };
      (mockRedisService.getJson as jest.Mock).mockResolvedValue(null);
      mockDatabaseService.query.mockResolvedValue(
        createMockQueryResult([
          { schema: schemaWithTxId, mapping: mappingWithEndToEndId, functions: mockFunctions, publishing_status: 'active' },
        ]),
      );

      const result = await service.handleMessage({ TxTp: '123456' }, '/test', 'tenant1', false);

      expect(result).toHaveProperty('success', true);
      if ('success' in result && result.success) {
        // Verify successful processing - the mapping configuration was accepted
        expect(result.tazamaPayload).toBeDefined();
        expect(result.transactionType).toBe('test');
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
      (mockRedisService.getJson as jest.Mock).mockResolvedValue(null);
      mockDatabaseService.query.mockResolvedValue(
        createMockQueryResult([
          { schema: mockSchema, mapping: mappingWithPrefixSuffix, functions: mockFunctions, publishing_status: 'active' },
        ]),
      );

      const result = await service.handleMessage({ name: 'John', age: 30 }, '/test', 'tenant1', false);

      expect(result).toHaveProperty('success', true);
      if ('success' in result && result.success) {
        // Verify successful processing - the mapping configuration was accepted
        expect(result.tazamaPayload).toBeDefined();
        expect(result.transactionType).toBe('test');
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
      (mockRedisService.getJson as jest.Mock).mockResolvedValue(null);
      mockDatabaseService.query.mockResolvedValue(
        createMockQueryResult([
          { schema: schemaWithFullName, mapping: mappingWithSplit, functions: mockFunctions, publishing_status: 'active' },
        ]),
      );

      const result = await service.handleMessage({ fullName: 'John Doe' }, '/test', 'tenant1', false);

      expect(result).toHaveProperty('success', true);
      if ('success' in result && result.success) {
        // Verify successful processing - the mapping configuration was accepted
        expect(result.tazamaPayload).toBeDefined();
        expect(result.transactionType).toBe('test');
      }
    });

    it('should handle mapping with constant values', async () => {
      const mappingWithConstant = [
        {
          constantValue: 'CONSTANT_VALUE',
          destination: 'redis.constantField',
        },
      ];
      (mockRedisService.getJson as jest.Mock).mockResolvedValue(null);
      mockDatabaseService.query.mockResolvedValue(
        createMockQueryResult([
          { schema: mockSchema, mapping: mappingWithConstant, functions: mockFunctions, publishing_status: 'active' },
        ]),
      );

      const result = await service.handleMessage({ name: 'John', age: 30 }, '/test', 'tenant1', false);

      expect(result).toHaveProperty('success', true);
      if ('success' in result && result.success) {
        // Verify successful processing - the mapping configuration was accepted
        expect(result.tazamaPayload).toBeDefined();
        expect(result.transactionType).toBe('test');
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
        createMockQueryResult([{ schema: mockSchema, mapping: mappingThatThrows, functions: mockFunctions, publishing_status: 'active' }]),
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
        createMockQueryResult([{ schema: mockSchema, mapping: mockMapping, functions: functionsWithError, publishing_status: 'active' }]),
      );
      mockDatabaseOperationsService.saveTransactionHistory.mockRejectedValue(new Error('Function execution failed'));

      const result = await service.handleMessage({ name: 'John', age: 30 }, '/test', 'tenant1', false);

      expect(result).toMatchObject({ isMatch: false });
      expect(result).toHaveProperty('differences');
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
        createMockQueryResult([
          { schema: mockSchema, mapping: mappingWithConstant, functions: functionsWithConstant, publishing_status: 'active' },
        ]),
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
        createMockQueryResult([
          { schema: schemaWithFullName, mapping: mappingWithArrayDest, functions: functionsWithArrayDest, publishing_status: 'active' },
        ]),
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
      DataCache: { userName: 'John' },
    };

    beforeEach(() => {
      mockDatabaseOperationsService.saveTransactionHistory.mockResolvedValue(undefined);
      mockNatsService.notifyEventDirector.mockResolvedValue(undefined);
    });

    it('should successfully save transaction and notify', async () => {
      await service.saveTransactionDataAndNotify(mockTazamaPayload, 'pacs.002', 'test123');

      expect(mockDatabaseOperationsService.saveTransactionHistory).toHaveBeenCalledWith(mockTazamaPayload, 'pacs.002_test123', undefined);
      expect(mockNatsService.notifyEventDirector).toHaveBeenCalledWith(mockTazamaPayload);
      expect(mockLoggerService.log).toHaveBeenCalledWith(expect.stringContaining('Successfully saved transaction history'));
    });

    it('should handle transaction history save errors', async () => {
      const originalError = new Error('Database error');
      const error = new SaveTransactionHistoryError(originalError, 'pacs.002_test123');
      mockDatabaseOperationsService.saveTransactionHistory.mockRejectedValue(error);

      await expect(service.saveTransactionDataAndNotify(mockTazamaPayload, 'pacs.002', 'test123')).rejects.toThrow();
      expect(mockLoggerService.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to save transaction history'),
        expect.any(String),
        'DemsEngineService',
      );
    });

    it('should handle event director notification errors', async () => {
      const originalError = new Error('NATS connection error');
      const error = new NotifyEventDirectorError(originalError);
      mockNatsService.notifyEventDirector.mockRejectedValue(error);

      await expect(service.saveTransactionDataAndNotify(mockTazamaPayload, 'pacs.002', 'test123')).rejects.toThrow();
      expect(mockLoggerService.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to notify event-director'),
        expect.any(String),
        'DemsEngineService',
      );
    });

    it('should handle generic operation errors', async () => {
      const error = new Error('Some other error');
      mockDatabaseOperationsService.saveTransactionHistory.mockRejectedValue(error);

      await expect(service.saveTransactionDataAndNotify(mockTazamaPayload, 'pacs.002', 'test123')).rejects.toThrow();
      expect(mockLoggerService.error).toHaveBeenCalledWith(
        expect.stringContaining('Unexpected error in save transaction history'),
        expect.any(String),
        'DemsEngineService',
      );
    });
  });

  describe('saveTransactionDataAndNotify', () => {
    const testPayload = { transaction: { test: 'data' }, TxTp: 'test.type', DataCache: {} };

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

    it('should handle generic TransactionOperationError subclass (not history/notify)', async () => {
      const relErr = new SaveTransactionRelationshipError(new Error('rel db failed'));
      mockDatabaseOperationsService.saveTransactionHistory.mockRejectedValue(relErr);
      mockNatsService.notifyEventDirector.mockResolvedValue(undefined);

      await expect(service.saveTransactionDataAndNotify(testPayload, 'test.type', 'end-to-end-123')).rejects.toThrow(/Operation failed:/);
      expect(mockLoggerService.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to save transaction relationship'),
        expect.any(String),
        'DemsEngineService',
      );
    });
  });

  describe('executeConfiguredFunctions branches (via handleMessage)', () => {
    beforeEach(() => {
      (mockRedisService.getJson as jest.Mock).mockResolvedValue(null);
      mockDatabaseOperationsService.saveTransactionHistory.mockResolvedValue(undefined);
      mockDatabaseOperationsService.saveTransactionRelationship.mockResolvedValue(undefined);
      mockDatabaseOperationsService.saveToQuarantine.mockResolvedValue(undefined);
      (mockDatabaseOperationsService as any).addAccount = jest.fn().mockResolvedValue(undefined);
      (mockDatabaseOperationsService as any).addEntity = jest.fn().mockResolvedValue(undefined);
      (mockDatabaseOperationsService as any).addAccountHolder = jest.fn().mockResolvedValue(undefined);
      (mockDatabaseOperationsService as any).addDataModelTable = jest.fn().mockResolvedValue(undefined);
      mockNatsService.notifyEventDirector.mockResolvedValue(undefined);
    });

    it('should return error response when configured function is not in allow-list', async () => {
      mockDatabaseService.query.mockResolvedValue(
        createMockQueryResult([
          {
            schema: mockSchema,
            mapping: mockMapping,
            functions: [{ functionName: 'dropAllTables', params: [] }],
            related_transaction: '',
            publishing_status: 'active',
          },
        ]),
      );

      const result = await service.handleMessage({ name: 'John' }, '/test', 'tenant1', false);

      expect(result).toMatchObject({ isMatch: false, message: 'function execution failed' });
      expect(result).toHaveProperty('differences');
    });

    it('should mark saveTransactionDetails and call saveTransactionRelationship', async () => {
      mockDatabaseService.query.mockResolvedValue(
        createMockQueryResult([
          {
            schema: mockSchema,
            mapping: mockMapping,
            functions: [{ functionName: 'saveTransactionDetails', params: [] }],
            related_transaction: '',
            publishing_status: 'active',
          },
        ]),
      );

      const result = await service.handleMessage({ name: 'John' }, '/test', 'tenant1', false);

      expect(result).toHaveProperty('success', true);
      expect(mockDatabaseOperationsService.saveTransactionRelationship).toHaveBeenCalled();
    });

    it('should return error when saveTransactionRelationship throws', async () => {
      mockDatabaseService.query.mockResolvedValue(
        createMockQueryResult([
          {
            schema: mockSchema,
            mapping: mockMapping,
            functions: [{ functionName: 'saveTransactionDetails', params: [] }],
            related_transaction: '',
            publishing_status: 'active',
          },
        ]),
      );
      mockDatabaseOperationsService.saveTransactionRelationship.mockRejectedValue(new Error('rel-save-fail'));

      const result = await service.handleMessage({ name: 'John' }, '/test', 'tenant1', false);

      expect(result).toMatchObject({ isMatch: false, message: 'function execution failed' });
      expect(mockLoggerService.error).toHaveBeenCalledWith(
        expect.stringContaining("Function 'saveTransactionDetails' failed"),
        '',
        'DemsEngineService',
      );
    });

    it('should return error when addDataModelTable has fewer than 2 columns', async () => {
      mockDatabaseService.query.mockResolvedValue(
        createMockQueryResult([
          {
            schema: mockSchema,
            mapping: mockMapping,
            functions: [
              {
                functionName: 'addDataModelTable',
                tableName: 'accounts',
                columns: [{ datasource: 'payload', param: 'name' }],
                params: [],
              },
            ],
            related_transaction: '',
            publishing_status: 'active',
          },
        ]),
      );

      const result = await service.handleMessage({ name: 'John' }, '/test', 'tenant1', false);

      expect(result).toMatchObject({ isMatch: false, message: 'function execution failed' });
    });

    it('should return error when addDataModelTable has missing tableName', async () => {
      mockDatabaseService.query.mockResolvedValue(
        createMockQueryResult([
          {
            schema: mockSchema,
            mapping: mockMapping,
            functions: [
              {
                functionName: 'addDataModelTable',
                columns: [
                  { datasource: 'payload', param: 'name' },
                  { datasource: 'payload', param: 'age' },
                ],
                params: [],
              },
            ],
            related_transaction: '',
            publishing_status: 'active',
          },
        ]),
      );

      const result = await service.handleMessage({ name: 'John', age: 30 }, '/test', 'tenant1', false);

      expect(result).toMatchObject({ isMatch: false, message: 'function execution failed' });
    });

    it('should call addDataModelTable with payload datasource', async () => {
      mockDatabaseService.query.mockResolvedValue(
        createMockQueryResult([
          {
            schema: mockSchema,
            mapping: mockMapping,
            functions: [
              {
                functionName: 'addDataModelTable',
                tableName: 'accounts',
                columns: [
                  { datasource: 'payload', param: 'name' },
                  { datasource: 'payload', param: 'age' },
                ],
                params: [],
              },
            ],
            related_transaction: '',
            publishing_status: 'active',
          },
        ]),
      );

      const result = await service.handleMessage({ name: 'John', age: 30 }, '/test', 'tenant1', false);

      expect(result).toHaveProperty('success', true);
      expect((mockDatabaseOperationsService as any).addDataModelTable).toHaveBeenCalledWith(
        'accounts',
        'John',
        30,
        expect.any(String),
        expect.any(String),
      );
    });

    it('should call addDataModelTable with dataModel datasource', async () => {
      const dynamicMapping = [
        {
          source: ['name'],
          destination: 'dataModel.userName',
          delimiter: '',
        },
        {
          source: ['age'],
          destination: 'dataModel.userAge',
          delimiter: '',
        },
      ];
      mockDatabaseService.query.mockResolvedValue(
        createMockQueryResult([
          {
            schema: mockSchema,
            mapping: dynamicMapping,
            functions: [
              {
                functionName: 'addDataModelTable',
                tableName: 'accounts',
                columns: [
                  { datasource: 'dataModel', param: 'dataModel.userName' },
                  { datasource: 'dataModel', param: 'dataModel.userAge' },
                ],
                params: [],
              },
            ],
            related_transaction: '',
            publishing_status: 'active',
          },
        ]),
      );

      const result = await service.handleMessage({ name: 'John', age: 30 }, '/test', 'tenant1', false);

      expect(result).toHaveProperty('success', true);
      expect((mockDatabaseOperationsService as any).addDataModelTable).toHaveBeenCalled();
    });

    it('should return error when generic allowed function throws', async () => {
      const mappingForFn = [{ constantValue: 'ACC-1', destination: 'accountId' }];
      mockDatabaseService.query.mockResolvedValue(
        createMockQueryResult([
          {
            schema: mockSchema,
            mapping: mappingForFn,
            functions: [{ functionName: 'addAccount', params: ['accountId'] }],
            related_transaction: '',
            publishing_status: 'active',
          },
        ]),
      );
      (mockDatabaseOperationsService as any).addAccount = jest.fn().mockRejectedValue(new Error('db-write-fail'));

      const result = await service.handleMessage({ name: 'John' }, '/test', 'tenant1', false);

      expect(result).toMatchObject({ isMatch: false, message: 'function execution failed' });
      expect(mockLoggerService.error).toHaveBeenCalledWith(
        expect.stringContaining("Function 'addAccount' failed"),
        '',
        'DemsEngineService',
      );
    });

    it('should log when configuredMapping is null (no mapping configured)', async () => {
      mockDatabaseService.query.mockResolvedValue(
        createMockQueryResult([
          {
            schema: mockSchema,
            mapping: null,
            functions: mockFunctions,
            related_transaction: '',
            publishing_status: 'active',
          },
        ]),
      );

      const result = await service.handleMessage({ name: 'John' }, '/test', 'tenant1', false);

      expect(result).toHaveProperty('success', true);
      expect(mockLoggerService.log).toHaveBeenCalledWith(expect.stringContaining('No mapping configured for endpoint'));
    });

    it('should route dynamic mapping (non-redis/non-transactionDetails destination) to dynamicMapping', async () => {
      const dynMapping = [
        {
          source: ['name'],
          destination: 'dataModel.userName',
          delimiter: '',
        },
      ];
      mockDatabaseService.query.mockResolvedValue(
        createMockQueryResult([
          {
            schema: mockSchema,
            mapping: dynMapping,
            functions: mockFunctions,
            related_transaction: '',
            publishing_status: 'active',
          },
        ]),
      );

      const result = await service.handleMessage({ name: 'John' }, '/test', 'tenant1', false);

      expect(result).toHaveProperty('success', true);
      if ('success' in result && result.success) {
        expect(result.dynamicMapping).toBeDefined();
      }
    });

    it('should keep pacs.002 payload as-is for NATS transaction', async () => {
      const pacs002Schema = {
        type: 'object',
        additionalProperties: true,
      };
      mockDatabaseService.query.mockResolvedValue(
        createMockQueryResult([
          {
            schema: pacs002Schema,
            mapping: [],
            functions: mockFunctions,
            related_transaction: '',
            publishing_status: 'active',
          },
        ]),
      );

      const pacs002Payload = {
        FIToFIPmtSts: {
          GrpHdr: { MsgId: 'M1' },
          TxInfAndSts: { OrgnlEndToEndId: 'e2e' },
        },
      };

      const result = await service.handleMessage(pacs002Payload, '/pacs.002.001.12', 'tenant1', false);

      expect(result).toHaveProperty('success', true);
      if ('success' in result && result.success) {
        expect(result.transactionType).toBe('pacs.002.001.12');
      }
    });
  });
});
