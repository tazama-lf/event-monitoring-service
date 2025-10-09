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
    // const schemaRecord = await this.knex('configurations').select('schema', 'mapping').where({ endpoint }).first();

    // if (schemaRecord) {
    //   this.loggerService.log(`Schema found for endpoint: ${endpoint}. Caching result...`);
    //   await this.redisService.set(cacheKey, schemaRecord, 86400);
    //   return [schemaRecord.schema, schemaRecord.mapping];
    // }

    this.loggerService.log(`No schema found for endpoint: ${endpoint}`);
    return null;
  }

  /**
   * Saves transaction history to the database
   * @param transaction The transaction object
   * @param key The key to use for the transaction
   */
  private async saveTransactionHistory(transaction: any, key: string): Promise<void> {
    try {
      await this.knex('transactionshistory').insert({
        _key: key,
        transaction: JSON.stringify(transaction),
        created: new Date().toISOString(),
      });
      this.loggerService.log(`Saved transaction history with key: ${key}`);
    } catch (error) {
      this.loggerService.error(`Failed to save transaction history: ${String(error)}`);
      throw error;
    }
  }

  /**
   * Saves transaction relationship to the database
   * @param relationship The transaction relationship object
   */
  private async saveTransactionRelationship(relationship: any): Promise<void> {
    try {
      await this.knex('transactionrelationships').insert({
        _from: relationship.from,
        _to: relationship.to,
        Amt: relationship.Amt,
        Ccy: relationship.Ccy,
        CreDtTm: relationship.CreDtTm,
        EndToEndId: relationship.EndToEndId,
        MsgId: relationship.MsgId,
        PmtInfId: relationship.PmtInfId,
        TxTp: relationship.TxTp,
        TenantId: relationship.TenantId,
        created: new Date().toISOString(),
      });

      this.loggerService.log(`Saved transaction relationship: ${relationship.from} -> ${relationship.to}`);
    } catch (error) {
      this.loggerService.error(`Failed to save transaction relationship: ${String(error)}`);
      throw error;
    }
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
    const dataCache: any = {};
    const transactionRelationship: any = {};
    let endToEndId: string = ''; // needed for saving transaction history

    if (configuredMapping) {
      try {
        for (const mapping of configuredMapping.mappings) {
          // 4 cases:
          // 1. DataCache
          // 2. TransactionRelationship test util test

          // 3. addAccount
          // 4. addEntity
          // 5. addAccountHolder

          // example: "destination": "redis.cdtrId"
          const destination = mapping.destination.split('.')[1];
          const type = mapping.destination.split('.')[0];
          const separator = mapping.separator;
          const sources = mapping.sources;

          let DataCachevalue = mapping.prefix ? mapping.prefix : '';
          let transactionRelationshipValue = '';

          for (let i = 0; i < sources.length; i++) {
            if (type === 'redis') {
              DataCachevalue += getValueByPath(payload, sources[i]);
              if (i < sources.length - 1) {
                DataCachevalue += separator;
              }
            }
            if (type === 'transaction') {
              const value = getValueByPath(payload, sources[i]);
              transactionRelationshipValue += value;

              if (i < sources.length - 1) {
                transactionRelationshipValue += separator;
              }
            }
          }

          if (type === 'redis') {
            DataCachevalue += mapping.suffix ? mapping.suffix : '';
            dataCache[destination] = DataCachevalue;
          }
          if (type === 'transaction') {
            transactionRelationshipValue += mapping.suffix ? mapping.suffix : '';
            transactionRelationship[destination] = transactionRelationshipValue;

            if (destination === 'endToEndId') {
              endToEndId = transactionRelationshipValue;
            }
          }
        }
        this.loggerService.log('DataCache:', dataCache);
        this.loggerService.log('TransactionRelationship:', transactionRelationship);
      } catch (error) {
        this.loggerService.error(`Failed to process mapping data: ${String(error)}`);
      }
    } else {
      this.loggerService.log(`No mapping configured for endpoint: ${endpoint}`);
    }

    const tazamaPayload = {
      transaction: payload,
      TxTp: transactionType,
      TenantId: tenantId,
      dataCache,
    };

    try {
      console.log('end to end id for tHistory:', endToEndId);
      // await this.saveTransactionHistory(tazamaPayload, `${transactionType}_${endToEndId}`);

      // await this.saveTransactionRelationship(transactionRelationship);

      await this.natsService.notifyEventDirector(tazamaPayload);
      this.loggerService.log('Notification sent to event-director');
    } catch (error) {
      this.loggerService.error(`Failed to notify event-director: ${String(error)}`);
    }

    return {
      isMatch: true,
      message: 'Payload structure matches the schema perfectly!',
      schema: configuredSchema,
      payload: tazamaPayload,
      dataCache: dataCache,
      differences: [],
    };
  }
}
