import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { LoggerService, RedisService } from '@tazama-lf/frms-coe-lib';
import { StartupFactory } from '@tazama-lf/frms-coe-startup-lib';
import { DatabaseService } from '../database/database.service';

interface NatsMessage {
  transactionID: string;
  msgfam: string;
  msgtype: string;
  tenant_id: string;
  version: string;
}

const CACHE_TTL = 86400;

@Injectable()
export class ConfigNotifyService implements OnModuleInit, OnModuleDestroy {
  private readonly natsService = new StartupFactory();
  private isInitialized = false;

  constructor(
    private readonly logger: LoggerService,
    private readonly redis: RedisService,
    private readonly databaseService: DatabaseService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (this.isInitialized) {
      this.logger.warn('NATS service already initialized');
      return;
    }

    await this.natsService.init(
      this.handleNatsMessage.bind(this) as never,
      this.logger,
      ['config.notification'],
      'config.notification.response',
    );
    this.isInitialized = true;
    this.logger.log('NATS consumer initialized for config.notification');

    const configsResult = await this.databaseService.query('SELECT endpoint_path, schema, mapping, functions FROM config');
    const configs = configsResult.rows;

    for (const config of configs) {
      console.log('Preloading cache for config:', config.endpoint_path);
      await this.setCache(config);
    }
    this.logger.log(`Cache preloaded: ${configs.length} configurations`);
  }

  onModuleDestroy(): void {
    this.isInitialized = false;
    this.logger.log('ConfigNotifyService destroyed');
  }

  private async handleNatsMessage(reqObj: unknown, handleResponse: (response: object) => Promise<void>): Promise<void> {
    const message = reqObj as NatsMessage;
    this.logger.log(`Received NATS notification for config ID: ${message.transactionID}`);

    try {
      const configResult = await this.databaseService.query('SELECT * FROM configurations WHERE id = $1', [message.transactionID]);
      const config = configResult.rows[0];

      if (config) {
        await this.setCache(config);
        this.logger.log(`Updated cache for key: ${config.tenant_id}:${config.msg_fam}:${config.msg_type}:${config.version}`);
      } else {
        this.logger.log(`Config not found for ID: ${message.transactionID}`);
      }

      await handleResponse({
        transactionID: message.transactionID,
        status: 'ACK',
        timestamp: new Date().toISOString(),
      });
      this.logger.log(`ACK sent successfully for transaction: ${message.transactionID}`);
    } catch (error) {
      this.logger.error(`Error processing message: ${String(error)}`);
      await handleResponse({
        transactionID: message.transactionID,
        status: 'NACK',
        error: String(error),
        timestamp: new Date().toISOString(),
      });
    }
  }

  public async setCache(config: any): Promise<void> {
    const key = config.endpoint_path;
    const data = {
      schema: config.schema,
      mapping: config.mapping,
      functions: config.functions,
    };
    await this.redis.setJson(key, JSON.stringify(data), CACHE_TTL);
  }

  async getCachedConfig(tenantId: string, msgFam: string, msgType: string, version: string): Promise<object> {
    const key = `${tenantId}:${msgFam}:${msgType}:${version}`;

    const cached = await this.redis.getJson(key);
    if (cached) {
      const data = JSON.parse(cached) as object;
      return { configs: [{ key, data }] };
    }

    this.logger.log(`Cache miss for ${key} - lazy loading from database`);
    const configResult = await this.databaseService.query(
      'SELECT * FROM configurations WHERE tenant_id = $1 AND msg_fam = $2 AND msg_type = $3 AND version = $4',
      [tenantId, msgFam, msgType, version],
    );
    const config = configResult.rows[0];

    if (!config) {
      return { configs: [] };
    }

    await this.setCache(config);
    const data = {
      schema: config.schema,
      mapping: config.mapping,
      enrichment: config.enrichment,
      artifact_link: config.artifact_link,
    };
    return { configs: [{ key, data }] };
  }
}
