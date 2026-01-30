/**
 * Database Operations Service - Single Source of Truth Implementation
 *
 * This service has been refactored to use frms-coe-lib as the single source of truth
 * for database operations
 *
 * Architecture:
 * - Primary: Uses centralized database operations from frms-coe-lib
 */

import { Injectable, BadRequestException, InternalServerErrorException, ConflictException, OnModuleInit } from '@nestjs/common';
// Core frms-coe-lib imports for centralized database management
import {
  LoggerService,
  CreateDatabaseManager,
  type EventHistoryDB,
  type RawHistoryDB,
  type DatabaseManagerInstance,
  type ManagerConfig,
} from '@tazama-lf/frms-coe-lib';
import { DatabaseService } from '../database/database.service';
import { randomUUID } from 'node:crypto';
import { ErrorPattern } from '../interfaces/iErrorPattern';
import { QuarantineStatus } from '../enums/quarantineStatus.enum';
import { TazamaPayload } from '../interfaces/iTazamaPayload';
import { TransactionDetails, type Pain001, type Pain013, type Pacs008, type Pacs002 } from '@tazama-lf/frms-coe-lib/lib/interfaces';
import { SaveTransactionRelationshipError } from '../errors/transaction-operation.errors';

@Injectable()
export class DatabaseOperationsService implements OnModuleInit {
  /**
   * Centralized database manager from frms-coe-lib
   *
   * This manager provides consistent database operations across all services.
   *
   * Type: Intersection of DatabaseManagerInstance, EventHistoryDB, and RawHistoryDB to provide
   * management functionality, event history operations, and raw transaction history operations.
   */
  private DbManager: (DatabaseManagerInstance<ManagerConfig> & EventHistoryDB & RawHistoryDB) | null = null;

  constructor(
    private readonly loggerService: LoggerService,
    private readonly databaseService: DatabaseService,
  ) {
    // Database initialization moved to onModuleInit to properly handle async initialization
  }

  /**
   * NestJS lifecycle method - called after module initialization
   * Ensures proper async initialization of the database manager
   */
  async onModuleInit(): Promise<void> {
    await this.initDb();
  }

  /**
   * Initializes the centralized event history database manager from frms-coe-lib
   *
   * This method:
   * 1. Validates and maps environment variables to frms-coe-lib's expected configuration format
   * 2. Creates a DatabaseManager instance with event history capabilities
   * 3. Enforces explicit configuration by requiring all critical environment variables
   *
   * @throws {Error} If required environment variables are missing or invalid
   */
  private async initDb(): Promise<void> {
    try {
      // Validate required environment variables
      const host = process.env.DB_HOST;
      if (!host) {
        throw new Error('DB_HOST environment variable is required');
      }

      const portStr = process.env.DB_PORT;
      if (!portStr) {
        throw new Error('DB_PORT environment variable is required');
      }
      const port = parseInt(portStr, 10);
      if (isNaN(port) || port <= 0 || port > 65535) {
        throw new Error(`DB_PORT must be a valid port number (1-65535), received: ${portStr}`);
      }

      const databaseName = process.env.DB_NAME;
      if (!databaseName) {
        throw new Error('DB_NAME environment variable is required');
      }

      const user = process.env.DB_USER;
      if (!user) {
        throw new Error('DB_USER environment variable is required');
      }

      const password = process.env.DB_PASSWORD;
      if (!password) {
        throw new Error('DB_PASSWORD environment variable is required');
      }

      // Certificate path is optional
      const certPath = process.env.DB_CERT_PATH ?? '';

      const eventHistoryConfig: ManagerConfig = {
        eventHistory: {
          host,
          port,
          databaseName,
          user,
          password,
          certPath,
        },
        rawHistory: {
          host,
          port,
          databaseName,
          user,
          password,
          certPath,
        },
      };

      this.DbManager = (await CreateDatabaseManager(eventHistoryConfig)) as DatabaseManagerInstance<ManagerConfig> &
        EventHistoryDB &
        RawHistoryDB;
      this.loggerService.log('Database manager initialized successfully', this.log_context);
    } catch (error) {
      const errorMessage = `Failed to initialize Database manager: ${String(error)}`;
      this.loggerService.error(errorMessage, this.log_context);
      // Rethrow to ensure callers are aware of initialization failure
      throw new Error(errorMessage, { cause: error });
    }
  }

