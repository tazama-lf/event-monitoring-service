import { Injectable, BadRequestException, InternalServerErrorException, ConflictException } from '@nestjs/common';
import { LoggerService } from '@tazama-lf/frms-coe-lib';
import { DatabaseService } from '../database/database.service';
import { randomUUID } from 'crypto';
import { ErrorPattern } from '../interfaces/iErrorPattern';
import { QuarantineStatus } from '../enums/quarantineStatus.enum';
import { TazamaPayload } from '../interfaces/iTazamaPayload';

@Injectable()
export class DatabaseOperationsService {
  constructor(
    private readonly loggerService: LoggerService,
    private readonly databaseService: DatabaseService,
  ) {}
  ERROR_PATTERNS: ErrorPattern[] = [
    {
      pattern: 'unique constraint',
      exception: ConflictException,
      log: 'warn',
      getMessage: (context: string, additionalInfo?: Record<string, string>) => `Duplicate ${context}: ${additionalInfo?.details || ''}`,
    },
    {
      pattern: 'foreign key constraint',
      exception: BadRequestException,
      log: 'error',
      getMessage: (context: string, additionalInfo?: Record<string, string>) =>
        `Invalid reference in ${context}: ${additionalInfo?.details || ''}`,
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
        this.loggerService[errorPattern.log](`${context}: ${message} - ${errorMessage}`);
        throw new errorPattern.exception(message);
      }
    }

    this.loggerService.error(`${context}: Unexpected error - ${errorMessage}`);
    throw new InternalServerErrorException(`Failed to ${context}`);
  }

  async addAccount(accountId: string, tenantId: string): Promise<void> {
    try {
      await this.databaseService.query('INSERT INTO account (id, tenantid) VALUES ($1, $2)', [accountId, tenantId]);
      this.loggerService.log(`Added account: ${accountId} for tenant: ${tenantId}`);
    } catch (error) {
      this.handleDatabaseError(error, 'add account', {
        details: `account ${accountId} for tenant ${tenantId}`,
      });
    }
  }

  async addEntity(entityId: string, tenantId: string, CreDtTm: string): Promise<void> {
    try {
      await this.databaseService.query('INSERT INTO entity (id, tenantid, credttm) VALUES ($1, $2, $3)', [entityId, tenantId, CreDtTm]);
      this.loggerService.log(`Added entity: ${entityId} for tenant: ${tenantId} and CreDtTm: ${CreDtTm}`);
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
      this.loggerService.log(`Added account holder: ${entityId} for account: ${accountId} and tenant: ${tenantId} and CreDtTm: ${CreDtTm}`);
    } catch (error) {
      this.handleDatabaseError(error, 'add account holder', {
        details: `entity ${entityId} -> account ${accountId}`,
      });
    }
  }

  async saveTransactionHistory(transaction: TazamaPayload, key: string): Promise<void> {
    const txtp = transaction.TxTp.replace('.', '').toLowerCase();

    try {
      await this.databaseService.query(`INSERT INTO ${txtp} (document) VALUES ($1)`, [transaction.transaction]);
      this.loggerService.log(`Saved transaction history with key: ${key}`);
    } catch (error) {
      this.handleDatabaseError(error, 'save transaction history', {
        details: `key ${key}, table ${txtp}`,
      });
    }
  }

  async saveTransactionRelationship(...relationship: string[]): Promise<void> {
    const source = relationship[0];
    const destination = relationship[1];
    const transactionObj = {
      TxTp: relationship[2],
      TenantId: relationship[3],
      MsgId: relationship[4],
      CreDtTm: relationship[5],
      EndToEndId: relationship[6],
    };

    if (!source || !destination) {
      this.loggerService.error(`Missing required fields in transaction relationship: from=${source}, to=${destination}`);
      throw new BadRequestException('Transaction relationship must have both source and destination');
    }

    try {
      await this.databaseService.query('INSERT INTO transaction (source, destination, transaction) VALUES ($1, $2, $3)', [
        source,
        destination,
        JSON.stringify(transactionObj),
      ]);
      this.loggerService.log(`Saved transaction relationship: ${source} -> ${destination}`);
    } catch (error) {
      this.handleDatabaseError(error, 'save transaction relationship', {
        details: `${relationship[0]} -> ${relationship[1]}`,
      });
    }
  }

  async saveToQuarantine(payload: any, endpoint: string, differences: string[], tenantId: string, correlationId?: string): Promise<void> {
    try {
      const quarantineRecord = {
        id: randomUUID(),
        correlation_id: correlationId || null,
        tenant_id: tenantId,
        endpoint_path: endpoint,
        config_id: null,
        version: null,
        error: JSON.stringify({
          code: 'VALIDATION_ERROR',
          message: 'Payload validation failed',
          differences: differences,
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
      this.loggerService.log(`Saved failed record to quarantine with ID: ${quarantineRecord.id}`);
    } catch (error) {
      // Special handling for quarantine - don't throw on duplicates
      const errorMessage = String(error);
      if (errorMessage.includes('unique constraint')) {
        this.loggerService.warn(`Duplicate quarantine record with correlation ID: ${correlationId}`);
        return; // Don't throw for quarantine duplicates
      }

      this.handleDatabaseError(error, 'save to quarantine', {
        details: `endpoint ${endpoint}`,
      });
    }
  }
}
