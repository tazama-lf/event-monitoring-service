import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerService, RedisService } from '@tazama-lf/frms-coe-lib';
import { DatabaseService } from '../database/database.service';
import { NatsService } from '../nats/nats.service';
import { NatsMessage } from '../interfaces/iNatsMessage';
import { CacheData } from '../interfaces/iCacheData';

@Injectable()
export class ConfigNotifyService implements OnModuleInit {
  private readonly cacheTtl: number;
  private readonly consumerStream: string;

  constructor(
    private readonly logger: LoggerService,
    private readonly redis: RedisService,
    private readonly configService: ConfigService,
    private readonly databaseService: DatabaseService,
    private readonly natsService: NatsService,
  ) {
    this.cacheTtl = this.configService.get<number>('CACHE_TTL', 86400);
    this.consumerStream = this.configService.get<string>('CONSUMER_STREAM', 'dems.notify');
  }

  private readonly LOG_CONTEXT = ConfigNotifyService.name;

  async onModuleInit(): Promise<void> {
    try {
      // Register consumer without producer stream since we only consume messages
      await this.natsService.registerConsumer([this.consumerStream], this.handleNatsMessage.bind(this));

      this.logger.log(`NATS consumer registered for ${this.consumerStream}`, this.LOG_CONTEXT);

      const result = await this.databaseService.query<CacheData>(
        'SELECT endpoint_path AS "endpointPath", schema, mapping, functions, publishing_status FROM config where publishing_status = \'active\' ',
      );
      const configs = result.rows;

      for (const config of configs) {
        this.logger.log(`Preloading cache for key: ${config.endpointPath}`, this.LOG_CONTEXT);
        await this.setCache(config);
      }
      this.logger.log(`Cache preloaded: ${configs.length} configurations`, this.LOG_CONTEXT);
    } catch (error) {
      this.logger.error(`Failed to initialize ConfigNotifyService: ${String(error)}`, this.LOG_CONTEXT);
      throw error;
    }
  }

  private async handleNatsMessage(reqObj: unknown): Promise<void> {
    try {
      this.logger.log(`Received NATS message | DB record id: ${JSON.stringify(reqObj)}`, this.LOG_CONTEXT);
      if (!reqObj || typeof reqObj !== 'object') {
        this.logger.error('Invalid NATS message: must be an object', this.LOG_CONTEXT);
        return;
      }

      const partialMessage = reqObj as Partial<NatsMessage>;

      if (!partialMessage.transactionID || typeof partialMessage.transactionID !== 'string' || partialMessage.transactionID.trim() === '') {
        this.logger.error('Invalid NATS message: transactionID is required', this.LOG_CONTEXT);
        return;
      }

      // Now we know transactionID exists and is valid, safe to cast
      const message = reqObj as NatsMessage;

      const result = await this.databaseService.query<CacheData>(
        'SELECT endpoint_path AS "endpointPath", schema, mapping, functions, publishing_status FROM config WHERE id = $1',
        [message.transactionID],
      );

      const MIN_ROWS_LENGTH = 0;
      if (result.rows !== undefined && result.rows.length > MIN_ROWS_LENGTH) {
        const [config] = result.rows;
        await this.setCache(config);
        this.logger.log(
          `Updated cache for key: ${config.endpointPath} --> publishing status: ${config.publishing_status}`,
          this.LOG_CONTEXT,
        );
        this.logger.log(`Successfully processed transaction: ${message.transactionID}`, this.LOG_CONTEXT);
      } else {
        this.logger.warn(`Config not found for ID: ${message.transactionID}`, this.LOG_CONTEXT);
      }
    } catch (error) {
      this.logger.error(`Error processing message: ${String(error)}`, this.LOG_CONTEXT);
    }
  }

  public async setCache(config: CacheData): Promise<void> {
    const key = config.endpointPath;
    const data = {
      schema: config.schema,
      mapping: config.mapping,
      functions: config.functions,
      publishing_status: config.publishing_status,
    };
    await this.redis.setJson(key, JSON.stringify(data), this.cacheTtl);
  }
}
