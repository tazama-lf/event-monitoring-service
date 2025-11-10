import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { QueryResult, QueryResultRow } from 'pg';
import { DatabaseService } from './database.service';
import { LoggerService } from '@tazama-lf/frms-coe-lib';
import { DatabaseConfig } from '../interfaces/iDatabaseConfig';

const mockPool = {
  connect: jest.fn(),
  query: jest.fn(),
  end: jest.fn(),
};

const mockClient = {
  release: jest.fn(),
};

jest.mock('pg', () => ({
  Pool: jest.fn().mockImplementation(() => mockPool),
}));

describe('DatabaseService', () => {
  let service: DatabaseService;
  let mockConfigService: jest.Mocked<ConfigService>;
  let mockLoggerService: jest.Mocked<LoggerService>;

  const mockDatabaseConfig: DatabaseConfig = {
    host: 'localhost',
    port: 5432,
    user: 'testuser',
    password: 'testpass',
    database: 'testdb',
  };

  const createMockQueryResult = <T extends QueryResultRow>(rows: T[]): QueryResult<T> => ({
    rows,
    rowCount: rows.length,
    command: 'SELECT',
    oid: 0,
    fields: [],
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    mockConfigService = {
      get: jest.fn(),
    } as any;

    mockLoggerService = {
      log: jest.fn(),
      error: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DatabaseService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: LoggerService, useValue: mockLoggerService },
      ],
    }).compile();

    service = module.get<DatabaseService>(DatabaseService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('onModuleInit', () => {
    it('should initialize successfully with valid config', async () => {
      mockConfigService.get.mockReturnValue(mockDatabaseConfig);
      mockPool.connect.mockResolvedValue(mockClient);

      await service.onModuleInit();

      expect(mockPool.connect).toHaveBeenCalled();
      expect(mockClient.release).toHaveBeenCalled();
      expect(mockLoggerService.log).toHaveBeenCalledWith('Database connection established successfully');
    });

    it('should throw error when config not found', async () => {
      mockConfigService.get.mockReturnValue(undefined);

      await expect(service.onModuleInit()).rejects.toThrow('Database configuration not found in database.service');
    });

    it('should throw error on connection failure', async () => {
      mockConfigService.get.mockReturnValue(mockDatabaseConfig);
      mockPool.connect.mockRejectedValue(new Error('Connection refused'));

      await expect(service.onModuleInit()).rejects.toThrow('Connection refused');
    });
  });

  describe('onModuleDestroy', () => {
    it('should close pool when it exists', async () => {
      mockConfigService.get.mockReturnValue(mockDatabaseConfig);
      mockPool.connect.mockResolvedValue(mockClient);
      await service.onModuleInit();

      mockPool.end.mockResolvedValue(undefined);
      await service.onModuleDestroy();

      expect(mockPool.end).toHaveBeenCalled();
      expect(mockLoggerService.log).toHaveBeenCalledWith('Database connection pool closed');
    });

    it('should handle missing pool', async () => {
      (service as any).pool = null;

      await service.onModuleDestroy();

      expect(mockPool.end).not.toHaveBeenCalled();
    });
  });

  describe('query', () => {
    beforeEach(async () => {
      mockConfigService.get.mockReturnValue(mockDatabaseConfig);
      mockPool.connect.mockResolvedValue(mockClient);
      await service.onModuleInit();
    });

    it('should execute query successfully', async () => {
      const mockResult = createMockQueryResult([{ id: 1 }]);
      mockPool.query.mockResolvedValue(mockResult);

      const result = await service.query('SELECT * FROM users');

      expect(mockPool.query).toHaveBeenCalledWith('SELECT * FROM users', undefined);
      expect(result).toEqual(mockResult);
    });

    it('should execute query with parameters', async () => {
      const mockResult = createMockQueryResult([{ id: 1 }]);
      mockPool.query.mockResolvedValue(mockResult);

      await service.query('SELECT * FROM users WHERE id = $1', [1]);

      expect(mockPool.query).toHaveBeenCalledWith('SELECT * FROM users WHERE id = $1', [1]);
    });

    it('should handle query errors', async () => {
      mockPool.query.mockRejectedValue(new Error('Query failed'));

      await expect(service.query('INVALID')).rejects.toThrow('Query failed');
      expect(mockLoggerService.error).toHaveBeenCalled();
    });

    it('should handle non-Error failures', async () => {
      mockPool.query.mockRejectedValue('String error');

      await expect(service.query('SELECT 1')).rejects.toBe('String error');
    });
  });

  describe('getClient', () => {
    beforeEach(async () => {
      mockConfigService.get.mockReturnValue(mockDatabaseConfig);
      mockPool.connect.mockResolvedValue(mockClient);
      await service.onModuleInit();
    });

    it('should return a client', async () => {
      mockPool.connect.mockResolvedValue(mockClient);

      const client = await service.getClient();

      expect(client).toBe(mockClient);
    });

    it('should handle connection errors', async () => {
      mockPool.connect.mockRejectedValue(new Error('Pool exhausted'));

      await expect(service.getClient()).rejects.toThrow('Pool exhausted');
    });
  });
});
