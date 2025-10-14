import { Injectable, Inject } from '@nestjs/common';
import { LoggerService } from '@tazama-lf/frms-coe-lib';
import { Knex } from 'knex';

@Injectable()
export class DatabaseOperationsService {
  constructor(
    private readonly loggerService: LoggerService,
    @Inject('KNEX') private readonly knex: Knex,
  ) {}

  async addAccount(accountId: string, tenantId: string): Promise<void> {
    try {
      // await this.knex('accounts').insert({
      //   accountId,
      //   tenantId,
      //   created: new Date().toISOString(),
      // });
      this.loggerService.log(`Added account: ${accountId} for tenant: ${tenantId}`);
    } catch (error) {
      this.loggerService.error(`Failed to add account: ${String(error)}`);
      throw error;
    }
  }

  async addEntity(entityId: string, tenantId: string, CreDtTm: string): Promise<void> {
    try {
      // await this.knex('entities').insert({
      //   entityId,
      //   tenantId,
      //   CreDtTm,
      //   created: new Date().toISOString(),
      // });
      this.loggerService.log(`Added entity: ${entityId} for tenant: ${tenantId} and CreDtTm: ${CreDtTm}`);
    } catch (error) {
      this.loggerService.error(`Failed to add entity: ${String(error)}`);
      throw error;
    }
  }

  async addAccountHolder(entityId: string, accountId: string, CreDtTm: string, tenantId: string): Promise<void> {
    try {
      // await this.knex('accountholders').insert({
      //   entityId,
      //   accountId,
      //   CreDtTm,
      //   tenantId,
      //   created: new Date().toISOString(),
      // });
      this.loggerService.log(`Added account holder: ${entityId} for account: ${accountId} and tenant: ${tenantId} and CreDtTm: ${CreDtTm}`);
    } catch (error) {
      this.loggerService.error(`Failed to add account holder: ${String(error)}`);
      throw error;
    }
  }
}
