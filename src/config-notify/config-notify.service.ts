import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerService, RedisService } from '@tazama-lf/frms-coe-lib';
import { DatabaseService } from '../database/database.service';
import { NatsService } from '../nats/nats.service';

interface NatsMessage {
  transactionID: string; // This will be the config.id from database
}

interface CacheData {
  endpointPath: string;
  schema: object;
  mapping: object;
  functions: object;
  publishing_status: string;
}

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

  async onModuleInit(): Promise<void> {
    try {
      // Register consumer without producer stream since we only consume messages
      await this.natsService.registerConsumer([this.consumerStream], this.handleNatsMessage.bind(this));

      this.logger.log(`NATS consumer registered for ${this.consumerStream}`, 'ConfigNotifyService onModuleInit');

      const result = await this.databaseService.query<CacheData>(
        'SELECT endpoint_path AS "endpointPath", schema, mapping, functions, publishing_status FROM config where publishing_status = \'active\' ',
      );
      const configs = result.rows;

      for (const config of configs) {
        // this.logger.log('Preloading cache for config:', config.endpointPath);
        await this.setCache(config);
      }
      this.logger.log(`Cache preloaded: ${configs.length} configurations`);
    } catch (error) {
      this.logger.error(`Failed to initialize ConfigNotifyService: ${String(error)}`);
      throw error;
    }
  }

  private async handleNatsMessage(reqObj: unknown): Promise<void> {
    try {
      console.log('received nats message:', reqObj);
      if (!reqObj || typeof reqObj !== 'object') {
        this.logger.error('Invalid NATS message: must be an object');
        return;
      }

      const partialMessage = reqObj as Partial<NatsMessage>;

      if (!partialMessage.transactionID || typeof partialMessage.transactionID !== 'string' || partialMessage.transactionID.trim() === '') {
        this.logger.error('Invalid NATS message: transactionID is required');
        return;
      }

      // Now we know transactionID exists and is valid, safe to cast
      const message = reqObj as NatsMessage;

      const result = await this.databaseService.query<CacheData>(
        'SELECT endpoint_path AS "endpointPath", schema, mapping, functions, publishing_status FROM config WHERE id = $1',
        [message.transactionID],
      );

      if (result.rows && result.rows.length > 0) {
        const config = result.rows[0];
        await this.setCache(config);
        this.logger.log(`Updated cache for key: ${config.endpointPath}`);
        this.logger.log(`Successfully processed transaction: ${message.transactionID}`);
      } else {
        this.logger.warn(`Config not found for ID: ${message.transactionID}`);
      }
    } catch (error) {
      this.logger.error(`Error processing message: ${String(error)}`);
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
