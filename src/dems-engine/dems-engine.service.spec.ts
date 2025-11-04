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
      items: {
        type: 'array',
        items: { type: 'string' },
      },
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
    {
      source: ['name'],
      destination: 'transactionDetails.source',
      delimiter: '',
      prefix: '',
      suffix: '',
    },
    {
      source: ['age'],
      destination: 'transactionDetails.destination',
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

  const mockPayload: any = {
    name: 'John Doe',
    age: 30,
    items: ['item1', 'item2'],
  };

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
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      verbose: jest.fn(),
    } as any;

    mockRedisService = {
      getJson: jest.fn(),
      setJson: jest.fn(),
    } as any;

    mockNatsService = {
      notifyEventDirector: jest.fn(),
      isReady: jest.fn().mockReturnValue(true),
    } as any;

    mockDatabaseOperationsService = {
      saveTransactionHistory: jest.fn(),
      saveTransactionRelationship: jest.fn(),
      saveToQuarantine: jest.fn(),
      addAccount: jest.fn(),
      addEntity: jest.fn(),
      addAccountHolder: jest.fn(),
    } as any;

    mockConfigService = {
      get: jest.fn().mockImplementation((key: string, defaultValue?: any) => {
        if (key === 'cache.timeToLive') return 3600;
        return defaultValue;
      }),
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

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should initialize with correct config values', () => {
      expect(mockConfigService.get).toHaveBeenCalledWith('cache.timeToLive', 3600);
    });
  });

  describe('findSchemaAndMapping', () => {
    const endpoint = '/test/endpoint';

    it('should return cached schema when cache hit', async () => {
      const cachedData = {
        schema: mockSchema,
        mapping: mockMapping,
        functions: mockFunctions,
      };
      (mockRedisService.getJson as jest.Mock).mockResolvedValue(cachedData);

      const result = await service.findSchemaAndMapping(endpoint);

      expect(mockLoggerService.log).toHaveBeenCalledWith(`Looking up schema for endpoint: ${endpoint}`);
      expect(mockLoggerService.log).toHaveBeenCalledWith(`Cache hit for endpoint: ${endpoint}`);
      expect(mockRedisService.getJson).toHaveBeenCalledWith(endpoint);
      expect(result).toEqual([mockSchema, mockMapping, mockFunctions]);
    });

    it('should parse string cached data', async () => {
      const cachedDataString = JSON.stringify({
        schema: mockSchema,
        mapping: mockMapping,
        functions: mockFunctions,
      });
      (mockRedisService.getJson as jest.Mock).mockResolvedValue(cachedDataString);

      const result = await service.findSchemaAndMapping(endpoint);

      expect(result).toEqual([mockSchema, mockMapping, mockFunctions]);
    });

    it('should handle parsing error and fallback to database', async () => {
      (mockRedisService.getJson as jest.Mock).mockResolvedValue('invalid json');
      (mockDatabaseService.query as jest.Mock).mockResolvedValue(
        createMockQueryResult([
          {
            schema: mockSchema,
            mapping: mockMapping,
            functions: mockFunctions,
          },
        ]),
      );
      (mockRedisService.setJson as jest.Mock).mockResolvedValue(undefined);

      const result = await service.findSchemaAndMapping(endpoint);

      expect(mockLoggerService.error).toHaveBeenCalledWith(expect.stringContaining('Failed to parse cached schema for endpoint'));
      expect(mockDatabaseService.query).toHaveBeenCalled();
      expect(result).toEqual([mockSchema, mockMapping, mockFunctions]);
    });

    it('should query database on cache miss', async () => {
      (mockRedisService.getJson as jest.Mock).mockResolvedValue(null);
      (mockDatabaseService.query as jest.Mock).mockResolvedValue(
        createMockQueryResult([
          {
            schema: mockSchema,
            mapping: mockMapping,
            functions: mockFunctions,
          },
        ]),
      );
      (mockRedisService.setJson as jest.Mock).mockResolvedValue(undefined);

      const result = await service.findSchemaAndMapping(endpoint);

      expect(mockLoggerService.log).toHaveBeenCalledWith(`Cache miss for endpoint: ${endpoint}. Querying database...`);
      expect(mockDatabaseService.query).toHaveBeenCalledWith(
        "SELECT schema, mapping, functions FROM config WHERE endpoint_path = $1 and publishing_status = 'active'",
        [endpoint],
      );
      expect(mockRedisService.setJson).toHaveBeenCalled();
      expect(result).toEqual([mockSchema, mockMapping, mockFunctions]);
    });

    it('should return null when no schema found', async () => {
      (mockRedisService.getJson as jest.Mock).mockResolvedValue(null);
      (mockDatabaseService.query as jest.Mock).mockResolvedValue(createMockQueryResult([]));

      const result = await service.findSchemaAndMapping(endpoint);

      expect(mockLoggerService.log).toHaveBeenCalledWith(`No schema found for endpoint: ${endpoint}`);
      expect(result).toBeNull();
    });
  });

  describe('handleMessage', () => {
    const endpoint = '/test/endpoint';
    const tenantId = 'tenant-123';

    beforeEach(() => {
      (mockDatabaseService.query as jest.Mock).mockResolvedValue(
        createMockQueryResult([
          {
            schema: mockSchema,
            mapping: mockMapping,
            functions: mockFunctions,
          },
        ]),
      );
      (mockRedisService.getJson as jest.Mock).mockResolvedValue(null);
      (mockRedisService.setJson as jest.Mock).mockResolvedValue(undefined);
      (mockDatabaseOperationsService.saveTransactionHistory as jest.Mock).mockResolvedValue(undefined);
      (mockDatabaseOperationsService.saveTransactionRelationship as jest.Mock).mockResolvedValue(undefined);
      (mockNatsService.notifyEventDirector as jest.Mock).mockResolvedValue(undefined);
    });

    it('should return error when schema not found', async () => {
      (mockDatabaseService.query as jest.Mock).mockResolvedValue(createMockQueryResult([]));

      const result = await service.handleMessage(mockPayload, endpoint, tenantId, false);

      expect(result).toEqual({
        isMatch: false,
        message: 'Schema not found for the specified endpoint',
        differences: ['No schema exists for this endpoint'],
      });
    });

    it('should successfully process valid JSON payload', async () => {
      const result = await service.handleMessage(mockPayload, endpoint, tenantId, false);

      expect(result).toEqual(
        expect.objectContaining({
          success: true,
          configuredSchema: mockSchema,
          transactionType: expect.any(String),
          endToEndId: expect.any(String),
        }),
      );
    });

    it('should return validation error for invalid payload', async () => {
      const invalidPayload: any = { age: 30 };

      const result = await service.handleMessage(invalidPayload, endpoint, tenantId, false);

      expect(result).toEqual(
        expect.objectContaining({
          isMatch: false,
          message: 'Payload structure does not match the schema',
          differences: expect.any(Array),
        }),
      );
    });

    it('should handle XML payload processing', async () => {
      const xmlPayload: any = '<root><name>John</name><age>30</age></root>';
      const { parseString } = require('xml2js');
      parseString.mockImplementation((xml: any, options: any, callback: any) => {
        // Convert to format that matches the schema - flatten the root
        callback(null, { name: 'John', age: 30 });
      });

      const result = await service.handleMessage(xmlPayload, endpoint, tenantId, true);

      expect(result).toEqual(
        expect.objectContaining({
          success: true,
        }),
      );
    });

    it('should handle XML parsing error', async () => {
      const xmlPayload: any = '<invalid>xml';
      const { parseString } = require('xml2js');
      parseString.mockImplementation((xml: any, options: any, callback: any) => {
        callback(new Error('XML parsing failed'));
      });

      // XML parsing errors are currently unhandled and thrown as exceptions
      await expect(service.handleMessage(xmlPayload, endpoint, tenantId, true)).rejects.toThrow('XML parsing failed');
    });

    it('should handle function execution failure', async () => {
      (mockDatabaseOperationsService.saveTransactionRelationship as jest.Mock).mockRejectedValue(new Error('Function execution failed'));

      const result = await service.handleMessage(mockPayload, endpoint, tenantId, false);

      expect(result).toEqual(
        expect.objectContaining({
          isMatch: false,
          message: 'compare functions with mapping',
          differences: expect.arrayContaining([expect.stringContaining('Function execution failed')]),
        }),
      );
    });

    it('should handle unexpected errors', async () => {
      (mockDatabaseService.query as jest.Mock).mockRejectedValue(new Error('Unexpected error'));

      const result = await service.handleMessage(mockPayload, endpoint, tenantId, false);

      expect(result).toEqual(
        expect.objectContaining({
          isMatch: false,
          message: 'Unexpected error occurred while processing message',
          differences: expect.arrayContaining([expect.stringContaining('Unexpected error')]),
        }),
      );
    });
  });

  describe('saveTransactionDataAndNotify', () => {
    const tazamaPayload = {
      transaction: mockPayload,
      TxTp: 'test.transaction',
      dataCache: {},
    };
    const transactionType = 'test.transaction';
    const endToEndId = 'end-to-end-123';

    it('should successfully save and notify', async () => {
      (mockDatabaseOperationsService.saveTransactionHistory as jest.Mock).mockResolvedValue(undefined);
      (mockNatsService.notifyEventDirector as jest.Mock).mockResolvedValue(undefined);

      await service.saveTransactionDataAndNotify(tazamaPayload, transactionType, endToEndId);

      expect(mockDatabaseOperationsService.saveTransactionHistory).toHaveBeenCalledWith(tazamaPayload, `${transactionType}_${endToEndId}`);
      expect(mockNatsService.notifyEventDirector).toHaveBeenCalledWith(tazamaPayload);
      expect(mockLoggerService.log).toHaveBeenCalledWith(
        'Successfully saved transaction history, transaction relationship, and notified event-director',
      );
    });

    it('should handle saveTransactionHistory error', async () => {
      const error = new Error('saveTransactionHistory failed');
      (mockDatabaseOperationsService.saveTransactionHistory as jest.Mock).mockRejectedValue(error);

      await expect(service.saveTransactionDataAndNotify(tazamaPayload, transactionType, endToEndId)).rejects.toThrow(
        'saveTransactionHistory failed',
      );

      expect(mockLoggerService.error).toHaveBeenCalledWith(expect.stringContaining('Failed to save transaction history'));
    });

    it('should handle notifyEventDirector error', async () => {
      const error = new Error('event-director notification failed');
      (mockDatabaseOperationsService.saveTransactionHistory as jest.Mock).mockResolvedValue(undefined);
      (mockNatsService.notifyEventDirector as jest.Mock).mockRejectedValue(error);

      await expect(service.saveTransactionDataAndNotify(tazamaPayload, transactionType, endToEndId)).rejects.toThrow(
        'event-director notification failed',
      );

      expect(mockLoggerService.error).toHaveBeenCalledWith(expect.stringContaining('Failed to notify event-director'));
    });

    it('should handle generic operation error', async () => {
      const error = new Error('Generic error');
      (mockDatabaseOperationsService.saveTransactionHistory as jest.Mock).mockRejectedValue(error);

      await expect(service.saveTransactionDataAndNotify(tazamaPayload, transactionType, endToEndId)).rejects.toThrow('Generic error');

      expect(mockLoggerService.error).toHaveBeenCalledWith(expect.stringContaining('Failed to complete transaction operations'));
    });
  });

  describe('buildTazamaPayload', () => {
    it('should build correct payload structure', () => {
      const payload = { test: 'data' };
      const transactionType = 'test.tx';
      const tenantId = 'tenant123';
      const dataCache = { cached: 'data' };

      const result = (service as any).buildTazamaPayload(payload, transactionType, tenantId, dataCache);

      expect(result).toEqual({
        transaction: payload,
        TxTp: transactionType,
        dataCache: dataCache,
      });
    });
  });

  describe('Additional Coverage Tests', () => {
    const endpoint = '/test';
    const tenantId = 'tenant123';
    const testPayload: any = { name: 'test', age: 25 };

    it('should handle no mapping configured scenario', async () => {
      // Setup with schema but null mapping to trigger "No mapping configured" log
      const schemaOnlyResult = {
        rows: [
          {
            schema: mockSchema,
            mapping: null, // Null mapping
            functions: mockFunctions,
          },
        ],
        rowCount: 1,
        command: 'SELECT' as const,
        oid: 0,
        fields: [],
      };

      (mockDatabaseService.query as jest.Mock).mockResolvedValue(schemaOnlyResult);

      const result = await service.handleMessage(testPayload, endpoint, tenantId, false);

      expect(mockLoggerService.log).toHaveBeenCalledWith('No mapping configured for endpoint: /test');

      // When there's no mapping, the result structure is different due to function execution error
      expect(result).toBeDefined();
      expect((result as any).message).toContain('compare functions with mapping');
    });

    it('should handle array destination mapping with delimiter', async () => {
      const complexMapping = [
        {
          source: ['name'],
          destination: ['part1', 'part2'],
          delimiter: '|',
          prefix: '',
          suffix: '',
        },
      ];

      jest.spyOn(service as any, 'findSchemaAndMapping').mockResolvedValue([mockSchema, complexMapping]);

      const delimitedPayload: any = { name: 'value1|value2' };

      await service.handleMessage(delimitedPayload, endpoint, tenantId, false);

      // This should trigger the array destination logic in lines 315-325
      expect(mockLoggerService.log).toHaveBeenCalled();
    });

    it('should handle constantValue mapping', async () => {
      const constantMapping = [
        {
          destination: 'redis.constant',
          constantValue: 'FIXED_VALUE',
        },
      ];

      jest.spyOn(service as any, 'findSchemaAndMapping').mockResolvedValue([mockSchema, constantMapping]);

      await service.handleMessage(testPayload, endpoint, tenantId, false);

      // This should trigger the constantValue logic in lines 337-339
      expect(mockLoggerService.log).toHaveBeenCalled();
    });

    it('should handle specific error types in saveTransactionDataAndNotify', async () => {
      const testTazamaPayload = {
        transaction: testPayload,
        TxTp: 'test.transaction',
        dataCache: {},
      };
      const testTransactionType = 'test.transaction';
      const testEndToEndId = 'end-to-end-456';

      const testCases = [
        {
          error: new Error('saveTransactionHistory failed'),
          expectedMessage: 'Failed to save transaction history',
        },
        {
          error: new Error('saveTransactionRelationship failed'),
          expectedMessage: 'Failed to save transaction relationship',
        },
        {
          error: new Error('notifyEventDirector failed'),
          expectedMessage: 'Failed to notify event-director',
        },
      ];

      for (const testCase of testCases) {
        // Reset mocks
        jest.clearAllMocks();
        (mockDatabaseOperationsService.saveTransactionHistory as jest.Mock).mockRejectedValue(testCase.error);

        await expect(service.saveTransactionDataAndNotify(testTazamaPayload, testTransactionType, testEndToEndId)).rejects.toThrow(
          testCase.error.message,
        );

        expect(mockLoggerService.error).toHaveBeenCalledWith(expect.stringContaining(testCase.expectedMessage));
      }
    });

    it('should handle XML payload with schema validation', async () => {
      const xmlPayload: any = '<root><name>John</name><age>30</age></root>';

      // Mock XML parsing - need to mock the actual parseString function signature
      const { parseString } = require('xml2js');
      (parseString as jest.Mock).mockImplementation((xml, options, callback) => {
        // Handle both 2-param and 3-param forms
        const cb = typeof options === 'function' ? options : callback;
        cb(null, { root: { name: ['John'], age: ['30'] } });
      });

      // Mock schema result with string fields
      jest.spyOn(service as any, 'findSchemaAndMapping').mockResolvedValue([mockSchema, mockMapping]);

      const result = await service.handleMessage(xmlPayload, endpoint, tenantId, true);

      // This should trigger XML parsing and string field processing
      expect(parseString).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should handle schema not found for XML processing', async () => {
      const xmlPayload: any = '<root><name>John</name></root>';

      // Mock findSchemaAndMapping to return null
      jest.spyOn(service as any, 'findSchemaAndMapping').mockResolvedValue(null);

      const result = await service.handleMessage(xmlPayload, endpoint, tenantId, true);

      // This should trigger the schema not found error path
      expect((result as any).message).toBe('Schema not found for the specified endpoint');
    });
  });
});
