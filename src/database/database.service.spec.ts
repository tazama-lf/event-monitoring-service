import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Pool, QueryResult, QueryResultRow } from 'pg';
import { DatabaseService } from './database.service';
import { LoggerService } from '@tazama-lf/frms-coe-lib';
import { DatabaseConfig } from '../interfaces/iDatabaseConfig';

const mockPool = {
  connect: jest.fn(),
  query: jest.fn(),
  end: jest.fn(),
  on: jest.fn(),
  removeListener: jest.fn(),
};

const mockClient = {
  release: jest.fn(),
  query: jest.fn(),
  on: jest.fn(),
  removeListener: jest.fn(),
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
    ssl: false,
    connectionTimeoutMillis: 30000,
    idleTimeoutMillis: 10000,
    max: 10,
    min: 2,
  };

  const createMockQueryResult = <T extends QueryResultRow>(rows: T[], rowCount?: number): QueryResult<T> => ({
    rows,
    rowCount: rowCount ?? rows.length,
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
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      verbose: jest.fn(),
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

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });
  });

  describe('onModuleInit', () => {
    it('should successfully initialize with valid database config', async () => {
      mockConfigService.get.mockReturnValue(mockDatabaseConfig);
      mockPool.connect.mockResolvedValue(mockClient);

      await service.onModuleInit();

      expect(mockConfigService.get).toHaveBeenCalledWith('database');
      expect(Pool).toHaveBeenCalledWith({
        host: mockDatabaseConfig.host,
        port: mockDatabaseConfig.port,
        user: mockDatabaseConfig.user,
        password: mockDatabaseConfig.password,
        database: mockDatabaseConfig.database,
        ssl: mockDatabaseConfig.ssl,
        connectionTimeoutMillis: mockDatabaseConfig.connectionTimeoutMillis,
        idleTimeoutMillis: mockDatabaseConfig.idleTimeoutMillis,
        max: mockDatabaseConfig.max,
        min: mockDatabaseConfig.min,
      });
      expect(mockPool.connect).toHaveBeenCalled();
      expect(mockClient.release).toHaveBeenCalled();
      expect(mockLoggerService.log).toHaveBeenCalledWith('Database connection established successfully');
    });

    it('should throw error when database config is not found', async () => {
      mockConfigService.get.mockReturnValue(undefined);

      await expect(service.onModuleInit()).rejects.toThrow('Database configuration not found in database.service');

      expect(mockConfigService.get).toHaveBeenCalledWith('database');
      expect(Pool).not.toHaveBeenCalled();
    });

    it('should throw error when database connection fails', async () => {
      const connectionError = new Error('Connection refused');
      mockConfigService.get.mockReturnValue(mockDatabaseConfig);
      mockPool.connect.mockRejectedValue(connectionError);

      await expect(service.onModuleInit()).rejects.toThrow('Connection refused');

      expect(mockLoggerService.error).toHaveBeenCalledWith('Failed to connect to database:', connectionError);
    });

    it('should handle database config with minimal options', async () => {
      const minimalConfig: DatabaseConfig = {
        host: 'localhost',
        port: 5432,
        user: 'user',
        password: 'pass',
        database: 'db',
      };
      mockConfigService.get.mockReturnValue(minimalConfig);
      mockPool.connect.mockResolvedValue(mockClient);

      await service.onModuleInit();

      expect(Pool).toHaveBeenCalledWith({
        host: 'localhost',
        port: 5432,
        user: 'user',
        password: 'pass',
        database: 'db',
        ssl: undefined,
        connectionTimeoutMillis: undefined,
        idleTimeoutMillis: undefined,
        max: undefined,
        min: undefined,
      });
    });

    it('should handle database config with SSL enabled', async () => {
      const sslConfig: DatabaseConfig = {
        ...mockDatabaseConfig,
        ssl: true,
      };
      mockConfigService.get.mockReturnValue(sslConfig);
      mockPool.connect.mockResolvedValue(mockClient);

      await service.onModuleInit();

      expect(Pool).toHaveBeenCalledWith(
        expect.objectContaining({
          ssl: true,
        }),
      );
    });

    it('should handle database config with custom connection settings', async () => {
      const customConfig: DatabaseConfig = {
        ...mockDatabaseConfig,
        connectionTimeoutMillis: 60000,
        idleTimeoutMillis: 20000,
        max: 20,
        min: 5,
      };
      mockConfigService.get.mockReturnValue(customConfig);
      mockPool.connect.mockResolvedValue(mockClient);

      await service.onModuleInit();

      expect(Pool).toHaveBeenCalledWith(
        expect.objectContaining({
          connectionTimeoutMillis: 60000,
          idleTimeoutMillis: 20000,
          max: 20,
          min: 5,
        }),
      );
    });
  });

  describe('onModuleDestroy', () => {
    beforeEach(async () => {
      mockConfigService.get.mockReturnValue(mockDatabaseConfig);
      mockPool.connect.mockResolvedValue(mockClient);
      await service.onModuleInit();
    });

    it('should close pool connection when pool exists', async () => {
      mockPool.end.mockResolvedValue(undefined);

      await service.onModuleDestroy();

      expect(mockPool.end).toHaveBeenCalled();
      expect(mockLoggerService.log).toHaveBeenCalledWith('Database connection pool closed');
    });

    it('should handle missing pool gracefully', async () => {
      (service as any).pool = null;

      await service.onModuleDestroy();

      expect(mockPool.end).not.toHaveBeenCalled();
      expect(mockLoggerService.log).not.toHaveBeenCalledWith('Database connection pool closed');
    });

    it('should handle pool.end() errors', async () => {
      const endError = new Error('Failed to close pool');
      mockPool.end.mockRejectedValue(endError);

      await expect(service.onModuleDestroy()).rejects.toThrow('Failed to close pool');
    });
  });

  describe('query', () => {
    beforeEach(async () => {
      mockConfigService.get.mockReturnValue(mockDatabaseConfig);
      mockPool.connect.mockResolvedValue(mockClient);
      await service.onModuleInit();
    });

    it('should execute query without parameters successfully', async () => {
      const mockResult = createMockQueryResult([{ id: 1, name: 'test' }]);
      mockPool.query.mockResolvedValue(mockResult);

      const result = await service.query('SELECT * FROM users');

      expect(mockPool.query).toHaveBeenCalledWith('SELECT * FROM users', undefined);
      expect(result).toEqual(mockResult);
      expect(mockLoggerService.log).toHaveBeenCalledWith('Executed query', expect.stringContaining('"text":"SELECT * FROM users"'));
      expect(mockLoggerService.log).toHaveBeenCalledWith('Executed query', expect.stringContaining('"rows":1'));
    });

    it('should execute query with parameters successfully', async () => {
      const mockResult = createMockQueryResult([{ id: 1, name: 'John' }]);
      mockPool.query.mockResolvedValue(mockResult);

      const result = await service.query('SELECT * FROM users WHERE name = $1', ['John']);

      expect(mockPool.query).toHaveBeenCalledWith('SELECT * FROM users WHERE name = $1', ['John']);
      expect(result).toEqual(mockResult);
      expect(mockLoggerService.log).toHaveBeenCalledWith(
        'Executed query',
        expect.stringContaining('"text":"SELECT * FROM users WHERE name = $1"'),
      );
      expect(mockLoggerService.log).toHaveBeenCalledWith('Executed query', expect.stringContaining('"rows":1'));
    });

    it('should handle query with no results', async () => {
      const mockResult = createMockQueryResult([]);
      mockPool.query.mockResolvedValue(mockResult);

      const result = await service.query('SELECT * FROM users WHERE id = $1', [999]);

      expect(result.rows).toEqual([]);
      expect(result.rowCount).toBe(0);
      expect(mockLoggerService.log).toHaveBeenCalledWith(
        'Executed query',
        expect.stringContaining('"text":"SELECT * FROM users WHERE id = $1"'),
      );
      expect(mockLoggerService.log).toHaveBeenCalledWith('Executed query', expect.stringContaining('"rows":0'));
    });

    it('should handle query errors and log them', async () => {
      const queryError = new Error('Syntax error in SQL query');
      mockPool.query.mockRejectedValue(queryError);

      await expect(service.query('INVALID SQL')).rejects.toThrow('Syntax error in SQL query');

      expect(mockLoggerService.error).toHaveBeenCalledWith('Query error', {
        text: 'INVALID SQL',
        duration: expect.any(Number),
        error: 'Syntax error in SQL query',
      });
    });

    it('should handle non-Error query failures', async () => {
      const queryError = 'String error message';
      mockPool.query.mockRejectedValue(queryError);

      await expect(service.query('SELECT 1')).rejects.toBe('String error message');

      expect(mockLoggerService.error).toHaveBeenCalledWith('Query error', {
        text: 'SELECT 1',
        duration: expect.any(Number),
        error: 'String error message',
      });
    });

    it('should handle complex query with multiple parameters', async () => {
      const mockResult = createMockQueryResult([
        { id: 1, name: 'John', age: 30 },
        { id: 2, name: 'Jane', age: 25 },
      ]);
      mockPool.query.mockResolvedValue(mockResult);

      const result = await service.query('SELECT * FROM users WHERE age BETWEEN $1 AND $2 ORDER BY name', [20, 35]);

      expect(mockPool.query).toHaveBeenCalledWith('SELECT * FROM users WHERE age BETWEEN $1 AND $2 ORDER BY name', [20, 35]);
      expect(result.rows).toHaveLength(2);
      expect(result.rowCount).toBe(2);
    });

    it('should handle query with typed result', async () => {
      interface User {
        id: number;
        name: string;
        email: string;
      }

      const mockResult = createMockQueryResult<User>([{ id: 1, name: 'John', email: 'john@example.com' }]);
      mockPool.query.mockResolvedValue(mockResult);

      const result = await service.query<User>('SELECT * FROM users WHERE id = $1', [1]);

      expect(result.rows[0]).toEqual({
        id: 1,
        name: 'John',
        email: 'john@example.com',
      });
    });

    it('should handle INSERT/UPDATE/DELETE operations', async () => {
      const insertResult = createMockQueryResult([], 1);
      insertResult.command = 'INSERT';
      mockPool.query.mockResolvedValue(insertResult);

      const result = await service.query('INSERT INTO users (name, email) VALUES ($1, $2)', ['John', 'john@example.com']);

      expect(result.rowCount).toBe(1);
      expect(result.command).toBe('INSERT');
    });

    it('should handle null and undefined parameters', async () => {
      const mockResult = createMockQueryResult([{ id: 1, name: 'John', description: null }]);
      mockPool.query.mockResolvedValue(mockResult);

      const result = await service.query('SELECT * FROM users WHERE description IS NULL OR name = $1', [null]);

      expect(mockPool.query).toHaveBeenCalledWith('SELECT * FROM users WHERE description IS NULL OR name = $1', [null]);
      expect(result.rows[0].description).toBeNull();
    });

    it('should track query execution time accurately', async () => {
      const mockResult = createMockQueryResult([{ id: 1 }]);
      mockPool.query.mockImplementation(() => {
        return new Promise((resolve) => {
          setTimeout(() => resolve(mockResult), 100);
        });
      });

      await service.query('SELECT 1');

      const logCall = mockLoggerService.log.mock.calls.find((call) => call[0] === 'Executed query');
      const logData = JSON.parse(logCall![1] as string);
      expect(logData.duration).toBeGreaterThanOrEqual(100);
    });

    it('should handle concurrent queries', async () => {
      const mockResult1 = createMockQueryResult([{ id: 1 }]);
      const mockResult2 = createMockQueryResult([{ id: 2 }]);
      mockPool.query.mockResolvedValueOnce(mockResult1).mockResolvedValueOnce(mockResult2);

      const [result1, result2] = await Promise.all([service.query('SELECT 1'), service.query('SELECT 2')]);

      expect(result1.rows[0].id).toBe(1);
      expect(result2.rows[0].id).toBe(2);
      expect(mockPool.query).toHaveBeenCalledTimes(2);
    });
  });

  describe('getClient', () => {
    beforeEach(async () => {
      mockConfigService.get.mockReturnValue(mockDatabaseConfig);
      mockPool.connect.mockResolvedValue(mockClient);
      await service.onModuleInit();
    });

    it('should return a client from the pool', async () => {
      mockPool.connect.mockResolvedValue(mockClient);

      const client = await service.getClient();

      expect(mockPool.connect).toHaveBeenCalled();
      expect(client).toBe(mockClient);
    });

    it('should handle client connection errors', async () => {
      const connectionError = new Error('Pool exhausted');
      mockPool.connect.mockRejectedValue(connectionError);

      await expect(service.getClient()).rejects.toThrow('Pool exhausted');
    });

    it('should return different clients on multiple calls', async () => {
      const mockClient2 = { ...mockClient };
      mockPool.connect.mockClear(); // Clear previous calls from onModuleInit
      mockPool.connect.mockResolvedValueOnce(mockClient).mockResolvedValueOnce(mockClient2 as any);

      const client1 = await service.getClient();
      const client2 = await service.getClient();

      expect(client1).toBe(mockClient);
      expect(client2).toBe(mockClient2);
      expect(mockPool.connect).toHaveBeenCalledTimes(2);
    });
  });

  describe('Integration Scenarios', () => {
    beforeEach(async () => {
      mockConfigService.get.mockReturnValue(mockDatabaseConfig);
      mockPool.connect.mockResolvedValue(mockClient);
      await service.onModuleInit();
    });

    it('should handle full module lifecycle', async () => {
      expect(mockPool.connect).toHaveBeenCalled();
      expect(mockLoggerService.log).toHaveBeenCalledWith('Database connection established successfully');

      const mockResult = createMockQueryResult([{ test: 'data' }]);
      mockPool.query.mockResolvedValue(mockResult);

      await service.query('SELECT test FROM table');
      expect(mockPool.query).toHaveBeenCalled();

      mockPool.end.mockResolvedValue(undefined);
      await service.onModuleDestroy();
      expect(mockPool.end).toHaveBeenCalled();
      expect(mockLoggerService.log).toHaveBeenCalledWith('Database connection pool closed');
    });

    it('should handle transaction workflow with client', async () => {
      mockPool.connect.mockResolvedValue(mockClient);

      const transactionClient = await service.getClient();
      expect(transactionClient).toBe(mockClient);

      transactionClient.release();
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should maintain separate pool and client operations', async () => {
      const mockResult = createMockQueryResult([{ id: 1 }]);
      mockPool.query.mockResolvedValue(mockResult);
      mockPool.connect.mockResolvedValue(mockClient);

      await service.query('SELECT 1');
      const client = await service.getClient();

      expect(mockPool.query).toHaveBeenCalledWith('SELECT 1', undefined);
      expect(mockPool.connect).toHaveBeenCalled();
      expect(client).toBe(mockClient);
    });
  });

  describe('Error Handling Edge Cases', () => {
    it('should handle initialization without calling onModuleInit', async () => {
      const uninitializedService = new DatabaseService(mockConfigService, mockLoggerService);

      // Should fail when trying to use the service without initialization
      await expect(uninitializedService.query('SELECT 1')).rejects.toThrow();
    });

    it('should handle double initialization', async () => {
      mockConfigService.get.mockReturnValue(mockDatabaseConfig);
      mockPool.connect.mockResolvedValue(mockClient);

      await service.onModuleInit();
      await service.onModuleInit();

      expect(Pool).toHaveBeenCalledTimes(2);
    });

    it('should handle destroy before initialization', async () => {
      const uninitializedService = new DatabaseService(mockConfigService, mockLoggerService);

      await expect(uninitializedService.onModuleDestroy()).resolves.toBeUndefined();
    });
  });

  describe('Configuration Variants', () => {
    it('should handle database config with all optional fields set to false/0', async () => {
      const configWithFalseValues: DatabaseConfig = {
        host: 'localhost',
        port: 5432,
        user: 'user',
        password: 'pass',
        database: 'db',
        ssl: false,
        connectionTimeoutMillis: 0,
        idleTimeoutMillis: 0,
        max: 0,
        min: 0,
      };
      mockConfigService.get.mockReturnValue(configWithFalseValues);
      mockPool.connect.mockResolvedValue(mockClient);

      await service.onModuleInit();

      expect(Pool).toHaveBeenCalledWith(configWithFalseValues);
    });

    it('should handle different database hosts and ports', async () => {
      const configs = [
        { ...mockDatabaseConfig, host: '127.0.0.1', port: 5433 },
        { ...mockDatabaseConfig, host: 'db.example.com', port: 5432 },
        { ...mockDatabaseConfig, host: 'localhost', port: 3306 },
      ];

      for (const config of configs) {
        mockConfigService.get.mockReturnValue(config);
        mockPool.connect.mockResolvedValue(mockClient);
        const newService = new DatabaseService(mockConfigService, mockLoggerService);

        await newService.onModuleInit();

        expect(Pool).toHaveBeenCalledWith(
          expect.objectContaining({
            host: config.host,
            port: config.port,
          }),
        );

        mockPool.end.mockResolvedValue(undefined);
        await newService.onModuleDestroy();
      }
    });
  });
});
