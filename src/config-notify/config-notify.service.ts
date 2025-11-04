import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerService, RedisService } from '@tazama-lf/frms-coe-lib';
import { DatabaseService } from '../database/database.service';
import { NatsService } from '../nats/nats.service';

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
  private readonly cacheTtl: number;
  private readonly consumerStream: string;
  private readonly producerStream: string;

  constructor(
    private readonly logger: LoggerService,
    private readonly redis: RedisService,
    private readonly configService: ConfigService,
    private readonly databaseService: DatabaseService,
    private readonly natsService: NatsService,
  ) {
    this.cacheTtl = this.configService.get<number>('CACHE_TTL', 86400);
    this.consumerStream = this.configService.get<string>('CONSUMER_STREAM', 'config.notification');
    this.producerStream = this.configService.get<string>('PRODUCER_STREAM', 'config.notification.response');
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.natsService.registerConsumer([this.consumerStream], this.producerStream, this.handleNatsMessage.bind(this));

      this.logger.log(`NATS consumer registered for ${this.consumerStream}`);

      const result = await this.databaseService.query<CacheData>(
        "SELECT endpoint_path AS \"endpointPath\", schema, mapping, functions FROM config where (status = 'STATUS_06_EXPORTED' or status = 'STATUS_08_DEPLOYED') and publishing_status = 'STATUS_101_PUBLISHED'",
      );
      const configs = result.rows;

      for (const config of configs) {
        this.logger.log('Preloading cache for config:', config.endpointPath);
        await this.setCache(config);
      }
      this.logger.log(`Cache preloaded: ${configs.length} configurations`);
    } catch (error) {
      this.logger.error(`Failed to initialize ConfigNotifyService: ${String(error)}`);
      throw error;
    }
  }

  onModuleDestroy(): void {
    this.logger.log('ConfigNotifyService destroyed');
  }

  private async handleNatsMessage(reqObj: unknown, handleResponse: (response: object) => Promise<void>): Promise<void> {
    try {
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
        transactionID: 'error-occurred',
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
