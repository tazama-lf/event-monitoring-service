import { Injectable, BadRequestException, InternalServerErrorException, ConflictException } from '@nestjs/common';
import { LoggerService } from '@tazama-lf/frms-coe-lib';
import { DatabaseService } from '../database/database.service';
import { randomUUID } from 'node:crypto';
import { ErrorPattern } from '../interfaces/iErrorPattern';
import { QuarantineStatus } from '../enums/quarantineStatus.enum';
import { TazamaPayload } from '../interfaces/iTazamaPayload';
import { TransactionDetails } from '../interfaces/iTransactionRelationship';

@Injectable()
export class DatabaseOperationsService {
  constructor(
    private readonly loggerService: LoggerService,
    private readonly databaseService: DatabaseService,
  ) {}

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

    this.loggerService.error(`${context}: Unexpected error - ${errorMessage}`);
    throw new InternalServerErrorException(`Failed to ${context}`);
  }

  async addAccount(accountId: string, tenantId: string): Promise<void> {
    try {
      const AccountQuery = 'INSERT INTO account (id, tenantid) VALUES ($1, $2)';
      await this.databaseService.query(AccountQuery, [accountId, tenantId]);
      this.loggerService.log(`Added account: ${accountId} for tenant: ${tenantId}`, this.log_context);
    } catch (error) {
      this.handleDatabaseError(error, 'add account', {
        details: `account ${accountId} for tenant ${tenantId}`,
      });
    }
  }

  async addEntity(entityId: string, tenantId: string, CreDtTm: string): Promise<void> {
    try {
      await this.databaseService.query('INSERT INTO entity (id, tenantid, credttm) VALUES ($1, $2, $3)', [entityId, tenantId, CreDtTm]);
      this.loggerService.log(`Added entity: ${entityId} for tenant: ${tenantId} and CreDtTm: ${CreDtTm}`, this.log_context);
    } catch (error) {
      this.handleDatabaseError(error, 'add entity', {
        details: `entity ${entityId} for tenant ${tenantId}`,
      });
    }
  }

  async addAccountHolder(entityId: string, accountId: string, CreDtTm: string, tenantId: string): Promise<void> {
    try {
      await this.databaseService.query('INSERT INTO account_holder (source, destination, credttm, tenantid) VALUES ($1, $2, $3, $4)', [
        entityId,
        accountId,
        CreDtTm,
        tenantId,
      ]);
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

  async saveTransactionHistory(transaction: TazamaPayload, key: string): Promise<void> {
    const txtp = transaction.TxTp.replace('.', '').toLowerCase();

    // Validate table name to prevent SQL injection
    const safeTableName = this.getSafeIdentifier(txtp);

    try {
      await this.databaseService.query(`INSERT INTO ${safeTableName} (document) VALUES ($1)`, [transaction.transaction]);
      this.loggerService.log(`Saved transaction history with key: ${key}`, this.log_context);
    } catch (error) {
      this.handleDatabaseError(error, 'save transaction history', {
        details: `key ${key}, table ${safeTableName}`,
      });
    }
  }

  async saveTransactionRelationship(transactionDetails: TransactionDetails): Promise<void> {
    this.loggerService.log(
      `Saving transaction relationship: ${transactionDetails.source} -> ${transactionDetails.destination}`,
      this.log_context,
    );
    if (!transactionDetails.source || !transactionDetails.destination) {
      this.loggerService.error(
        `Missing 1 required fields in transaction relationship: source=${transactionDetails.source}, destination=${transactionDetails.destination}`,
      );
      throw new BadRequestException('Transaction relationship must have both source and destination');
    }

    try {
      await this.databaseService.query('INSERT INTO transaction (source, destination, transaction) VALUES ($1, $2, $3)', [
        transactionDetails.source,
        transactionDetails.destination,
        JSON.stringify(transactionDetails),
      ]);
      this.loggerService.log(
        `Saved transaction relationship: ${transactionDetails.source} -> ${transactionDetails.destination}`,
        this.log_context,
      );
    } catch (error) {
      this.handleDatabaseError(error, 'save transaction relationship', {
        details: `${transactionDetails.source} -> ${transactionDetails.destination}`,
      });
    }
  }

  async saveToQuarantine(payload: any, endpoint: string, differences: string[], tenantId: string, correlationId?: string): Promise<void> {
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
          timestamp: new Date().toISOString(),
        }),
        raw_payload: JSON.stringify(payload),
        status: QuarantineStatus.FAILED,
      };

      await this.databaseService.query(
        'INSERT INTO dems_quarantine (id, correlation_id, tenant_id, endpoint_path, config_id, version, error, raw_payload, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
        [
          quarantineRecord.id,
          quarantineRecord.correlation_id,
          quarantineRecord.tenant_id,
          quarantineRecord.endpoint_path,
          quarantineRecord.config_id,
          quarantineRecord.version,
          quarantineRecord.error,
          quarantineRecord.raw_payload,
          quarantineRecord.status,
        ],
      );
      this.loggerService.log(`Saved failed record to quarantine with ID: ${quarantineRecord.id}`, this.log_context);
    } catch (error) {
      // Special handling for quarantine - don't throw on duplicates
      const errorMessage = String(error);
      if (errorMessage.includes('unique constraint')) {
        this.loggerService.warn(`Duplicate quarantine record with correlation ID: ${correlationId}`, this.log_context);
        return; // Don't throw for quarantine duplicates
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
