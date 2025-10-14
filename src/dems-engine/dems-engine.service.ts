import { Injectable, Inject, OnModuleInit } from '@nestjs/common';
import { LoggerService, RedisService } from '@tazama-lf/frms-coe-lib';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { Knex } from 'knex';
import { extractTransactionType } from '../utils/extract_message_type';
import { extractTenantId } from '../utils/extract_tenant_id';
import { NatsService } from '../nats/nats.service';
import { getValueByPath } from '../utils/has_nested_property';

@Injectable()
export class DemsEngineService implements OnModuleInit {
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

  onModuleInit() {
    this.loggerService.log('DemsEngineService initialized', DemsEngineService.name);
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
    // db hit ni hogi at dems.
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
    const txtp = transaction.TxTp.replace('.', '_').toLowerCase();
    const destination = `transactionshistory_${txtp}`;
    try {
      await this.knex(destination).insert({
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
      await this.knex('transactionrelationship').insert({
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

  private async addAccount(accountId: string, tenantId: string): Promise<void> {
    try {
      // await this.knex('accounts').insert({
      //   accountId,
      //   tenantId,
      //   created: new Date().toISOString(),
      // });
      this.loggerService.log(`Added account: ${accountId} for tenant: ${tenantId}`);
    } catch (error) {
      this.loggerService.error(`Failed to add account: ${String(error)}`);
      throw error;
    }
  }

  private async addEntity(entityId: string, tenantId: string, CreDtTm: string): Promise<void> {
    try {
      // await this.knex('entities').insert({
      //   entityId,
      //   tenantId,
      //   CreDtTm,
      //   created: new Date().toISOString(),
      // });
      this.loggerService.log(`Added entity: ${entityId} for tenant: ${tenantId} and CreDtTm: ${CreDtTm}`);
    } catch (error) {
      this.loggerService.error(`Failed to add entity: ${String(error)}`);
      throw error;
    }
  }

  private async addAccountHolder(entityId: string, accountId: string, CreDtTm: string, tenantId: string): Promise<void> {
    try {
      // await this.knex('accountholders').insert({
      //   entityId,
      //   accountId,
      //   CreDtTm,
      //   tenantId,
      //   created: new Date().toISOString(),
      // });
      this.loggerService.log(`Added account holder: ${entityId} for account: ${accountId} and tenant: ${tenantId} and CreDtTm: ${CreDtTm}`);
    } catch (error) {
      this.loggerService.error(`Failed to add account holder: ${String(error)}`);
      throw error;
    }
  }

  /**
   * Saves failed transaction to quarantine table
   * @param payload The original payload that failed
   * @param endpoint The endpoint path
   * @param differences The AJV validation errors
   * @param correlationId Optional correlation ID for tracking
   */
  private async saveToQuarantine(payload: any, endpoint: string, differences: string[], correlationId?: string): Promise<void> {
    try {
      const tenantId = extractTenantId(endpoint);
      const quarantineRecord = {
        id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, // Simple ID generation
        correlation_id: correlationId || null,
        tenant_id: tenantId,
        endpoint_path: endpoint,
        config_id: null, // Add if you have config versioning
        version: null, // Add if you have schema versioning
        error: JSON.stringify({
          code: 'VALIDATION_ERROR',
          message: 'Payload validation failed',
          differences: differences,
          timestamp: new Date().toISOString(),
        }),
        raw_payload: JSON.stringify(payload),
        status: 'failed',
      };

      await this.knex('dems_quarantine').insert(quarantineRecord);
      this.loggerService.log(`Saved failed record to quarantine with ID: ${quarantineRecord.id}`);
    } catch (error) {
      this.loggerService.error(`Failed to save to quarantine: ${String(error)}`);
      // Don't throw here to avoid masking the original validation error
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
        message: 'Error during schemaa validation',
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
      const correlationId = crypto.randomUUID();
      try {
        await this.saveToQuarantine(payload, endpoint, differences, correlationId);
      } catch (error) {
        this.loggerService.error(`Failed to save to quarantine: ${String(error)}`);
      }

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
    let endToEndId = '';

    // let dataCache: DataCache | undefined;
    const dataCache: any = {};
    const transactionRelationship: any = {};

    // 4 cases:
    // 1. DataCache
    // 2. TransactionRelationship test util test

    // 3. addAccount
    // 4. addEntity
    // 5. addAccountHolder

    // example: "destination": "redis.cdtrId" / "destination": "transaction.endToEndId" / "destination": "accountHolder.addAccountHolder"

    if (configuredMapping?.mappings) {
      try {
        for (const mapping of configuredMapping.mappings) {
          const destination = mapping.destination.split('.')[1];
          const type = mapping.destination.split('.')[0];
          const separator = mapping.separator;
          const sources = mapping.sources;

          let DataCachevalue = mapping.prefix ? mapping.prefix : '';
          let transactionRelationshipValue = mapping.prefix ? mapping.prefix : '';

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

        // this.loggerService.log('DataCache:', dataCache);
        // this.loggerService.log('TransactionRelationship:', transactionRelationship);
      } catch (error) {
        this.loggerService.error(`Failed to process mapping data: ${String(error)}`);
      }
    } else {
      this.loggerService.log(`No mapping configured for endpoint: ${endpoint}`);
    }

    if (configuredMapping?.functions) {
      try {
        for (const row of configuredMapping.functions) {
          // prepare params (getPayloadByPath) --> and call each function one by one
          const functionToCall = row.functionName;
          let sources = row.sources || [];

          // sources = sources.map((source: Array<string>) =>
          //   source
          //     .map((s: string) => {
          //       return getValueByPath(payload, s);
          //     })
          //     .reduce((a: string, b: string) => a + b, ''),
          // );

          sources = sources.map((source: string) => {
            const mapping = configuredMapping.mappings.find((sch: any) => sch.destination === source);

            const extractedValues = mapping.sources.map((s: string) => getValueByPath(payload, s));

            const combinedValue = extractedValues.join('');
            return combinedValue;
          });

          await this[functionToCall](...Object.values(sources));
        }
      } catch (error) {
        this.loggerService.error(`Failed to execute configured functions: ${String(error)}`);
      }
    }

    const tazamaPayload = {
      transaction: payload,
      TxTp: transactionType,
      TenantId: tenantId,
      dataCache,
    };

    try {
      await this.saveTransactionHistory(tazamaPayload, `${transactionType}_${endToEndId}`);

      await this.saveTransactionRelationship(transactionRelationship);

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
