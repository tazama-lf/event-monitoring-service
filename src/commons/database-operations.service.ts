import { Injectable, Inject } from '@nestjs/common';
import { LoggerService } from '@tazama-lf/frms-coe-lib';
import { Knex } from 'knex';
import { extractTenantId } from '../utils/extract_tenant_id';

export function generateRandomString(length: number = 5): string {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

@Injectable()
export class DatabaseOperationsService {
  constructor(
    private readonly loggerService: LoggerService,
    @Inject('KNEX') private readonly knex: Knex,
  ) {}

  async addAccount(accountId: string, tenantId: string): Promise<void> {
    try {
      await this.knex('account').insert({
        id: accountId,
        tenantid: tenantId,
      });
      this.loggerService.log(`Added account: ${accountId} for tenant: ${tenantId}`);
    } catch (error) {
      this.loggerService.error(`Failed to add account: ${String(error)}`);
      throw error;
    }
  }

  async addEntity(entityId: string, tenantId: string, CreDtTm: string): Promise<void> {
    try {
      await this.knex('entity').insert({
        id: entityId,
        tenantid: tenantId,
        credttm: CreDtTm,
      });
      this.loggerService.log(`Added entity: ${entityId} for tenant: ${tenantId} and CreDtTm: ${CreDtTm}`);
    } catch (error) {
      this.loggerService.error(`Failed to add entity: ${String(error)}`);
      throw error;
    }
  }

  async addAccountHolder(entityId: string, accountId: string, CreDtTm: string, tenantId: string): Promise<void> {
    try {
      // betha hai ya nahi

      await this.knex('account_holder').insert({
        source: entityId,
        destination: accountId,
        credttm: CreDtTm,
        tenantid: tenantId,
      });
      this.loggerService.log(`Added account holder: ${entityId} for account: ${accountId} and tenant: ${tenantId} and CreDtTm: ${CreDtTm}`);
    } catch (error) {
      this.loggerService.error(`Failed to add account holder: ${String(error)}`);
      throw error;
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
      await this.knex(destination).insert({
        document: transaction.transaction,
      });
      this.loggerService.log(`Saved transaction history with key: ${key}`);
    } catch (error) {
      this.loggerService.error(`Failed to save transaction history: ${String(error)}`);
      throw error;
    }
  }

  /**
   * Saves transaction relationship to the database
   * @param relationship The transaction relationship object
   */
  async saveTransactionRelationship(relationship: any): Promise<void> {
    try {
      await this.knex('transaction').insert({
        source: relationship.from,
        destination: relationship.to,
        transaction: relationship,
      });

      this.loggerService.log(`Saved transaction relationship: ${relationship.from} -> ${relationship.to}`);
    } catch (error) {
      this.loggerService.error(`Failed to save transaction relationship: ${String(error)}`);
      throw error;
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

      await this.knex('dems_quarantine').insert(quarantineRecord);
      this.loggerService.log(`Saved failed record to quarantine with ID: ${quarantineRecord.id}`);
    } catch (error) {
      this.loggerService.error(`Failed to save to quarantine: ${String(error)}`);
      // Don't throw here to avoid masking the original validation error
    }
  }
}
