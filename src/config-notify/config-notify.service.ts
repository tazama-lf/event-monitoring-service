import { Injectable, Inject, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { LoggerService, RedisService } from '@tazama-lf/frms-coe-lib';
import { ConfigNotifyDto } from './dto/config-notify.dto';
import { StartupFactory, type IStartupService } from '@tazama-lf/frms-coe-startup-lib';
import { Knex } from 'knex';

interface ConfigurationData {
  configId: string;
  version: string;
  tenantId: string;
  action: string;
  timestamp: Date;
  artifactLink?: string;
  status: string;
}

interface DatabaseConfig {
  id: string;
  config_id: string;
  version: string;
  tenant_id: string;
  action?: string;
  created_at: Date;
  artifact_link?: string;
  status: string;
}

interface DatabaseConfigRef {
  config_id: string;
  id: string;
}

const REDIS_TTL_SECONDS = 86400; // 24 hours
const EMPTY_ARRAY_LENGTH = 0;

@Injectable()
export class ConfigNotifyService implements OnModuleInit, OnModuleDestroy {
  private readonly natsService: IStartupService;

  constructor(
    private readonly logger: LoggerService,
    private readonly redis: RedisService,
    @Inject('KNEX') private readonly knex: Knex,
  ) {
    this.natsService = new StartupFactory();
  }

  async onModuleInit(): Promise<void> {
    await this.initNats();
  }

  onModuleDestroy(): void {
    this.logger.log('ConfigNotifyService destroyed');
  }

  private async initNats(): Promise<void> {
    try {
      await this.natsService.init(
        this.handleNatsMessage.bind(this) as never,
        this.logger,
        ['config.notification'],
        'config.notification.response',
      );
      this.logger.log('NATS consumer initialized');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(new Error(`Failed to initialize NATS: ${errorMessage}`));
    }
  }

  private async handleNatsMessage(reqObj: unknown, handleResponse: (response: object, ...args: unknown[]) => Promise<void>): Promise<void> {
    try {
      const messageObj = reqObj as { transactionID?: string };
      const configId = messageObj.transactionID;

      if (!configId) {
        await handleResponse({ status: 'ERROR', error: 'No configId in message' });
        return;
      }

      const existsInRedis = await this.redis.getJson(configId);

      if (existsInRedis) {
        const configFromDb = await this.getConfigurationFromDb(configId);
        if (configFromDb) {
          if (configFromDb.action === 'REMOVED') {
            await this.redis.deleteKey(configId);
          } else {
            await this.redis.setJson(configId, JSON.stringify(configFromDb), REDIS_TTL_SECONDS);
          }
        }
      } else {
        const configFromDb = await this.getConfigurationFromDb(configId);
        if (configFromDb) {
          await this.redis.setJson(configId, JSON.stringify(configFromDb), REDIS_TTL_SECONDS);
        }
      }

      await handleResponse({ status: 'ACK', configId });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await handleResponse({ status: 'ERROR', error: errorMessage });
    }
  }

  private async getConfigurationFromDb(databaseId: string): Promise<ConfigurationData | null> {
    try {
      const config = (await this.knex('configurations').where('id', databaseId).first()) as DatabaseConfig | undefined;

      if (!config) {
        this.logger.warn(`Configuration with ID ${databaseId} not found in database`);
        return null;
      }

      return {
        configId: config.config_id,
        version: config.version,
        tenantId: config.tenant_id,
        action: config.action ?? 'ADDED',
        timestamp: config.created_at,
        artifactLink: config.artifact_link,
        status: config.status,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(new Error(`Failed to get configuration from database: ${errorMessage}`));
      return null;
    }
  }

  async handleNotification(dto: ConfigNotifyDto): Promise<void> {
    try {
      await this.redis.setJson(dto.configId, JSON.stringify(dto), REDIS_TTL_SECONDS);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(new Error(`Failed to cache config: ${errorMessage}`));
    }
  }

  async getCachedConfig(tenantId: string, configId: string, version: string): Promise<object> {
    try {
      let result = await this.redis.getJson(configId);
      let key = configId;

      if (!result) {
        const config = (await this.knex('configurations').where('config_id', configId).andWhere('tenant_id', tenantId).first()) as
          | DatabaseConfigRef
          | undefined;

        if (config) {
          result = await this.redis.getJson(config.id);
          key = config.id;
        }
      }

      return {
        key,
        found: !!result,
        data: result ? (JSON.parse(result) as ConfigurationData) : null,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { key: configId, found: false, error: errorMessage };
    }
  }

  async getTenantConfigs(tenantId: string): Promise<object> {
    try {
      const configs: Array<{ key: string; data: ConfigurationData }> = [];
      const allConfigs = await this.getAllConfigsFromRedis();

      for (const configData of allConfigs) {
        if (configData.tenantId === tenantId) {
          configs.push({ key: configData.configId, data: configData });
        }
      }

      return { tenantId, count: configs.length, configs };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { tenantId, error: errorMessage };
    }
  }

  private async getAllConfigsFromRedis(): Promise<ConfigurationData[]> {
    const configs: ConfigurationData[] = [];

    try {
      const dbConfigs = (await this.knex('configurations').select('config_id', 'id')) as DatabaseConfigRef[];

      for (const dbConfig of dbConfigs) {
        try {
          const data = await this.redis.getJson(dbConfig.config_id);
          if (data) {
            configs.push(JSON.parse(data) as ConfigurationData);
            continue;
          }
        } catch (error) {}

        try {
          const data = await this.redis.getJson(dbConfig.id);
          if (data) {
            configs.push(JSON.parse(data) as ConfigurationData);
          }
        } catch (error) {}
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(new Error(`Failed to retrieve configurations from Redis: ${errorMessage}`));
      return [];
    }

    return configs;
  }

  async getAllCachedConfigs(): Promise<object> {
    try {
      const allConfigs: Array<{ key: string; data: ConfigurationData }> = [];
      const configs = await this.getAllConfigsFromRedis();

      for (const config of configs) {
        allConfigs.push({
          key: config.configId || 'unknown',
          data: config,
        });
      }

      return { total: allConfigs.length, configs: allConfigs };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { error: errorMessage };
    }
  }

  async clearCache(pattern?: string): Promise<object> {
    try {
      let cleared = 0;

      const dbConfigs = (await this.knex('configurations').select('config_id', 'id')) as DatabaseConfigRef[];

      if (dbConfigs.length === EMPTY_ARRAY_LENGTH) {
        this.logger.log('No configurations found in database to clear from cache');
        return { cleared: EMPTY_ARRAY_LENGTH, pattern: pattern ?? 'all' };
      }

      for (const dbConfig of dbConfigs) {
        try {
          const exists = await this.redis.getJson(dbConfig.config_id);
          if (exists) {
            await this.redis.deleteKey(dbConfig.config_id);
            cleared++;
          }
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          this.logger.warn(`Failed to clear config key ${dbConfig.config_id}: ${errorMessage}`);
        }

        try {
          const exists = await this.redis.getJson(dbConfig.id);
          if (exists) {
            await this.redis.deleteKey(dbConfig.id);
            cleared++;
          }
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          this.logger.warn(`Failed to clear config key ${dbConfig.id}: ${errorMessage}`);
        }
      }

      this.logger.log(`Cleared ${cleared} configuration keys from Redis cache`);
      return { cleared, pattern: pattern ?? 'all' };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(new Error(`Failed to clear cache: ${errorMessage}`));
      return { error: errorMessage };
    }
  }
}
