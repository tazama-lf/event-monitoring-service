import { Injectable, OnModuleInit } from '@nestjs/common';
import { LoggerService, RedisService } from '@tazama-lf/frms-coe-lib';
import { StartupFactory } from '@tazama-lf/frms-coe-startup-lib';
import { Knex } from 'knex';
import { InjectConnection } from 'nest-knexjs';

interface Config {
  id: number;
  msg_fam: string;
  transaction_type: string;
  endpoint_path: string;
  version: string;
  content_type: string;
  schema: object;
  mapping: object;
  tenant_id: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  status: string;
}

interface NatsMessage {
  transactionID: number;
}

const CACHE_TTL = 86400;

@Injectable()
export class ConfigNotifyService implements OnModuleInit {
  private readonly natsService = new StartupFactory();

  constructor(
    private readonly logger: LoggerService,
    private readonly redis: RedisService,
    @InjectConnection() private readonly knex: Knex,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.natsService.init(
      this.handleNatsMessage.bind(this) as never,
      this.logger,
      ['config.notification'],
      'config.notification.response',
    );
    this.logger.log('NATS consumer initialized for config.notification');

    const configs = (await this.knex('config').select('*')) as Config[];
    for (const config of configs) {
      console.log('Preloading cache for config:', config.id);
      await this.redis.setJson(config.endpoint_path, JSON.stringify({ schema: config.schema, mapping: config.mapping }), CACHE_TTL);
    }
    this.logger.log(`Cache preloaded: ${configs.length} configurations`);
  }

  private async handleNatsMessage(reqObj: NatsMessage, handleResponse: (response: object) => Promise<void>): Promise<void> {
    const message = reqObj;
    this.logger.log(`Received NATS notification for config ID: ${message.transactionID}`);

    try {
      const config = (await this.knex('config').where('id', message.transactionID).first()) as Config | undefined;

      if (config) {
        await this.redis.setJson(config.endpoint_path, JSON.stringify({ schema: config.schema, mapping: config.mapping }), CACHE_TTL);
        this.logger.log(`Updated cache for key: ${config.endpoint_path}`);
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
