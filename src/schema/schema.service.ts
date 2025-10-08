import { Injectable, Inject } from '@nestjs/common';
import { LoggerService, RedisService } from '@tazama-lf/frms-coe-lib';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { Knex } from 'knex';
import { extractTransactionType } from '../utils/extract_message_type';
import { extractTenantId } from '../utils/extract_tenant_id';
import { NatsService } from '../nats/nats.service';

@Injectable()
export class SchemaService {
  private readonly ajv: Ajv;
  constructor(
    private readonly loggerService: LoggerService,
    private readonly redisService: RedisService,
    private readonly natsService: NatsService,
    @Inject('KNEX') private readonly knex: Knex,
  ) {
    this.ajv = new Ajv({ allErrors: true });
    addFormats(this.ajv);
  }

  async findSchemaInDatabase(endpoint: string): Promise<any> {
    this.loggerService.log(`Looking up schema for endpoint: ${endpoint}`);

    const cacheKey = `${endpoint}`;
    const cachedSchema = await this.redisService.getJson(cacheKey);
    if (cachedSchema) {
      return JSON.parse(cachedSchema);
    }

    this.loggerService.log(`Cache miss for endpoint: ${endpoint}. Querying database...`);
    const schemaRecord = await this.knex('configurations').select('schema').where({ endpoint }).first();

    if (schemaRecord) {
      this.loggerService.log(`Schema found for endpoint: ${endpoint}. Caching result...`);
      await this.redisService.set(cacheKey, schemaRecord, 86400);
      return schemaRecord.schema;
    }

    this.loggerService.log(`No schema found for endpoint: ${endpoint}`);
    return null;
  }

  async handleMessage(payload: { any }, endpoint: string): Promise<any> {
    const configuredSchema = await this.findSchemaInDatabase(endpoint);

    if (!configuredSchema) {
      this.loggerService.log(`No schema configured for endpoint: ${endpoint}`);
      return {
        isMatch: false,
        message: 'Schema not found for the specified endpoint',
        differences: ['No schema exists for this endpoint'],
      };
    }

    const actualSchema = configuredSchema;

    let isValid;
    try {
      isValid = this.ajv.validate(actualSchema, payload);
    } catch (error) {
      this.loggerService.error(`AJV validation error: ${String(error)}`);
      return {
        isMatch: false,
        message: 'Error during schema validation',
        differences: [String(error)],
      };
    }

    if (!isValid) {
      const differences =
        this.ajv.errors?.map((error) => {
          const path = error.instancePath || 'root';
          const message = error.message || 'validation failed';

          // Format the error message to be more human-readable
          if (error.keyword === 'required') {
            return `${path}: Missing required property '${error.params?.missingProperty}'`;
          } else if (error.keyword === 'additionalProperties') {
            return `${path}: Unexpected property '${error.params?.additionalProperty}' not defined in schema`;
          } else if (error.keyword === 'type') {
            this.loggerService.log(`Type error details: ${JSON.stringify(error)}`);
            return `${path}: Should be a ${error.params?.type}`;
          } else {
            return `--> ${path}: ${message}`;
          }
        }) || [];

      this.loggerService.log(`Schema validation errors: ${JSON.stringify(differences)}`);
      return {
        isMatch: false,
        message: 'Payload structure does not match the schema',
        schema: actualSchema,
        differences,
      };
    }

    this.loggerService.log('Payload structure matches the schema perfectly!');

    // notifying event-director after successful validation
    const transactionType = extractTransactionType(endpoint);
    const tenantId = extractTenantId(endpoint);

    const notification = {
      transaction: payload,
      TxTp: transactionType,
      TenantId: tenantId,
      metaData: {
        prcgTmED: Date.now(),
      },
    };

    try {
      await this.knex('transactionshistory').insert({
        transaction: JSON.stringify(notification),
      });
      await this.natsService.notifyEventDirector(notification);
      this.loggerService.log(`Notification sent to event-director for endpoint: ${endpoint}`);
    } catch (error) {
      this.loggerService.error(`Failed to notify event-director: ${String(error)}`);
    }

    return {
      isMatch: true,
      message: 'Payload structure matches the schema perfectly!',
      schema: actualSchema,
      payload: notification,
      differences: [],
    };
  }
}
