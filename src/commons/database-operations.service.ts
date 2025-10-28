import { Injectable, BadRequestException, InternalServerErrorException, ConflictException } from '@nestjs/common';
import { LoggerService } from '@tazama-lf/frms-coe-lib';
import { DatabaseService } from '../database/database.service';
import { extractTenantId } from '../utils/extract_tenant_id';

@Injectable()
export class DatabaseOperationsService {
  constructor(
    private readonly loggerService: LoggerService,
    private readonly databaseService: DatabaseService,
  ) {}

  private handleDatabaseError(error: unknown, context: string, additionalInfo?: Record<string, any>): never {
    const errorMessage = String(error);

    const errorPatterns = [
      {
        pattern: 'unique constraint',
        exception: ConflictException,
        log: 'warn' as const,
        getMessage: () => `Duplicate ${context}: ${additionalInfo?.details || ''}`,
      },
      {
        pattern: 'foreign key constraint',
        exception: BadRequestException,
        log: 'error' as const,
        getMessage: () => `Invalid reference in ${context}: ${additionalInfo?.details || ''}`,
      },
      {
        pattern: 'invalid input syntax',
        exception: BadRequestException,
        log: 'error' as const,
        getMessage: () => `Invalid data format in ${context}`,
      },
      {
        pattern: 'connection',
        exception: InternalServerErrorException,
        log: 'error' as const,
        getMessage: () => 'Database connection failed',
      },
      {
        pattern: 'disk full',
        exception: InternalServerErrorException,
        log: 'error' as const,
        getMessage: () => 'Insufficient storage space',
      },
      {
        pattern: 'relation',
        condition: (msg: string) => msg.includes('relation') && msg.includes('does not exist'),
        exception: BadRequestException,
        log: 'error' as const,
        getMessage: () => `Table does not exist for ${context}`,
      },
      {
        pattern: 'duplicate key',
        exception: ConflictException,
        log: 'warn' as const,
        getMessage: () => `Duplicate entry in ${context}`,
      },
    ];

    for (const errorPattern of errorPatterns) {
      const matches = errorPattern.condition ? errorPattern.condition(errorMessage) : errorMessage.includes(errorPattern.pattern);

      if (matches) {
        const message = errorPattern.getMessage();
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

  async saveTransactionHistory(transaction: any, key: string): Promise<void> {
    const txtp = transaction.TxTp.replace('.', '').toLowerCase();
    const destination = `${txtp}`;
    try {
      await this.databaseService.query(`INSERT INTO ${destination} (document) VALUES ($1)`, [transaction.transaction]);
      this.loggerService.log(`Saved transaction history with key: ${key}`);
    } catch (error) {
      this.handleDatabaseError(error, 'save transaction history', {
        details: `key ${key}, table ${destination}`,
      });
    }
  }

  async saveTransactionRelationship(relationship: any): Promise<void> {
    try {
      await this.databaseService.query('INSERT INTO transaction (source, destination, transaction) VALUES ($1, $2, $3)', [
        relationship.from,
        relationship.to,
        relationship,
      ]);

      this.loggerService.log(`Saved transaction relationship: ${relationship.from} -> ${relationship.to}`);
    } catch (error) {
      // Special validation before handling database error
      if (!relationship.from || !relationship.to) {
        this.loggerService.error(`Missing required fields in transaction relationship: from=${relationship.from}, to=${relationship.to}`);
        throw new BadRequestException('Transaction relationship must have both source and destination');
      }

      this.handleDatabaseError(error, 'save transaction relationship', {
        details: `${relationship.from} -> ${relationship.to}`,
      });
    }
  }

  async saveToQuarantine(payload: any, endpoint: string, differences: string[], correlationId?: string): Promise<void> {
    try {
      const tenantId = extractTenantId(endpoint);
      const quarantineRecord = {
        id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
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
        status: 'failed',
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
