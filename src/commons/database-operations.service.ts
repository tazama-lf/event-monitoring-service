import { Injectable, Inject } from '@nestjs/common';
import { LoggerService } from '@tazama-lf/frms-coe-lib';
import { Knex } from 'knex';

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
}
