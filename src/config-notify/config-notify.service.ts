import { Injectable, OnModuleInit, OnModuleDestroy, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerService, RedisService } from '@tazama-lf/frms-coe-lib';
import { StartupFactory } from '@tazama-lf/frms-coe-startup-lib';
import { DatabaseService } from '../database/database.service';

enum Status {
  ACK = 'ACK',
  NACK = 'NACK',
}

interface NatsMessage {
  transactionID: string; // This will be the config.id from database
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
  private readonly consumerStream: string;
  private readonly producerStream: string;

  constructor(
    private readonly logger: LoggerService,
    private readonly redis: RedisService,
    private readonly configService: ConfigService,
    private readonly databaseService: DatabaseService,
  ) {
    this.cacheTtl = this.configService.get<number>('CACHE_TTL', 86400);
    this.consumerStream = this.configService.get<string>('CONSUMER_STREAM', 'config.notification');
    this.producerStream = this.configService.get<string>('PRODUCER_STREAM', 'config.notification.response');
  }

  async onModuleInit(): Promise<void> {
    if (this.isInitialized) {
      this.logger.warn('NATS service already initialized');
      return;
    }

    try {
      await this.natsService.init(this.handleNatsMessage.bind(this), this.logger, [this.consumerStream], this.producerStream);
      this.isInitialized = true;
      this.logger.log(`NATS consumer initialized for ${this.consumerStream}`);

      const result = await this.databaseService.query<CacheData>(
        'SELECT endpoint_path AS "endpointPath", schema, mapping, functions FROM config',
      );
      const configs = result.rows;

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
    if (!reqObj || typeof reqObj !== 'object') {
      this.logger.error('Invalid NATS message: must be an object');
      throw new BadRequestException('Invalid NATS message: must be an object');
    }

    const partialMessage = reqObj as Partial<NatsMessage>;

    if (!partialMessage.transactionID || typeof partialMessage.transactionID !== 'string' || partialMessage.transactionID.trim() === '') {
      this.logger.error('Invalid NATS message: transactionID is required and must be a non-empty string');
      throw new BadRequestException('Invalid NATS message: transactionID is required and must be a non-empty string');
    }

    const message = reqObj as NatsMessage;
    this.logger.log(`Received NATS notification for config ID: ${message.transactionID}`);

    try {
      const result = await this.databaseService.query<CacheData>(
        'SELECT endpoint_path AS "endpointPath", schema, mapping, functions FROM config WHERE id = $1',
        [message.transactionID],
      );

      if (result.rows && result.rows.length > 0) {
        const config = result.rows[0];
        await this.setCache(config);
        this.logger.log(`Updated cache for key: ${config.endpointPath}`);

        await handleResponse({
          transactionID: message.transactionID,
          status: Status.ACK,
          timestamp: new Date().toISOString(),
        });
        this.logger.log(`ACK sent successfully for transaction: ${message.transactionID}`);
      } else {
        this.logger.warn(`Config not found for ID: ${message.transactionID}`);

        await handleResponse({
          transactionID: message.transactionID,
          status: Status.NACK,
          error: `Configuration not found for ID: ${message.transactionID}`,
          timestamp: new Date().toISOString(),
        });
        this.logger.log(`NACK sent for transaction: ${message.transactionID} - Config not found`);
      }
    } catch (error) {
      this.logger.error(`Error processing message: ${String(error)}`);
      await handleResponse({
        transactionID: message.transactionID,
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
