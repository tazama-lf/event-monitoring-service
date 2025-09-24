import { Injectable, Inject, OnModuleInit } from '@nestjs/common';
import { LoggerService } from '@tazama-lf/frms-coe-lib';
import { StartupFactory, type IStartupService } from '@tazama-lf/frms-coe-startup-lib';
import { Knex } from 'knex';

export interface ConfigurationDto {
  configId: string;
  version: string;
  tenantId: string;
  action: 'ADDED';
  timestamp: string;
  artifactLink?: string;
}

interface ConfigurationResponse {
  id: string;
  configId: string;
  version: string;
  tenantId: string;
  artifactLink?: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

interface DatabaseConfigRow {
  id: string;
  config_id: string;
  version: string;
  tenant_id: string;
  artifact_link?: string;
  status: string;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class TcsSimulationService implements OnModuleInit {
  private readonly natsService: IStartupService;

  constructor(
    private readonly logger: LoggerService,
    @Inject('KNEX') private readonly knex: Knex,
  ) {
    this.natsService = new StartupFactory();
  }

  async onModuleInit(): Promise<void> {
    await this.initNatsProducer();
  }

  private async initNatsProducer(): Promise<void> {
    try {
      await this.natsService.initProducer(this.logger, 'config.notification');

      this.logger.log('NATS producer initialized', 'NATS_PRODUCER_INIT', 'nats-producer');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(new Error(`Failed to initialize NATS producer: ${errorMessage}`), 'NATS_PRODUCER_ERROR', 'tcs-nats-producer');
      throw error;
    }
  }

  async createConfiguration(dto: ConfigurationDto): Promise<{ id: string; message: string }> {
    let configurationId: string;

    try {
      const result = await this.knex('configurations')
        .insert({
          config_id: dto.configId,
          version: dto.version,
          tenant_id: dto.tenantId,
          artifact_link: dto.artifactLink,
          status: 'ACTIVE',
          created_at: this.knex.fn.now(),
          updated_at: this.knex.fn.now(),
        })
        .returning('id');

      const FIRST_RESULT_INDEX = 0;
      configurationId = (result[FIRST_RESULT_INDEX] as { id: string }).id;

      await this.publishConfigNotification(dto, configurationId);

      return {
        id: configurationId,
        message: `Configuration ${dto.configId} v${dto.version} created and notification sent`,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        new Error(`Failed to create configuration ${dto.configId}: ${errorMessage}`),
        'CONFIG_CREATE_ERROR',
        `${dto.tenantId}-${dto.configId}-${dto.version}`,
      );
      throw error;
    }
  }

  private async publishConfigNotification(dto: ConfigurationDto, configId: string): Promise<void> {
    try {
      const simpleMessage = {
        transactionID: configId,
      };

      await this.natsService.handleResponse(simpleMessage);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(new Error(`Failed to publish NATS notification: ${errorMessage}`), 'NATS_PUBLISH_ERROR', configId);
      throw error;
    }
  }

  async getConfiguration(configId: string, tenantId: string): Promise<ConfigurationResponse | null> {
    try {
      const config = (await this.knex('configurations').where('config_id', configId).andWhere('tenant_id', tenantId).first()) as
        | DatabaseConfigRow
        | undefined;

      if (!config) {
        return null;
      }

      return {
        id: config.id,
        configId: config.config_id,
        version: config.version,
        tenantId: config.tenant_id,
        artifactLink: config.artifact_link,
        status: config.status,
        createdAt: config.created_at,
        updatedAt: config.updated_at,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        new Error(`Failed to get configuration ${configId}: ${errorMessage}`),
        'CONFIG_GET_ERROR',
        `${tenantId}-${configId}`,
      );
      throw error;
    }
  }

  async getAllConfigurations(tenantId?: string): Promise<ConfigurationResponse[]> {
    try {
      let query = this.knex('configurations');

      if (tenantId) {
        query = query.where('tenant_id', tenantId);
      }

      const configs = (await query.orderBy('created_at', 'desc')) as DatabaseConfigRow[];

      return configs.map((config) => ({
        id: config.id,
        configId: config.config_id,
        version: config.version,
        tenantId: config.tenant_id,
        artifactLink: config.artifact_link,
        status: config.status,
        createdAt: config.created_at,
        updatedAt: config.updated_at,
      }));
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(new Error(`Failed to get configurations: ${errorMessage}`), 'CONFIG_LIST_ERROR', tenantId ?? 'all');
      throw error;
    }
  }
}
