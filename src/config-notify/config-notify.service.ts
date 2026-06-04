import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerService, RedisService } from '@tazama-lf/frms-coe-lib';
import { DatabaseService } from '../database/database.service';
import { CacheData } from '../interfaces/iCacheData';
import { PublishingStatus } from '../enums/publishingStatus.enum';
import { NatsService } from '../nats/nats.service';
import { NatsMessage } from '../interfaces/iNatsMessage';

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
    this.consumerStream = this.configService.get<string>('nats.consumerStream', 'event-director');
  }

  private readonly LOG_CONTEXT = ConfigNotifyService.name;

  async onModuleInit(): Promise<void> {
    // Register consumer without producer stream since we only consume messages
    this.natsService.registerConsumer([this.consumerStream], this.handleNatsMessage.bind(this));

    this.loggerService.log(`NATS consumer registered for ${this.consumerStream}`, this.LOG_CONTEXT);
    try {
      const result = await this.databaseService.query<CacheData>(
        'SELECT endpoint_path AS "endpointPath", schema, mapping, functions, related_transaction, publishing_status FROM tcs_config where publishing_status = \'active\' ',
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

  public async updateCache(id: number, publishingStatus: PublishingStatus): Promise<void> {
    const result = await this.databaseService.query<CacheData>(
      'SELECT endpoint_path AS "endpointPath", schema, mapping, functions, related_transaction, publishing_status FROM tcs_config WHERE id = $1',
      [id],
    );

    if (!result.rows.length) {
      throw new NotFoundException(`Config not found for ID: ${id}`);
    }

    const [config] = result.rows;
    config.publishing_status = publishingStatus;
    await this.setCache(config);
    this.loggerService.log(`Updated cache for key: ${config.endpointPath} --> publishing status: ${publishingStatus}`, this.LOG_CONTEXT);
  }

  public async setCache(config: CacheData): Promise<void> {
    const key = config.endpointPath;
    const data = {
      schema: config.schema,
      mapping: config.mapping,
      functions: config.functions,
      related_transaction: config.related_transaction,
      publishing_status: config.publishing_status,
    };
    await this.redisService.setJson(key, JSON.stringify(data), this.cacheTtl);
  }

  private handleNatsMessage(message: NatsMessage): void {
    this.loggerService.log(`Received NATS message: ${JSON.stringify(message)}`, this.LOG_CONTEXT);
  }
}