  private readonly log_context = DatabaseOperationsService.name;
  ERROR_PATTERNS: ErrorPattern[] = [
    {
      pattern: 'unique constraint',
      exception: ConflictException,
      log: 'warn',
      getMessage: (context: string, additionalInfo?: Record<string, string>) => `Duplicate ${context}: ${additionalInfo?.details ?? ''}`,
    },
    {
      pattern: 'foreign key constraint',
      exception: BadRequestException,
      log: 'error',
      getMessage: (context: string, additionalInfo?: Record<string, string>) =>
        `Invalid reference in ${context}: ${additionalInfo?.details ?? ''}`,
    },
    {
      pattern: 'invalid input syntax',
      exception: BadRequestException,
      log: 'error',
      getMessage: (context: string) => `Invalid data format in ${context}`,
    },
    {
      pattern: 'connection',
      exception: InternalServerErrorException,
      log: 'error',
      getMessage: (context: string) => `Database connection failed while ${context}`,
    },
    {
      pattern: 'disk full',
      exception: InternalServerErrorException,
      log: 'error',
      getMessage: (context: string) => `Insufficient storage space while ${context}`,
    },
    {
      pattern: 'relation',
      condition: (msg: string) => msg.includes('relation') && msg.includes('does not exist'),
      exception: BadRequestException,
      log: 'error',
      getMessage: (context: string) => `Table does not exist for ${context}`,
    },
    {
      pattern: 'duplicate key',
      exception: ConflictException,
      log: 'warn',
      getMessage: (context: string) => `Duplicate entry in ${context}`,
    },
  ];

  private handleDatabaseError(error: unknown, context: string, additionalInfo?: Record<string, any>): never {
    const errorMessage = String(error);

    for (const errorPattern of this.ERROR_PATTERNS) {
      const matches = errorPattern.condition ? errorPattern.condition(errorMessage) : errorMessage.includes(errorPattern.pattern);

      if (matches) {
        const message = errorPattern.getMessage(context, additionalInfo);
        const logMsg = `${context}: ${message} - ${errorMessage}`;
        if (errorPattern.log === 'warn') this.loggerService.warn(logMsg, this.log_context);
        else this.loggerService.error(logMsg, this.log_context);
        const ExceptionConstructor = errorPattern.exception;
        throw new ExceptionConstructor(message);
      }
    }

    this.loggerService.error(`${context}: Unexpected error - ${errorMessage}`, this.log_context);
    throw new InternalServerErrorException(`Failed to ${context}`);
  }

  /**
   * Adds an account record using single source of truth pattern
   *
   * MIGRATION: This method now uses frms-coe-lib's centralized saveAccount operation
   * as the primary implementation
   *
   * Primary Path: DbManager.saveAccount() - Centralized, consistent SQL patterns
   *
   *
   * @param accountId - Unique account identifier
   * @param tenantId - Tenant identifier for multi-tenancy
   */
  async addAccount(accountId: string, tenantId: string): Promise<void> {
    try {
      if (!this.DbManager) {
        throw new InternalServerErrorException('Database manager not initialized - database operation cannot proceed');
      }

      await this.DbManager.saveAccount(accountId, tenantId);
      this.loggerService.log(`Added account: ${accountId} for tenant: ${tenantId}`, this.log_context);
    } catch (error) {
      this.handleDatabaseError(error, 'add account', {
        details: `account ${accountId} for tenant ${tenantId}`,
      });
    }
  }

  /**
   * Saves transaction history using single source of truth pattern
   *
   * MIGRATION: This method now uses frms-coe-lib's centralized transaction history operations
   * as the primary implementation, enforcing frms-coe-lib as the single source of truth.
   *
   * @param transaction - Transaction payload containing transaction data and type
   * @param key - Transaction key for logging purposes
   */
  async saveTransactionHistory(transaction: TazamaPayload, key: string): Promise<void> {
    try {
      if (!this.DbManager) {
        throw new InternalServerErrorException('Database manager not initialized - database operation cannot proceed');
      }

      switch (transaction.TxTp) {
        case 'pain.001.001.11': {
          await this.DbManager.saveTransactionHistoryPain001(transaction.transaction as Pain001);
          break;
        }
        case 'pain.013.001.09': {
          await this.DbManager.saveTransactionHistoryPain013(transaction.transaction as Pain013);
          break;
        }
        case 'pacs.008.001.10': {
          await this.DbManager.saveTransactionHistoryPacs008(transaction.transaction as Pacs008);
          break;
        }
        case 'pacs.002.001.12': {
          await this.DbManager.saveTransactionHistoryPacs002(transaction.transaction as Pacs002);
          break;
        }
        default:
          throw new BadRequestException(`Unsupported transaction type: ${transaction.TxTp}`);
      }
      this.loggerService.log(`Saved transaction history with key: ${key}`, this.log_context);
    } catch (error) {
      this.handleDatabaseError(error, 'save transaction history', {
        details: `key ${key}, type ${transaction.TxTp}`,
      });
    }
  }

  /**
   * Adds an entity record using single source of truth pattern
   *
   * MIGRATION: This method now uses frms-coe-lib's centralized saveEntity operation
   * as the primary implementation
   *
   * @param entityId - Unique entity identifier
   * @param tenantId - Tenant identifier for multi-tenancy
   * @param CreDtTm - Creation date/time timestamp
   */
  async addEntity(entityId: string, tenantId: string, CreDtTm: string): Promise<void> {
    try {
      if (!this.DbManager) {
        throw new InternalServerErrorException('Database manager not initialized - database operation cannot proceed');
      }
      await this.DbManager.saveEntity(entityId, tenantId, CreDtTm);

      this.loggerService.log(`Added entity: ${entityId} for tenant: ${tenantId} and CreDtTm: ${CreDtTm}`, this.log_context);
    } catch (error) {
      this.handleDatabaseError(error, 'add entity', {
        details: `entity ${entityId} for tenant ${tenantId}`,
      });
    }
  }

