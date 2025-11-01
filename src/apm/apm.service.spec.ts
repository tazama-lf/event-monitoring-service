// SPDX-License-Identifier: Apache-2.0

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ApmService } from './apm.service';
import { Apm } from '@tazama-lf/frms-coe-lib/lib/services/apm';

// Mock the APM class
jest.mock('@tazama-lf/frms-coe-lib/lib/services/apm');

describe('ApmService', () => {
  let service: ApmService;
  let configService: ConfigService;
  let mockApm: jest.Mocked<Apm>;
  let mockTransaction: any;
  let mockSpan: any;

  beforeEach(async () => {
    // Create mock objects
    mockTransaction = {
      id: 'transaction-123',
      name: 'test-transaction',
      end: jest.fn(),
      setOutcome: jest.fn(),
      addLabels: jest.fn(),
    };

    mockSpan = {
      id: 'span-123',
      name: 'test-span',
      end: jest.fn(),
      setOutcome: jest.fn(),
    };

    mockApm = {
      startTransaction: jest.fn().mockReturnValue(mockTransaction),
      startSpan: jest.fn().mockReturnValue(mockSpan),
    } as any;

    // Mock the Apm constructor
    (Apm as jest.MockedClass<typeof Apm>).mockImplementation(() => mockApm);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApmService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: string, defaultValue?: string) => {
              switch (key) {
                case 'NODE_ENV':
                  return 'test';
                default:
                  return defaultValue;
              }
            }),
          },
        },
      ],
    }).compile();

    service = module.get<ApmService>(ApmService);
    configService = module.get<ConfigService>(ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('onModuleInit', () => {
    it('should initialize APM with correct configuration', () => {
      service.onModuleInit();

      expect(Apm).toHaveBeenCalledWith({
        usePathAsTransactionName: true,
        transactionIgnoreUrls: ['/health', '/metrics'],
        captureBody: 'all',
        captureHeaders: true,
        environment: 'test',
      });
    });

    it('should initialize APM with default environment when NODE_ENV is not set', () => {
      jest.spyOn(configService, 'get').mockImplementation((key: string, defaultValue?: any) => {
        if (key === 'NODE_ENV') {
          return defaultValue;
        }
        return undefined;
      });

      service.onModuleInit();

      expect(Apm).toHaveBeenCalledWith({
        usePathAsTransactionName: true,
        transactionIgnoreUrls: ['/health', '/metrics'],
        captureBody: 'all',
        captureHeaders: true,
        environment: 'development',
      });
    });

    it('should use custom environment from config', () => {
      jest.spyOn(configService, 'get').mockImplementation((key: string, defaultValue?: any) => {
        if (key === 'NODE_ENV') {
          return 'production';
        }
        return defaultValue;
      });

      service.onModuleInit();

      expect(Apm).toHaveBeenCalledWith({
        usePathAsTransactionName: true,
        transactionIgnoreUrls: ['/health', '/metrics'],
        captureBody: 'all',
        captureHeaders: true,
        environment: 'production',
      });
    });
  });

  describe('startTransaction', () => {
    beforeEach(() => {
      service.onModuleInit();
    });

    it('should start transaction with name only', () => {
      const result = service.startTransaction('test-transaction');

      expect(mockApm.startTransaction).toHaveBeenCalledWith('test-transaction', undefined);
      expect(result).toBe(mockTransaction);
    });

    it('should start transaction with name and options', () => {
      const options = { childOf: 'parent-transaction-id' };
      const result = service.startTransaction('test-transaction', options);

      expect(mockApm.startTransaction).toHaveBeenCalledWith('test-transaction', options);
      expect(result).toBe(mockTransaction);
    });

    it('should return null when APM returns null', () => {
      mockApm.startTransaction.mockReturnValue(null);

      const result = service.startTransaction('test-transaction');

      expect(result).toBeNull();
    });

    it('should handle various transaction types', () => {
      const testCases = [
        { name: 'GET /users', options: { childOf: 'parent-1' } },
        { name: 'database-query', options: { childOf: 'parent-2' } },
        { name: 'external-api-call', options: { childOf: 'parent-3' } },
      ];

      testCases.forEach(({ name, options }) => {
        service.startTransaction(name, options);
        expect(mockApm.startTransaction).toHaveBeenCalledWith(name, options);
      });
    });
  });

  describe('startSpan', () => {
    beforeEach(() => {
      service.onModuleInit();
    });

    it('should start span with name', () => {
      const result = service.startSpan('test-span');

      expect(mockApm.startSpan).toHaveBeenCalledWith('test-span');
      expect(result).toBe(mockSpan);
    });

    it('should return null when APM returns null', () => {
      mockApm.startSpan.mockReturnValue(null);

      const result = service.startSpan('test-span');

      expect(result).toBeNull();
    });

    it('should handle various span names', () => {
      const spanNames = ['database-query', 'redis-get', 'external-api-call', 'processing-step-1', 'validation'];

      spanNames.forEach((name) => {
        service.startSpan(name);
        expect(mockApm.startSpan).toHaveBeenCalledWith(name);
      });
    });
  });

  describe('integration scenarios', () => {
    beforeEach(() => {
      service.onModuleInit();
    });

    it('should support starting multiple transactions', () => {
      const transaction1 = service.startTransaction('transaction-1');
      const transaction2 = service.startTransaction('transaction-2');

      expect(mockApm.startTransaction).toHaveBeenCalledTimes(2);
      expect(transaction1).toBe(mockTransaction);
      expect(transaction2).toBe(mockTransaction);
    });

    it('should support starting multiple spans', () => {
      const span1 = service.startSpan('span-1');
      const span2 = service.startSpan('span-2');

      expect(mockApm.startSpan).toHaveBeenCalledTimes(2);
      expect(span1).toBe(mockSpan);
      expect(span2).toBe(mockSpan);
    });

    it('should work when APM is disabled (returns null)', () => {
      mockApm.startTransaction.mockReturnValue(null);
      mockApm.startSpan.mockReturnValue(null);

      const transaction = service.startTransaction('test');
      const span = service.startSpan('test');

      expect(transaction).toBeNull();
      expect(span).toBeNull();
    });
  });
});
