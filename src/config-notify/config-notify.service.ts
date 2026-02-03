import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerService, RedisService } from '@tazama-lf/frms-coe-lib';
import { DatabaseService } from '../database/database.service';
import { NatsService } from '../nats/nats.service';
import { NatsMessage } from '../interfaces/iNatsMessage';
import { CacheData } from '../interfaces/iCacheData';

@Injectable()
export class ConfigNotifyService implements OnModuleInit {
  private static readonly DEFAULT_CACHE_TTL = 3600;
  private readonly cacheTtl: number;
  private readonly consumerStream: string;

  constructor(
    private readonly loggerService: LoggerService,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
    private readonly databaseService: DatabaseService,
    private readonly natsService: NatsService,
  ) {
    this.cacheTtl = this.configService.get<number>('cache.timeToLive', ConfigNotifyService.DEFAULT_CACHE_TTL);
    this.consumerStream = this.configService.get<string>('nats.consumerStream', 'dems.notify');
  }

  private readonly LOG_CONTEXT = ConfigNotifyService.name;

  async onModuleInit(): Promise<void> {
    try {
      // Register consumer without producer stream since we only consume messages
      await this.natsService.registerConsumer([this.consumerStream], this.handleNatsMessage.bind(this));

      this.loggerService.log(`NATS consumer registered for ${this.consumerStream}`, this.LOG_CONTEXT);

      const result = await this.databaseService.query<CacheData>(
        'SELECT endpoint_path AS "endpointPath", schema, mapping, functions, publishing_status FROM config where publishing_status = \'active\' ',
      );
      const configs = result.rows;

      const promises: Array<Promise<void>> = [];
      for (const config of configs) {
        this.loggerService.log(`Preloading cache for key: ${config.endpointPath}`, this.LOG_CONTEXT);
        promises.push(this.setCache(config));
      }
      await Promise.all(promises);
      this.loggerService.log(`Cache preloaded: ${configs.length} configurations`, this.LOG_CONTEXT);
    } catch (error) {
      this.loggerService.error(`Failed to initialize ConfigNotifyService: ${String(error)}`, this.LOG_CONTEXT);
      throw error;
    }
  }

  private async handleNatsMessage(reqObj: unknown): Promise<void> {
    try {
      const message = ConfigNotifyService.normalizeNatsMessage(reqObj);
      if (!message) {
        this.loggerService.error('Invalid NATS message: expected JSON with non-empty transactionID', this.LOG_CONTEXT);
        return;
      }
      this.loggerService.log(`Received NATS message for config id: ${message.transactionID}`, this.LOG_CONTEXT);

      const result = await this.databaseService.query<CacheData>(
        'SELECT endpoint_path AS "endpointPath", schema, mapping, functions, publishing_status FROM config WHERE id = $1',
        [message.transactionID],
      );

      if (result.rows.length) {
        const [config] = result.rows;
        await this.setCache(config);
        this.loggerService.log(
          `Updated cache for key: ${config.endpointPath} --> publishing status: ${config.publishing_status}`,
          this.LOG_CONTEXT,
        );
        this.loggerService.log(`Successfully processed transaction: ${message.transactionID}`, this.LOG_CONTEXT);
      } else {
        this.loggerService.warn(`Config not found for ID: ${message.transactionID}`, this.LOG_CONTEXT);
      }
    } catch (error) {
      this.loggerService.error('Error processing message', error as Error, this.LOG_CONTEXT);
    }
  }

  private static normalizeNatsMessage(input: unknown): NatsMessage | null {
    let obj: unknown = input;

    if (typeof input === 'string') {
      try {
        obj = JSON.parse(input);
      } catch {
        return null;
      }
    } else if (typeof Buffer !== 'undefined' && Buffer.isBuffer(input)) {
      try {
        obj = JSON.parse(input.toString('utf8'));
      } catch {
        return null;
      }
    }

    if (!obj || typeof obj !== 'object') return null;
    const { transactionID } = obj as { transactionID?: unknown };
    if (typeof transactionID !== 'string' || transactionID.trim() === '') return null;
    return { transactionID: transactionID.trim() };
  }

  public async setCache(config: CacheData): Promise<void> {
    const key = config.endpointPath;
    const data = {
      schema: config.schema,
      mapping: config.mapping,
      functions: config.functions,
      publishing_status: config.publishing_status,
    };
    await this.redisService.setJson(key, JSON.stringify(data), this.cacheTtl);
  }
}
