// SPDX-License-Identifier: Apache-2.0

import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { DatabaseConfig } from '../interfaces/iDatabaseConfig';
import { LoggerService } from '@tazama-lf/frms-coe-lib';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private pool!: Pool;

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
  ) {}

  private readonly LOG_CONTEXT = DatabaseService.name;

  async onModuleInit(): Promise<void> {
    const dbConfig = this.configService.get<DatabaseConfig>('database');

    if (!dbConfig) {
      throw new Error('Database configuration not found in database.service');
    }

    this.pool = new Pool({
      host: dbConfig.host,
      port: dbConfig.port,
      user: dbConfig.user,
      password: dbConfig.password,
      database: dbConfig.database,
      ssl: dbConfig.ssl,
      connectionTimeoutMillis: dbConfig.connectionTimeoutMillis,
      idleTimeoutMillis: dbConfig.idleTimeoutMillis,
      max: dbConfig.max,
      min: dbConfig.min,
    });

    // Test the connection
    try {
      const client = await this.pool.connect();
      client.release();
      this.logger.log('Database connection established successfully', this.LOG_CONTEXT);
    } catch (error) {
      this.logger.error('Failed to connect to database:', error, this.LOG_CONTEXT);
      throw error;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.logger.log('Database connection pool closed', this.LOG_CONTEXT);
    }
  }

  /**
   * Execute a query with parameters
   * @param text SQL query text
   * @param params Query parameters
   * @returns Query result
   */
  async query<T extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]): Promise<QueryResult<T>> {
    const start = Date.now();
    try {
      const result = await this.pool.query<T>(text, params);
      const duration = Date.now() - start;
      this.logger.log('Executed query', JSON.stringify({ query: text, duration, returnedRows: result.rowCount }), this.LOG_CONTEXT);
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      this.logger.error(
        'Query error',
        {
          text,
          duration,
          error: error instanceof Error ? error.message : String(error),
        },
        this.LOG_CONTEXT,
      );
      throw error;
    }
  }

  /**
   * Get a client from the pool for transactions
   * @returns Database client
   */
  async getClient(): Promise<PoolClient> {
    return await this.pool.connect();
  }
}
