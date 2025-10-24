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

  async addAccount(accountId: string, tenantId: string): Promise<void> {
    try {
      await this.databaseService.query('INSERT INTO account (id, tenantid) VALUES ($1, $2)', [accountId, tenantId]);
      this.loggerService.log(`Added account: ${accountId} for tenant: ${tenantId}`);
    } catch (error) {
      const errorMessage = String(error);

      if (error instanceof Error && errorMessage.includes('unique constraint')) {
        this.loggerService.warn(`Duplicate account creation attempt: ${accountId} for tenant: ${tenantId}`);
        throw new ConflictException(`Account ${accountId} already exists for tenant ${tenantId}`);
      }

      if (error instanceof Error && errorMessage.includes('foreign key constraint')) {
        this.loggerService.error(`Invalid tenant reference: ${tenantId} for account: ${accountId}`);
        throw new BadRequestException(`Invalid tenant ID: ${tenantId}`);
      }

      if (error instanceof Error && errorMessage.includes('connection')) {
        this.loggerService.error(`Database connection error while adding account: ${accountId}`);
        throw new InternalServerErrorException('Database connection failed');
      }

      this.loggerService.error(`Failed to add account due to: ${errorMessage}`);
      throw new InternalServerErrorException(`Failed to add account: ${accountId}`);
    }
  }

  async addEntity(entityId: string, tenantId: string, CreDtTm: string): Promise<void> {
    try {
      await this.databaseService.query('INSERT INTO entity (id, tenantid, credttm) VALUES ($1, $2, $3)', [entityId, tenantId, CreDtTm]);
      this.loggerService.log(`Added entity: ${entityId} for tenant: ${tenantId} and CreDtTm: ${CreDtTm}`);
    } catch (error) {
      const errorMessage = String(error);

      if (error instanceof Error && errorMessage.includes('unique constraint')) {
        this.loggerService.warn(`Duplicate entity creation attempt: ${entityId} for tenant: ${tenantId}`);
        throw new ConflictException(`Entity ${entityId} already exists for tenant ${tenantId}`);
      }

      if (error instanceof Error && errorMessage.includes('foreign key constraint')) {
        this.loggerService.error(`Invalid tenant reference: ${tenantId} for entity: ${entityId}`);
        throw new BadRequestException(`Invalid tenant ID: ${tenantId}`);
      }

      if (error instanceof Error && errorMessage.includes('invalid input syntax')) {
        this.loggerService.error(`Invalid date format for CreDtTm: ${CreDtTm} in entity: ${entityId}`);
        throw new BadRequestException(`Invalid date format: ${CreDtTm}`);
      }

      if (error instanceof Error && errorMessage.includes('connection')) {
        this.loggerService.error(`Database connection error while adding entity: ${entityId}`);
        throw new InternalServerErrorException('Database connection failed');
      }

      this.loggerService.error(`Failed to add entity: ${errorMessage}`);
      throw new InternalServerErrorException(`Failed to add entity: ${entityId}`);
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
      const errorMessage = String(error);

      if (error instanceof Error && errorMessage.includes('unique constraint')) {
        this.loggerService.warn(`Duplicate account holder relationship: entity ${entityId} -> account ${accountId}`);
        throw new ConflictException(`Account holder relationship already exists between entity ${entityId} and account ${accountId}`);
      }

      if (error instanceof Error && errorMessage.includes('foreign key constraint')) {
        if (errorMessage.includes('source')) {
          this.loggerService.error(`Invalid entity reference: ${entityId} for account holder relationship`);
          throw new BadRequestException(`Entity ${entityId} does not exist`);
        }
        if (errorMessage.includes('destination')) {
          this.loggerService.error(`Invalid account reference: ${accountId} for account holder relationship`);
          throw new BadRequestException(`Account ${accountId} does not exist`);
        }
        this.loggerService.error(`Invalid tenant reference: ${tenantId} for account holder relationship`);
        throw new BadRequestException(`Invalid tenant ID: ${tenantId}`);
      }

      if (error instanceof Error && errorMessage.includes('invalid input syntax')) {
        this.loggerService.error(`Invalid date format for CreDtTm: ${CreDtTm} in account holder relationship`);
        throw new BadRequestException(`Invalid date format: ${CreDtTm}`);
      }

      if (error instanceof Error && errorMessage.includes('connection')) {
        this.loggerService.error('Database connection error while adding account holder relationship');
        throw new InternalServerErrorException('Database connection failed');
      }

      this.loggerService.error(`Failed to add account holder: ${errorMessage}`);
      throw new InternalServerErrorException(
        `Failed to add account holder relationship between entity ${entityId} and account ${accountId}`,
      );
    }
  }

  /**
   * Saves transaction history to the database
   * @param transaction The transaction object
   * @param key The key to use for the transaction
   */
  async saveTransactionHistory(transaction: any, key: string): Promise<void> {
    const txtp = transaction.TxTp.replace('.', '').toLowerCase();
    const destination = `${txtp}`;
    try {
      await this.databaseService.query(`INSERT INTO ${destination} (document) VALUES ($1)`, [transaction.transaction]);
      this.loggerService.log(`Saved transaction history with key: ${key}`);
    } catch (error) {
      const errorMessage = String(error);

      if (error instanceof Error && errorMessage.includes('relation') && errorMessage.includes('does not exist')) {
        this.loggerService.error(`Transaction table does not exist: ${destination} for transaction type: ${transaction.TxTp}`);
        throw new BadRequestException(`Unsupported transaction type: ${transaction.TxTp}`);
      }

      if (error instanceof Error && errorMessage.includes('duplicate key')) {
        this.loggerService.warn(`Duplicate transaction history with key: ${key}`);
        throw new ConflictException(`Transaction with key ${key} already exists`);
      }

      if (error instanceof Error && errorMessage.includes('invalid input syntax')) {
        this.loggerService.error(`Invalid transaction document format for key: ${key}`);
        throw new BadRequestException('Invalid transaction document format');
      }

      if (error instanceof Error && errorMessage.includes('connection')) {
        this.loggerService.error(`Database connection error while saving transaction history with key: ${key}`);
        throw new InternalServerErrorException('Database connection failed');
      }

      if (error instanceof Error && errorMessage.includes('disk full')) {
        this.loggerService.error(`Insufficient storage space while saving transaction history with key: ${key}`);
        throw new InternalServerErrorException('Insufficient storage space');
      }

      this.loggerService.error(`Failed to save transaction history: ${errorMessage}`);
      throw new InternalServerErrorException(`Failed to save transaction history with key: ${key}`);
    }
  }

  /**
   * Saves transaction relationship to the database
   * @param relationship The transaction relationship object
   */
  async saveTransactionRelationship(relationship: any): Promise<void> {
    try {
      await this.databaseService.query('INSERT INTO transaction (source, destination, transaction) VALUES ($1, $2, $3)', [
        relationship.from,
        relationship.to,
        relationship,
      ]);

      this.loggerService.log(`Saved transaction relationship: ${relationship.from} -> ${relationship.to}`);
    } catch (error) {
      const errorMessage = String(error);

      if (error instanceof Error && errorMessage.includes('unique constraint')) {
        this.loggerService.warn(`Duplicate transaction relationship: ${relationship.from} -> ${relationship.to}`);
        throw new ConflictException(`Transaction relationship already exists: ${relationship.from} -> ${relationship.to}`);
      }

      if (error instanceof Error && errorMessage.includes('foreign key constraint')) {
        this.loggerService.error(`Invalid reference in transaction relationship: ${relationship.from} -> ${relationship.to}`);
        throw new BadRequestException('Invalid transaction relationship references');
      }

      if (error instanceof Error && errorMessage.includes('invalid input syntax')) {
        this.loggerService.error('Invalid transaction relationship data format');
        throw new BadRequestException('Invalid transaction relationship data format');
      }

      if (error instanceof Error && errorMessage.includes('connection')) {
        this.loggerService.error('Database connection error while saving transaction relationship');
        throw new InternalServerErrorException('Database connection failed');
      }

      if (!relationship.from || !relationship.to) {
        this.loggerService.error(`Missing required fields in transaction relationship: from=${relationship.from}, to=${relationship.to}`);
        throw new BadRequestException('Transaction relationship must have both source and destination');
      }

      this.loggerService.error(`Failed to save transaction relationship: ${errorMessage}`);
      throw new InternalServerErrorException(`Failed to save transaction relationship: ${relationship.from} -> ${relationship.to}`);
    }
  }

  /**
   * Saves failed transaction to quarantine table
   * @param payload The original payload that failed
   * @param endpoint The endpoint path
   * @param differences The AJV validation errors
   * @param correlationId Optional correlation ID for tracking
   */
  async saveToQuarantine(payload: any, endpoint: string, differences: string[], correlationId?: string): Promise<void> {
    try {
      const tenantId = extractTenantId(endpoint);
      const quarantineRecord = {
        id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, // Simple ID generation
        correlation_id: correlationId || null,
        tenant_id: tenantId,
        endpoint_path: endpoint,
        config_id: null, // Add if you have config versioning
        version: null, // Add if you have schema versioning
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
      const errorMessage = String(error);

      if (error instanceof Error && errorMessage.includes('unique constraint')) {
        this.loggerService.warn(`Duplicate quarantine record with correlation ID: ${correlationId}`);
        // Don't throw for quarantine duplicates, just log
      } else if (error instanceof Error && errorMessage.includes('foreign key constraint')) {
        this.loggerService.error(`Invalid tenant reference in quarantine: ${extractTenantId(endpoint)}`);
      } else if (error instanceof Error && errorMessage.includes('connection')) {
        this.loggerService.error(`Database connection error while saving to quarantine for endpoint: ${endpoint}`);
      } else if (error instanceof Error && errorMessage.includes('disk full')) {
        this.loggerService.error(`Insufficient storage space while saving to quarantine for endpoint: ${endpoint}`);
      } else {
        this.loggerService.error(`Failed to save to quarantine: ${errorMessage}`);
      }
    }
  }
}