  /**
   * Adds an account holder relationship using single source of truth pattern
   *
   * MIGRATION: This method now uses frms-coe-lib's centralized saveAccountHolder operation
   *
   * Establishes the relationship between an entity (person/organization) and an account.
   *
   * @param entityId - Entity identifier (account holder)
   * @param accountId - Account identifier being held
   * @param CreDtTm - Creation date/time timestamp
   * @param tenantId - Tenant identifier for multi-tenancy
   */
  async addAccountHolder(entityId: string, accountId: string, CreDtTm: string, tenantId: string): Promise<void> {
    try {
      if (!this.DbManager) {
        throw new InternalServerErrorException('Database manager not initialized - database operation cannot proceed');
      }

      await this.DbManager.saveAccountHolder(entityId, accountId, CreDtTm, tenantId);
      this.loggerService.log(
        `Added account holder: ${entityId} for account: ${accountId} and tenant: ${tenantId} and CreDtTm: ${CreDtTm}`,
        this.log_context,
      );
    } catch (error) {
      this.handleDatabaseError(error, 'add account holder', {
        details: `entity ${entityId} -> account ${accountId}`,
      });
    }
  }

  /**
   * Validates table/column names to prevent SQL injection
   * PostgreSQL identifiers must start with letter or underscore,
   * followed by letters, digits, or underscores
   */
  private getSafeIdentifier(name: string): string {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
      this.loggerService.error(`Invalid identifier rejected: ${name}`, this.log_context);
      throw new BadRequestException(`Invalid table or column name: ${name}`);
    }
    return name;
  }

  /**
   * Saves transaction relationship details using single source of truth pattern
   *
   * MIGRATION: This method now uses frms-coe-lib's centralized saveTransactionDetails operation
   * as the primary implementation, enforcing frms-coe-lib as the single source of truth.
   *
   * @param transactionDetails - Transaction details containing source, destination, and transaction data
   */
  async saveTransactionRelationship(transactionDetails: TransactionDetails): Promise<void> {
    this.loggerService.log(
      `Saving transaction relationship: ${transactionDetails.source} -> ${transactionDetails.destination}`,
      this.log_context,
    );
    if (!transactionDetails.source || !transactionDetails.destination) {
      this.loggerService.error(
        `Missing 1 required fields in transaction relationship: source=${transactionDetails.source}, destination=${transactionDetails.destination}`,
        this.log_context,
      );
      throw new BadRequestException('Transaction relationship must have both source and destination');
    }

    try {
      if (!this.DbManager) {
        throw new InternalServerErrorException('Database manager not initialized - database operation cannot proceed');
      }

      await this.DbManager.saveTransactionDetails(transactionDetails);
    } catch (error) {
      const relationship = `${transactionDetails.source} -> ${transactionDetails.destination}`;
      try {
        this.handleDatabaseError(error, 'save transaction relationship', {
          details: relationship,
        });
      } catch (dbError) {
        throw new SaveTransactionRelationshipError(dbError, relationship);
      }
    }
  }

  async saveToQuarantine(payload: any, endpoint: string, differences: string[], tenantId: string, correlationId?: string): Promise<void> {
    try {
      if (!this.DbManager) {
        throw new InternalServerErrorException('Database manager not initialized - database operation cannot proceed');
      }

      const quarantineRecord = {
        id: randomUUID(),
        correlation_id: correlationId ?? null,
        tenant_id: tenantId,
        endpoint_path: endpoint,
        config_id: null,
        version: null,
        error: JSON.stringify({
          code: 'VALIDATION_ERROR',
          message: 'Payload validation failed',
          differences,
          timestamp: new Date().toISOString(),
        }),
        raw_payload: JSON.stringify(payload),
        status: QuarantineStatus.FAILED,
      };

      await this.DbManager.saveToQuarantine(quarantineRecord);
      this.loggerService.log(`Saved failed record to quarantine with ID: ${quarantineRecord.id}`, this.log_context);
    } catch (error) {
      const errorMessage = String(error);
      if (errorMessage.includes('unique constraint')) {
        this.loggerService.warn(`Duplicate quarantine record with correlation ID: ${correlationId}`, this.log_context);
        return;
      }

      this.handleDatabaseError(error, 'save to quarantine', {
        details: `endpoint ${endpoint}`,
      });
    }
  }

  async addDataModelTable(tableName: string, primaryKey: string, data: any): Promise<void> {
    // Validate table name to prevent SQL injection
    const safeTableName = this.getSafeIdentifier(tableName);
    try {
      const insertIntoDynamicTable = `
      INSERT INTO ${safeTableName} (
       _key,
        data)
       VALUES ($1, $2)
      on conflict (_key) do update set data = EXCLUDED.data`;
      await this.databaseService.query(insertIntoDynamicTable, [primaryKey, data]);

      this.loggerService.log(`Inserted data into the data model table: ${safeTableName}`, this.log_context);
    } catch (error) {
      this.handleDatabaseError(error, 'add data model table', {
        details: `table ${safeTableName}`,
      });
    }
  }
}
