import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerService, RedisService } from '@tazama-lf/frms-coe-lib';
import { StartupFactory } from '@tazama-lf/frms-coe-startup-lib';
import { DatabaseService } from '../database/database.service';

const NATS_SUBJECTS = {
  CONFIG_NOTIFICATION: 'config.notification',
  CONFIG_NOTIFICATION_RESPONSE: 'config.notification.response',
} as const;

enum Status {
  ACK = 'ACK',
  NACK = 'NACK',
}

interface NatsMessage {
  transactionId: string; // This will be the config.id from database
}

interface CacheData {
  endpointPath: string;
  schema: object;
  mapping: object;
  functions: object;
}

@Injectable()
export class ConfigNotifyService implements OnModuleInit, OnModuleDestroy {
  private readonly natsService = new StartupFactory();
  private isInitialized = false;
  private readonly cacheTtl: number;

  constructor(
    private readonly logger: LoggerService,
    private readonly redis: RedisService,
    private readonly configService: ConfigService,
    private readonly databaseService: DatabaseService,
  ) {
    this.cacheTtl = this.configService.get<number>('CACHE_TTL', 86400);
  }

  async onModuleInit(): Promise<void> {
    if (this.isInitialized) {
      this.logger.warn('NATS service already initialized');
      return;
    }

    try {
      await this.natsService.init(
        this.handleNatsMessage.bind(this) as never,
        this.logger,
        [NATS_SUBJECTS.CONFIG_NOTIFICATION],
        NATS_SUBJECTS.CONFIG_NOTIFICATION_RESPONSE,
      );
      this.isInitialized = true;
      this.logger.log('NATS consumer initialized for config.notification');

      const result = await this.databaseService.query('SELECT endpoint_path as "endpointPath", schema, mapping, functions FROM config');
      const configs = result.rows as CacheData[];

      for (const config of configs) {
        this.logger.log('Preloading cache for config:', config.endpointPath);
        await this.setCache(config);
      }
      this.logger.log(`Cache preloaded: ${configs.length} configurations`);
    } catch (error) {
      this.logger.error(`Failed to initialize ConfigNotifyService: ${String(error)}`);
      this.isInitialized = false;
      throw error;
    }
  }

  onModuleDestroy(): void {
    this.isInitialized = false;
    this.logger.log('ConfigNotifyService destroyed');
  }

  private async handleNatsMessage(reqObj: unknown, handleResponse: (response: object) => Promise<void>): Promise<void> {
    const message = reqObj as NatsMessage;
    this.logger.log(`Received NATS notification for config ID: ${message.transactionId}`);

    try {
      const result = await this.databaseService.query(
        'SELECT endpoint_path as "endpointPath", schema, mapping, functions FROM config WHERE id = $1',
        [message.transactionId],
      );
      const config = result.rows[0] as CacheData | undefined;

      if (config) {
        await this.setCache(config);
        this.logger.log(`Updated cache for key: ${config.endpointPath}`);
      } else {
        this.logger.warn(`Config not found for ID: ${message.transactionId}`);
      }

      await handleResponse({
        transactionId: message.transactionId,
        status: Status.ACK,
        timestamp: new Date().toISOString(),
      });
      this.logger.log(`ACK sent successfully for transaction: ${message.transactionId}`);
    } catch (error) {
      this.logger.error(`Error processing message: ${String(error)}`);
      await handleResponse({
        transactionId: message.transactionId,
        status: Status.NACK,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      });
    }
  }

  public async setCache(config: CacheData): Promise<void> {
    const key = config.endpointPath;
    const data = {
      schema: config.schema,
      mapping: config.mapping,
      functions: config.functions,
    };
    await this.redis.setJson(key, JSON.stringify(data), this.cacheTtl);
  }
}
