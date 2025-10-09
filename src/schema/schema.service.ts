import { Injectable, Inject } from '@nestjs/common';
import { LoggerService, RedisService } from '@tazama-lf/frms-coe-lib';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { Knex } from 'knex';
import { extractTransactionType } from '../utils/extract_message_type';
import { extractTenantId } from '../utils/extract_tenant_id';
import { NatsService } from '../nats/nats.service';
import { getValueByPath } from '../utils/has_nested_property';

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

  async findSchemaAndMapping(endpoint: string): Promise<any> {
    this.loggerService.log(`Looking up schema for endpoint: ${endpoint}`);

    const cacheKey = `${endpoint}`;
    const cachedSchema = await this.redisService.getJson(cacheKey);
    const parsedSchema = JSON.parse(cachedSchema || 'null');

    if (cachedSchema) {
      this.loggerService.log(`Cache hit for endpoint: ${endpoint}`);
      return [parsedSchema.schema, parsedSchema.mapping];
    }

    this.loggerService.log(`Cache miss for endpoint: ${endpoint}. Querying database...`);
    const schemaRecord = await this.knex('configurations').select('schema', 'mapping').where({ endpoint }).first();

    if (schemaRecord) {
      this.loggerService.log(`Schema found for endpoint: ${endpoint}. Caching result...`);
      await this.redisService.set(cacheKey, schemaRecord, 86400);
      return [schemaRecord.schema, schemaRecord.mapping];
    }

    this.loggerService.log(`No schema found for endpoint: ${endpoint}`);
    return null;
  }

  async handleMessage(payload: { any }, endpoint: string): Promise<any> {
    const [configuredSchema, configuredMapping] = await this.findSchemaAndMapping(endpoint);

    if (!configuredSchema) {
      this.loggerService.log(`No schema configured for endpoint: ${endpoint}`);
      return {
        isMatch: false,
        message: 'Schema not found for the specified endpoint',
        differences: ['No schema exists for this endpoint'],
      };
    }

    let isValid;
    try {
      isValid = this.ajv.validate(configuredSchema, payload);
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
        schema: configuredSchema,
        differences,
      };
    }

    this.loggerService.log('Payload structure matches the schema perfectly!');

    // notifying event-director after successful validation
    const transactionType = extractTransactionType(endpoint);
    const tenantId = extractTenantId(endpoint);

    // let dataCache: DataCache | undefined;
    let dataCache: any;

    if (configuredMapping) {
      try {
        dataCache = {};

        for (const mapping of configuredMapping.mappings) {
          const destination = mapping.destination;
          const separator = mapping.separator;
          const sources = mapping.sources;

          let value = '';

          for (let i = 0; i < sources.length; i++) {
            value += getValueByPath(payload, sources[i]);

            if (i < sources.length - 1) {
              value += separator;
            }
          }

          dataCache[destination] = value;
        }

        this.loggerService.log('DataCache:', dataCache);
      } catch (error) {
        this.loggerService.error(`Failed to process mapping data: ${String(error)}`);
      }
    } else {
      this.loggerService.log(`No mapping configured for endpoint: ${endpoint}`);
    }

    const notification = {
      transaction: payload,
      TxTp: transactionType,
      TenantId: tenantId,
      // ...(dataCache ? { dataCache } : {}),
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
      schema: configuredSchema,
      payload: notification,
      dataCache: dataCache,
      differences: [],
    };
  }
}
