import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, InternalServerErrorException, ConflictException } from '@nestjs/common';
import { LoggerService } from '@tazama-lf/frms-coe-lib';
import { DatabaseOperationsService } from './database-operations.service';
import { DatabaseService } from '../database/database.service';
import { QuarantineStatus } from '../enums/quarantineStatus.enum';
import { TazamaPayload } from '../interfaces/iTazamaPayload';

jest.mock('crypto', () => ({
  randomUUID: jest.fn().mockReturnValue('mock-uuid-123'),
}));

describe('DatabaseOperationsService', () => {
  let service: DatabaseOperationsService;
  let mockLoggerService: jest.Mocked<LoggerService>;
  let mockDatabaseService: jest.Mocked<DatabaseService>;

  const mockTazamaPayload: TazamaPayload = {
    transaction: { id: 'tx-123', amount: 100 },
    TxTp: 'test.transaction',
    dataCache: { test: 'data' },
  };

  beforeEach(async () => {
    mockLoggerService = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      verbose: jest.fn(),
    } as any;

    mockDatabaseService = {
      query: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DatabaseOperationsService,
        { provide: LoggerService, useValue: mockLoggerService },
        { provide: DatabaseService, useValue: mockDatabaseService },
      ],
    }).compile();

    service = module.get<DatabaseOperationsService>(DatabaseOperationsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should have error patterns defined', () => {
      expect(service.ERROR_PATTERNS).toBeDefined();
      expect(service.ERROR_PATTERNS.length).toBeGreaterThan(0);
    });
  });

  describe('Error Pattern Handling', () => {
    it('should have all required error patterns', () => {
      const patterns = service.ERROR_PATTERNS.map((p) => p.pattern);
      expect(patterns).toContain('unique constraint');
      expect(patterns).toContain('foreign key constraint');
      expect(patterns).toContain('invalid input syntax');
      expect(patterns).toContain('connection');
      expect(patterns).toContain('disk full');
      expect(patterns).toContain('relation');
      expect(patterns).toContain('duplicate key');
    });

    it('should handle unique constraint errors correctly', () => {
      const errorPattern = service.ERROR_PATTERNS.find((p) => p.pattern === 'unique constraint');
      expect(errorPattern?.exception).toBe(ConflictException);
      expect(errorPattern?.log).toBe('warn');
      expect(errorPattern?.getMessage('test context', { details: 'test details' })).toBe('Duplicate test context: test details');
    });

    it('should handle foreign key constraint errors correctly', () => {
      const errorPattern = service.ERROR_PATTERNS.find((p) => p.pattern === 'foreign key constraint');
      expect(errorPattern?.exception).toBe(BadRequestException);
      expect(errorPattern?.log).toBe('error');
      expect(errorPattern?.getMessage('test context', { details: 'test details' })).toBe('Invalid reference in test context: test details');
    });

    it('should handle relation does not exist errors with condition', () => {
      const errorPattern = service.ERROR_PATTERNS.find((p) => p.pattern === 'relation');
      const condition = errorPattern?.condition;
      expect(condition?.('relation "table_name" does not exist')).toBe(true);
      expect(condition?.('some other relation error')).toBe(false);
    });
  });

  describe('handleDatabaseError', () => {
    it('should throw ConflictException for unique constraint errors', () => {
      const error = new Error('unique constraint violation');

      expect(() => (service as any).handleDatabaseError(error, 'test operation')).toThrow(ConflictException);
      expect(mockLoggerService.warn).toHaveBeenCalledWith(expect.stringContaining('test operation: Duplicate test operation'));
    });

    it('should throw BadRequestException for foreign key constraint errors', () => {
      const error = new Error('foreign key constraint violation');

      expect(() => (service as any).handleDatabaseError(error, 'test operation')).toThrow(BadRequestException);
      expect(mockLoggerService.error).toHaveBeenCalledWith(expect.stringContaining('test operation: Invalid reference in test operation'));
    });

    it('should throw BadRequestException for invalid input syntax', () => {
      const error = new Error('invalid input syntax for type uuid');

      expect(() => (service as any).handleDatabaseError(error, 'test operation')).toThrow(BadRequestException);
      expect(mockLoggerService.error).toHaveBeenCalledWith(
        expect.stringContaining('test operation: Invalid data format in test operation'),
      );
    });

    it('should throw InternalServerErrorException for connection errors', () => {
      const error = new Error('connection timeout');

      expect(() => (service as any).handleDatabaseError(error, 'test operation')).toThrow(InternalServerErrorException);
      expect(mockLoggerService.error).toHaveBeenCalledWith(
        expect.stringContaining('test operation: Database connection failed while test operation'),
      );
    });

    it('should throw InternalServerErrorException for disk full errors', () => {
      const error = new Error('disk full error');

      expect(() => (service as any).handleDatabaseError(error, 'test operation')).toThrow(InternalServerErrorException);
      expect(mockLoggerService.error).toHaveBeenCalledWith(
        expect.stringContaining('test operation: Insufficient storage space while test operation'),
      );
    });

    it('should throw BadRequestException for relation does not exist errors', () => {
      const error = new Error('relation "test_table" does not exist');

      expect(() => (service as any).handleDatabaseError(error, 'test operation')).toThrow(BadRequestException);
      expect(mockLoggerService.error).toHaveBeenCalledWith(
        expect.stringContaining('test operation: Table does not exist for test operation'),
      );
    });

    it('should throw ConflictException for duplicate key errors', () => {
      const error = new Error('duplicate key value violates unique constraint');

      expect(() => (service as any).handleDatabaseError(error, 'test operation')).toThrow(ConflictException);
      expect(mockLoggerService.warn).toHaveBeenCalledWith(expect.stringContaining('test operation: Duplicate test operation:'));
    });

    it('should throw InternalServerErrorException for unknown errors', () => {
      const error = new Error('some unknown database error');

      expect(() => (service as any).handleDatabaseError(error, 'test operation')).toThrow(InternalServerErrorException);
      expect(mockLoggerService.error).toHaveBeenCalledWith('test operation: Unexpected error - Error: some unknown database error');
    });

    it('should include additional info in error messages when provided', () => {
      const error = new Error('unique constraint violation');
      const additionalInfo = { details: 'specific constraint violation details' };

      expect(() => (service as any).handleDatabaseError(error, 'test operation', additionalInfo)).toThrow(ConflictException);
      expect(mockLoggerService.warn).toHaveBeenCalledWith(
        expect.stringContaining('Duplicate test operation: specific constraint violation details'),
      );
    });

    it('should handle non-Error objects as error input', () => {
      const error = 'string error message';

      expect(() => (service as any).handleDatabaseError(error, 'test operation')).toThrow(InternalServerErrorException);
      expect(mockLoggerService.error).toHaveBeenCalledWith('test operation: Unexpected error - string error message');
    });
  });

  describe('addAccount', () => {
    it('should successfully add account', async () => {
      mockDatabaseService.query.mockResolvedValue({} as any);

      await service.addAccount('account-123', 'tenant-456');

      expect(mockDatabaseService.query).toHaveBeenCalledWith('INSERT INTO account (id, tenantid) VALUES ($1, $2)', [
        'account-123',
        'tenant-456',
      ]);
      expect(mockLoggerService.log).toHaveBeenCalledWith('Added account: account-123 for tenant: tenant-456');
    });

    it('should handle database errors with proper context', async () => {
      const error = new Error('unique constraint violation');
      mockDatabaseService.query.mockRejectedValue(error);

      await expect(service.addAccount('account-123', 'tenant-456')).rejects.toThrow(ConflictException);
      expect(mockLoggerService.warn).toHaveBeenCalledWith(
        expect.stringContaining('add account: Duplicate add account: account account-123 for tenant tenant-456'),
      );
    });

    it('should handle empty or null parameters', async () => {
      mockDatabaseService.query.mockResolvedValue({} as any);

      await service.addAccount('', '');
      expect(mockDatabaseService.query).toHaveBeenCalledWith('INSERT INTO account (id, tenantid) VALUES ($1, $2)', ['', '']);
    });
  });

  describe('addEntity', () => {
    it('should successfully add entity', async () => {
      mockDatabaseService.query.mockResolvedValue({} as any);

      await service.addEntity('entity-123', 'tenant-456', '2024-01-01T00:00:00Z');

      expect(mockDatabaseService.query).toHaveBeenCalledWith('INSERT INTO entity (id, tenantid, credttm) VALUES ($1, $2, $3)', [
        'entity-123',
        'tenant-456',
        '2024-01-01T00:00:00Z',
      ]);
      expect(mockLoggerService.log).toHaveBeenCalledWith(
        'Added entity: entity-123 for tenant: tenant-456 and CreDtTm: 2024-01-01T00:00:00Z',
      );
    });

    it('should handle database errors with proper context', async () => {
      const error = new Error('foreign key constraint violation');
      mockDatabaseService.query.mockRejectedValue(error);

      await expect(service.addEntity('entity-123', 'tenant-456', '2024-01-01T00:00:00Z')).rejects.toThrow(BadRequestException);
      expect(mockLoggerService.error).toHaveBeenCalledWith(
        expect.stringContaining('add entity: Invalid reference in add entity: entity entity-123 for tenant tenant-456'),
      );
    });

    it('should handle various date formats', async () => {
      mockDatabaseService.query.mockResolvedValue({} as any);
      const dates = ['2024-01-01T00:00:00Z', '2024-12-31T23:59:59.999Z', '2024-06-15T12:30:45.123Z'];

      for (const date of dates) {
        await service.addEntity('entity-123', 'tenant-456', date);
        expect(mockDatabaseService.query).toHaveBeenCalledWith('INSERT INTO entity (id, tenantid, credttm) VALUES ($1, $2, $3)', [
          'entity-123',
          'tenant-456',
          date,
        ]);
      }
    });
  });

  describe('addAccountHolder', () => {
    it('should successfully add account holder', async () => {
      mockDatabaseService.query.mockResolvedValue({} as any);

      await service.addAccountHolder('entity-123', 'account-456', '2024-01-01T00:00:00Z', 'tenant-789');

      expect(mockDatabaseService.query).toHaveBeenCalledWith(
        'INSERT INTO account_holder (source, destination, credttm, tenantid) VALUES ($1, $2, $3, $4)',
        ['entity-123', 'account-456', '2024-01-01T00:00:00Z', 'tenant-789'],
      );
      expect(mockLoggerService.log).toHaveBeenCalledWith(
        'Added account holder: entity-123 for account: account-456 and tenant: tenant-789 and CreDtTm: 2024-01-01T00:00:00Z',
      );
    });

    it('should handle database errors with proper context', async () => {
      const error = new Error('duplicate key value violates unique constraint');
      mockDatabaseService.query.mockRejectedValue(error);

      await expect(service.addAccountHolder('entity-123', 'account-456', '2024-01-01T00:00:00Z', 'tenant-789')).rejects.toThrow(
        ConflictException,
      );
      expect(mockLoggerService.warn).toHaveBeenCalledWith(expect.stringContaining('add account holder: Duplicate add account holder:'));
    });

    it('should handle relationship between entity and account', async () => {
      mockDatabaseService.query.mockResolvedValue({} as any);

      await service.addAccountHolder('entity-abc', 'account-xyz', '2024-01-01T00:00:00Z', 'tenant-123');

      expect(mockDatabaseService.query).toHaveBeenCalledWith(
        'INSERT INTO account_holder (source, destination, credttm, tenantid) VALUES ($1, $2, $3, $4)',
        ['entity-abc', 'account-xyz', '2024-01-01T00:00:00Z', 'tenant-123'],
      );
    });
  });

  describe('saveTransactionHistory', () => {
    beforeEach(() => {
      jest.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should successfully save transaction history', async () => {
      mockDatabaseService.query.mockResolvedValue({} as any);

      await service.saveTransactionHistory(mockTazamaPayload, 'transaction-key-123');

      expect(console.log).toHaveBeenCalledWith('Saving transaction history to table: testtransaction');
      expect(mockDatabaseService.query).toHaveBeenCalledWith('INSERT INTO testtransaction (document) VALUES ($1)', [
        mockTazamaPayload.transaction,
      ]);
      expect(mockLoggerService.log).toHaveBeenCalledWith('Saved transaction history with key: transaction-key-123');
    });

    it('should handle different transaction types and table names', async () => {
      mockDatabaseService.query.mockResolvedValue({} as any);
      const testCases = [
        { TxTp: 'payment.credit', expectedTable: 'paymentcredit' },
        { TxTp: 'transfer.domestic', expectedTable: 'transferdomestic' },
        { TxTp: 'withdrawal.atm', expectedTable: 'withdrawalatm' },
        { TxTp: 'deposit.cash', expectedTable: 'depositcash' },
      ];

      for (const testCase of testCases) {
        const payload = { ...mockTazamaPayload, TxTp: testCase.TxTp };
        await service.saveTransactionHistory(payload, 'test-key');

        expect(console.log).toHaveBeenCalledWith(`Saving transaction history to table: ${testCase.expectedTable}`);
        expect(mockDatabaseService.query).toHaveBeenCalledWith(`INSERT INTO ${testCase.expectedTable} (document) VALUES ($1)`, [
          payload.transaction,
        ]);
      }
    });

    it('should handle database errors with proper context', async () => {
      const error = new Error('relation "testtransaction" does not exist');
      mockDatabaseService.query.mockRejectedValue(error);

      await expect(service.saveTransactionHistory(mockTazamaPayload, 'transaction-key-123')).rejects.toThrow(BadRequestException);
      expect(mockLoggerService.error).toHaveBeenCalledWith(
        expect.stringContaining('save transaction history: Table does not exist for save transaction history'),
      );
    });

    it('should handle complex transaction documents', async () => {
      mockDatabaseService.query.mockResolvedValue({} as any);
      const complexPayload: TazamaPayload = {
        transaction: {
          id: 'tx-123',
          amount: 1000.5,
          currency: 'USD',
          parties: {
            debtor: { name: 'John Doe', account: '123456' },
            creditor: { name: 'Jane Smith', account: '789012' },
          },
          metadata: { channel: 'web', ip: '192.168.1.1' },
        },
        TxTp: 'complex.transaction',
        dataCache: { processed: true },
      };

      await service.saveTransactionHistory(complexPayload, 'complex-key');

      expect(mockDatabaseService.query).toHaveBeenCalledWith('INSERT INTO complextransaction (document) VALUES ($1)', [
        complexPayload.transaction,
      ]);
    });
  });

  describe('saveTransactionRelationship', () => {
    beforeEach(() => {
      jest.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should successfully save transaction relationship', async () => {
      mockDatabaseService.query.mockResolvedValue({} as any);
      const relationship = [
        'source-123',
        'destination-456',
        'test.transaction',
        'tenant-789',
        'msg-abc',
        '2024-01-01T00:00:00Z',
        'end-to-end-xyz',
      ];

      await service.saveTransactionRelationship(...relationship);

      expect(console.log).toHaveBeenCalledWith('Saving transaction relationship:', relationship);
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Source: source-123, Destination: destination-456'));
      expect(mockDatabaseService.query).toHaveBeenCalledWith(
        'INSERT INTO transaction (source, destination, transaction) VALUES ($1, $2, $3)',
        [
          'source-123',
          'destination-456',
          JSON.stringify({
            TxTp: 'test.transaction',
            TenantId: 'tenant-789',
            MsgId: 'msg-abc',
            CreDtTm: '2024-01-01T00:00:00Z',
            EndToEndId: 'end-to-end-xyz',
          }),
        ],
      );
      expect(console.log).toHaveBeenCalledWith('Saved transaction relationship successfully.');
      expect(mockLoggerService.log).toHaveBeenCalledWith('Saved transaction relationship: source-123 -> destination-456');
    });

    it('should throw BadRequestException when source is missing', async () => {
      const relationship = ['', 'destination-456', 'test.transaction', 'tenant-789', 'msg-abc', '2024-01-01T00:00:00Z', 'end-to-end-xyz'];

      await expect(service.saveTransactionRelationship(...relationship)).rejects.toThrow(BadRequestException);
      expect(mockLoggerService.error).toHaveBeenCalledWith(
        'Missing required fields in transaction relationship: from=, to=destination-456',
      );
    });

    it('should throw BadRequestException when destination is missing', async () => {
      const relationship = ['source-123', '', 'test.transaction', 'tenant-789', 'msg-abc', '2024-01-01T00:00:00Z', 'end-to-end-xyz'];

      await expect(service.saveTransactionRelationship(...relationship)).rejects.toThrow(BadRequestException);
      expect(mockLoggerService.error).toHaveBeenCalledWith('Missing required fields in transaction relationship: from=source-123, to=');
    });

    it('should handle database errors with proper context', async () => {
      const error = new Error('connection timeout');
      mockDatabaseService.query.mockRejectedValue(error);
      const relationship = [
        'source-123',
        'destination-456',
        'test.transaction',
        'tenant-789',
        'msg-abc',
        '2024-01-01T00:00:00Z',
        'end-to-end-xyz',
      ];

      await expect(service.saveTransactionRelationship(...relationship)).rejects.toThrow(InternalServerErrorException);
      expect(console.log).toHaveBeenCalledWith('Error saving transaction relationship:', error);
      expect(mockLoggerService.error).toHaveBeenCalledWith(
        expect.stringContaining('save transaction relationship: Database connection failed while save transaction relationship'),
      );
    });

    it('should handle partial relationship data', async () => {
      mockDatabaseService.query.mockResolvedValue({} as any);
      const relationship = ['source-123', 'destination-456'];

      await service.saveTransactionRelationship(...relationship);

      expect(mockDatabaseService.query).toHaveBeenCalledWith(
        'INSERT INTO transaction (source, destination, transaction) VALUES ($1, $2, $3)',
        [
          'source-123',
          'destination-456',
          JSON.stringify({
            TxTp: undefined,
            TenantId: undefined,
            MsgId: undefined,
            CreDtTm: undefined,
            EndToEndId: undefined,
          }),
        ],
      );
    });
  });

  describe('saveToQuarantine', () => {
    const mockPayload = { test: 'data', amount: 100 };
    const endpoint = '/test/endpoint';
    const differences = ['Field is required', 'Invalid format'];
    const tenantId = 'tenant-123';

    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2024-01-01T12:00:00.000Z'));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should successfully save to quarantine', async () => {
      mockDatabaseService.query.mockResolvedValue({} as any);

      await service.saveToQuarantine(mockPayload, endpoint, differences, tenantId);

      expect(mockDatabaseService.query).toHaveBeenCalledWith(
        'INSERT INTO dems_quarantine (id, correlation_id, tenant_id, endpoint_path, config_id, version, error, raw_payload, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
        [
          'mock-uuid-123',
          null,
          tenantId,
          endpoint,
          null,
          null,
          JSON.stringify({
            code: 'VALIDATION_ERROR',
            message: 'Payload validation failed',
            differences: differences,
            timestamp: '2024-01-01T12:00:00.000Z',
          }),
          JSON.stringify(mockPayload),
          QuarantineStatus.FAILED,
        ],
      );
      expect(mockLoggerService.log).toHaveBeenCalledWith('Saved failed record to quarantine with ID: mock-uuid-123');
    });

    it('should save to quarantine with correlation ID', async () => {
      mockDatabaseService.query.mockResolvedValue({} as any);
      const correlationId = 'correlation-456';

      await service.saveToQuarantine(mockPayload, endpoint, differences, tenantId, correlationId);

      expect(mockDatabaseService.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([
          'mock-uuid-123',
          correlationId,
          tenantId,
          endpoint,
          null,
          null,
          expect.any(String),
          expect.any(String),
          QuarantineStatus.FAILED,
        ]),
      );
    });

    it('should handle unique constraint violations gracefully', async () => {
      const error = new Error('unique constraint violation');
      mockDatabaseService.query.mockRejectedValue(error);
      const correlationId = 'correlation-456';

      await service.saveToQuarantine(mockPayload, endpoint, differences, tenantId, correlationId);

      expect(mockLoggerService.warn).toHaveBeenCalledWith('Duplicate quarantine record with correlation ID: correlation-456');
    });

    it('should handle other database errors normally', async () => {
      const error = new Error('connection timeout');
      mockDatabaseService.query.mockRejectedValue(error);

      await expect(service.saveToQuarantine(mockPayload, endpoint, differences, tenantId)).rejects.toThrow(InternalServerErrorException);
      expect(mockLoggerService.error).toHaveBeenCalledWith(
        expect.stringContaining('save to quarantine: Database connection failed while save to quarantine'),
      );
    });

    it('should handle complex payloads', async () => {
      mockDatabaseService.query.mockResolvedValue({} as any);
      const complexPayload = {
        nested: {
          object: {
            with: ['array', 'values'],
            numbers: 123.45,
            boolean: true,
            nullValue: null,
          },
        },
      };

      await service.saveToQuarantine(complexPayload, endpoint, differences, tenantId);

      expect(mockDatabaseService.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([
          expect.any(String),
          null,
          tenantId,
          endpoint,
          null,
          null,
          expect.any(String),
          JSON.stringify(complexPayload),
          QuarantineStatus.FAILED,
        ]),
      );
    });

    it('should handle empty differences array', async () => {
      mockDatabaseService.query.mockResolvedValue({} as any);

      await service.saveToQuarantine(mockPayload, endpoint, [], tenantId);

      const call = mockDatabaseService.query.mock.calls[0];
      const errorJsonString = call?.[1]?.[6] as string;
      const errorJson = JSON.parse(errorJsonString);
      expect(errorJson.differences).toEqual([]);
    });

    it('should handle different endpoint paths', async () => {
      mockDatabaseService.query.mockResolvedValue({} as any);
      const endpoints = ['/api/v1/payments', '/transfers/domestic', '/complex/nested/endpoint/path', ''];

      for (const endpointPath of endpoints) {
        await service.saveToQuarantine(mockPayload, endpointPath, differences, tenantId);
        expect(mockDatabaseService.query).toHaveBeenCalledWith(
          expect.any(String),
          expect.arrayContaining([
            expect.any(String),
            null,
            tenantId,
            endpointPath,
            null,
            null,
            expect.any(String),
            expect.any(String),
            QuarantineStatus.FAILED,
          ]),
        );
      }
    });
  });

  describe('Integration Tests', () => {
    it('should handle multiple operations in sequence', async () => {
      mockDatabaseService.query.mockResolvedValue({} as any);

      await service.addAccount('account-1', 'tenant-1');
      await service.addEntity('entity-1', 'tenant-1', '2024-01-01T00:00:00Z');
      await service.addAccountHolder('entity-1', 'account-1', '2024-01-01T00:00:00Z', 'tenant-1');

      expect(mockDatabaseService.query).toHaveBeenCalledTimes(3);
      expect(mockLoggerService.log).toHaveBeenCalledTimes(3);
    });

    it('should handle mixed success and failure scenarios', async () => {
      mockDatabaseService.query
        .mockResolvedValueOnce({} as any)
        .mockRejectedValueOnce(new Error('unique constraint violation'))
        .mockResolvedValueOnce({} as any);

      await service.addAccount('account-1', 'tenant-1');
      await expect(service.addEntity('entity-1', 'tenant-1', '2024-01-01T00:00:00Z')).rejects.toThrow(ConflictException);
      await service.addAccountHolder('entity-1', 'account-1', '2024-01-01T00:00:00Z', 'tenant-1');

      expect(mockLoggerService.log).toHaveBeenCalledTimes(2);
      expect(mockLoggerService.warn).toHaveBeenCalledTimes(1);
    });
  });

  describe('Edge Cases', () => {
    it('should handle null and undefined values appropriately', async () => {
      mockDatabaseService.query.mockResolvedValue({} as any);

      await service.addAccount(null as any, undefined as any);
      expect(mockDatabaseService.query).toHaveBeenCalledWith('INSERT INTO account (id, tenantid) VALUES ($1, $2)', [null, undefined]);
    });

    it('should handle very long strings', async () => {
      mockDatabaseService.query.mockResolvedValue({} as any);
      const longString = 'a'.repeat(1000);

      await service.addAccount(longString, 'tenant-1');
      expect(mockDatabaseService.query).toHaveBeenCalledWith('INSERT INTO account (id, tenantid) VALUES ($1, $2)', [
        longString,
        'tenant-1',
      ]);
    });

    it('should handle special characters in data', async () => {
      mockDatabaseService.query.mockResolvedValue({} as any);
      const specialChars = '!@#$%^&*()_+-=[]{}|;\':",./<>?';

      await service.addAccount(specialChars, 'tenant-1');
      expect(mockDatabaseService.query).toHaveBeenCalledWith('INSERT INTO account (id, tenantid) VALUES ($1, $2)', [
        specialChars,
        'tenant-1',
      ]);
    });
  });
});
