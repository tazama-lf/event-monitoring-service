import { Injectable, Inject, OnModuleInit } from '@nestjs/common';
import { LoggerService, RedisService } from '@tazama-lf/frms-coe-lib';
import { StartupFactory } from '@tazama-lf/frms-coe-startup-lib';
import { Knex } from 'knex';

interface Config {
  id: string;
  endpoint: string;
  tenant_id: string;
  msg_fam: string;
  msg_type: string;
  version: string;
  schema: object;
  mapping: object;
  enrichment: object;
  artifact_link: string;
}

interface NatsMessage {
  transactionID: string;
  msgfam: string;
  msgtype: string;
  tenant_id: string;
  version: string;
}

const CACHE_TTL = 86400;

@Injectable()
export class ConfigNotifyService implements OnModuleInit {
  private readonly natsService = new StartupFactory();

  constructor(
    private readonly logger: LoggerService,
    private readonly redis: RedisService,
    @Inject('KNEX') private readonly knex: Knex,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.natsService.init(
      this.handleNatsMessage.bind(this) as never,
      this.logger,
      ['config.notification'],
      'config.notification.response',
    );
    this.logger.log('NATS consumer initialized for config.notification');

    const configs = (await this.knex('configurations').select('*')) as Config[];
    for (const config of configs) {
      console.log('Preloading cache for config:', config.id);
      await this.redis.setJson(config.endpoint, JSON.stringify({ schema: config.schema, mapping: config.mapping }), CACHE_TTL);
    }
    this.logger.log(`Cache preloaded: ${configs.length} configurations`);
  }

  private async handleNatsMessage(reqObj: unknown, handleResponse: (response: object) => Promise<void>): Promise<void> {
    const message = reqObj as NatsMessage;
    this.logger.log(`Received NATS notification for config ID: ${message.transactionID}`);

    try {
      const config = (await this.knex('configurations').where('id', message.transactionID).first()) as Config | undefined;

      if (config) {
        await this.redis.setJson(config.endpoint, JSON.stringify({ schema: config.schema, mapping: config.mapping }), CACHE_TTL);
        this.logger.log(`Updated cache for key: ${config.endpoint}`);
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
}
