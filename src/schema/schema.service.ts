import { Injectable, Inject, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { LoggerService, RedisService } from '@tazama-lf/frms-coe-lib';
import { Knex } from 'knex';

@Injectable()
export class SchemaService implements OnModuleInit, OnModuleDestroy {
  constructor(
    private readonly loggerService: LoggerService,
    private readonly redisService: RedisService,
    @Inject('KNEX') private readonly knex: Knex,
  ) {}

  async onModuleInit(): Promise<void> {
    // Initialize service
    this.loggerService.log('SchemaService initialized');
  }

  async onModuleDestroy(): Promise<void> {
    // Cleanup resources
    this.loggerService.log('SchemaService destroyed');
  }
}
