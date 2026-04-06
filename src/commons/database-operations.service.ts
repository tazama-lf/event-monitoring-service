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
  type TrackedFields,
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
      // Validate required environment variables for main database
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

      const dynamicHistoryHost = process.env.DYNAMIC_HISTORY_DB_HOST;
      if (!dynamicHistoryHost) {
        throw new Error('DYNAMIC_HISTORY_DB_HOST environment variable is required');
      }

      const dynamicHistoryPortStr = process.env.DYNAMIC_HISTORY_DB_PORT;
      if (!dynamicHistoryPortStr) {
        throw new Error('DYNAMIC_HISTORY_DB_PORT environment variable is required');
      }

      const dynamicHistoryPort = parseInt(dynamicHistoryPortStr, 10);
      if (isNaN(dynamicHistoryPort) || dynamicHistoryPort <= 0 || dynamicHistoryPort > 65535) {
        throw new Error(`DYNAMIC_HISTORY_DB_PORT must be a valid port number (1-65535), received: ${dynamicHistoryPortStr}`);
      }

      const dynamicHistoryDbName = process.env.DYNAMIC_HISTORY_DB_NAME;
      if (!dynamicHistoryDbName) {
        throw new Error('DYNAMIC_HISTORY_DB_NAME environment variable is required');
      }

      const dynamicHistoryUser = process.env.DYNAMIC_HISTORY_DB_USER;
      if (!dynamicHistoryUser) {
        throw new Error('DYNAMIC_HISTORY_DB_USER environment variable is required');
      }

      const dynamicHistoryPassword = process.env.DYNAMIC_HISTORY_DB_PASSWORD;
      if (!dynamicHistoryPassword) {
        throw new Error('DYNAMIC_HISTORY_DB_PASSWORD environment variable is required');
      }

      const certPath = process.env.DB_CERT_PATH ?? '';

      const eventHistoryHost = process.env.EVENT_HISTORY_DB_HOST;
      if (!eventHistoryHost) {
        throw new Error('EVENT_HISTORY_DB_HOST environment variable is required');
      }

      const eventHistoryPortStr = process.env.EVENT_HISTORY_DB_PORT;
      if (!eventHistoryPortStr) {
        throw new Error('EVENT_HISTORY_DB_PORT environment variable is required');
      }
      const eventHistoryPort = parseInt(eventHistoryPortStr, 10);
      if (isNaN(eventHistoryPort) || eventHistoryPort <= 0 || eventHistoryPort > 65535) {
        throw new Error(`EVENT_HISTORY_DB_PORT must be a valid port number (1-65535), received: ${eventHistoryPortStr}`);
      }

      const eventHistoryDbName = process.env.EVENT_HISTORY_DB_NAME;
      if (!eventHistoryDbName) {
        throw new Error('EVENT_HISTORY_DB_NAME environment variable is required');
      }

      const eventHistoryUser = process.env.EVENT_HISTORY_DB_USER;
      if (!eventHistoryUser) {
        throw new Error('EVENT_HISTORY_DB_USER environment variable is required');
      }

      const eventHistoryPassword = process.env.EVENT_HISTORY_DB_PASSWORD;
      if (!eventHistoryPassword) {
        throw new Error('EVENT_HISTORY_DB_PASSWORD environment variable is required');
      }

      this.loggerService.log(
        `Initializing database manager with separate dynamic history database: ${dynamicHistoryDbName} on ${dynamicHistoryHost}:${dynamicHistoryPort}`,
        this.log_context,
      );

      const eventHistoryConfig: ManagerConfig = {
        configuration: {
          host,
          port,
          databaseName,
          user,
          password,
          certPath,
        },
        rawHistory: {
          host: dynamicHistoryHost,
          port: dynamicHistoryPort,
          databaseName: dynamicHistoryDbName,
          user: dynamicHistoryUser,
          password: dynamicHistoryPassword,
          certPath: process.env.DYNAMIC_HISTORY_DB_CERT_PATH ?? certPath,
        },
        eventHistory: {
          host: eventHistoryHost,
          port: eventHistoryPort,
          databaseName: eventHistoryDbName,
          user: eventHistoryUser,
          password: eventHistoryPassword,
          certPath: process.env.EVENT_HISTORY_DB_CERT_PATH ?? certPath,
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
   * @param creDtTm - Creation date and time
   */
  async addAccount(accountId: string, tenantId: string, creDtTm: string): Promise<void> {
    // need to add one more param here for creation date time
    try {
      if (!this.DbManager) {
        throw new InternalServerErrorException('Database manager not initialized - database operation cannot proceed');
      }

      await this.DbManager.saveAccount(accountId, tenantId, creDtTm);
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
   * @param trackedFields - Optional tracked fields from mapping processing
   */
  async saveTransactionHistory(transaction: TazamaPayload, key: string, transactionType: string, trackedFields?: TrackedFields): Promise<void> {
    this.loggerService.log(
      `Saving transaction history with key: ${key} and tracked fields: ${JSON.stringify(trackedFields)}`,
      this.log_context,
    );

    try {
      if (!this.DbManager) {
        throw new InternalServerErrorException('Database manager not initialized - database operation cannot proceed');
      }

      switch (transactionType) {
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
        default: {
          await this.DbManager.saveDynamicTransactionHistory(transactionType, transaction.transaction, trackedFields); // need to discuss type issue
        }
      }
      this.loggerService.log(`Saved transaction history with key: ${key}`, this.log_context);
    } catch (error) {
      this.handleDatabaseError(error, 'save transaction history', {
        details: `key ${key}, type ${transactionType}`,
      });
    }
  }

  async getPacs008ByEndToEndId(endToEndId: string, tenantId: string): Promise<Pacs008 | undefined> {
    try {
      if (!this.DbManager) {
        throw new InternalServerErrorException('Database manager not initialized - database operation cannot proceed');
      }
      return await this.DbManager.getTransactionPacs008(endToEndId, tenantId);
    } catch (error) {
      this.handleDatabaseError(error, 'fetch pacs.008 by EndToEndId', {
        details: `EndToEndId ${endToEndId} for tenant ${tenantId}`,
      });
    }
  }

  async getTransaction(endToEndId: string, tenantId: string, tableName: string): Promise<Record<string, unknown> | undefined> {
    try {
      if (!this.DbManager) {
        throw new InternalServerErrorException('Database manager not initialized - database operation cannot proceed');
      }
      return await this.DbManager.getTransactionAny(endToEndId, tenantId, tableName);
    } catch (error) {
      this.handleDatabaseError(error, 'fetch transaction by EndToEndId', {
        details: `EndToEndId ${endToEndId} for tenant ${tenantId} from table ${tableName}`,
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

  async saveToQuarantine(
    payload: any,
    endpoint: string,
    differences: string[],
    tenantId: string,
    creDtTm: string,
    correlationId?: string,
  ): Promise<void> {
    try {
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
          timestamp: creDtTm,
        }),
        raw_payload: JSON.stringify(payload),
        status: QuarantineStatus.FAILED,
      };

      if (!this.DbManager) {
        throw new InternalServerErrorException('Database manager not initialized - database operation cannot proceed');
      }

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

  async addDataModelTable(tableName: string, primaryKey: string, data: any, tenantId: string, creDtTm: string): Promise<void> {
    // Validate table name to prevent SQL injection
    const safeTableName = this.getSafeIdentifier(tableName);
    try {
      if (!this.DbManager) {
        throw new InternalServerErrorException('Database manager not initialized - database operation cannot proceed');
      }
      await this.DbManager.saveInDataModelTable(safeTableName, primaryKey, data, tenantId, creDtTm);

      this.loggerService.log(`Inserted data into the data model table: ${safeTableName}`, this.log_context);
    } catch (error) {
      this.handleDatabaseError(error, 'add data model table', {
        details: `table ${safeTableName}`,
      });
    }
  }
}
