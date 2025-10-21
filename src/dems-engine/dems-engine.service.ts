import { Injectable, Inject } from '@nestjs/common';
import { LoggerService, RedisService } from '@tazama-lf/frms-coe-lib';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { Knex } from 'knex';
import { extractTransactionType } from '../utils/extract_message_type';
import { extractTenantId } from '../utils/extract_tenant_id';
import { NatsService } from '../nats/nats.service';
import { getValueByPath } from '../utils/has_nested_property';
import { DatabaseOperationsService } from '../commons';

@Injectable()
export class DemsEngineService {
  private readonly ajv: Ajv;
  constructor(
    private readonly loggerService: LoggerService,
    private readonly redisService: RedisService,
    private readonly natsService: NatsService,
    private readonly databaseOperationsService: DatabaseOperationsService,
    @Inject('KNEX') private readonly knex: Knex,
  ) {
    this.ajv = new Ajv({ allErrors: true });
    addFormats(this.ajv);
  }

  TIME_TO_LIVE = 3600; // 1 hour in seconds

  async findSchemaAndMapping(endpoint: string): Promise<any> {
    this.loggerService.log(`Looking up schema for endpoint: ${endpoint}`);

    const cacheKey = `${endpoint}`;
    const cachedSchema = await this.redisService.getJson(cacheKey);
    const parsedSchema = JSON.parse(cachedSchema || 'null');

    if (cachedSchema) {
      this.loggerService.log(`Cache hit for endpoint: ${endpoint}`);
      return [parsedSchema.schema, parsedSchema.mapping, parsedSchema.functions];
    }

    // not found in cache, query the database

    this.loggerService.log(`Cache miss for endpoint: ${endpoint}. Querying database...`);
    const record: any = await this.knex('config').select('schema', 'mapping', 'functions').where({ endpoint_path: endpoint });

    if (record) {
      this.loggerService.log(`Found schema for endpoint: ${endpoint}`);
      await this.redisService.setJson(cacheKey, JSON.stringify(record), this.TIME_TO_LIVE);
      return [record.schema, record.mapping, record.functions];
    }

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

  /**
   * Validates payload against the configured schema
   * @param payload The payload to validate
   * @param configuredSchema The schema to validate against
   * @param endpoint The endpoint path for error tracking
   * @returns Validation result with isValid flag and formatted errors
   */
  private async validatePayload(
    payload: any,
    configuredSchema: any,
    endpoint: string,
  ): Promise<{ isValid: boolean; differences?: string[] }> {
    let isValid;
    try {
      isValid = this.ajv.validate(configuredSchema, payload);
    } catch (error) {
      this.loggerService.error(`AJV validation error: ${String(error)}`);
      return {
        isValid: false,
        differences: [String(error)],
      };
    }

    if (!isValid) {
      const differences = this.formatValidationErrors();
      this.loggerService.log(`Schema validation errors: ${JSON.stringify(differences)}`);

      const correlationId = crypto.randomUUID();
      try {
        await this.saveToQuarantine(payload, endpoint, differences, correlationId);
      } catch (error) {
        this.loggerService.error(`Failed to save to quarantine: ${String(error)}`);
      }

      return { isValid: false, differences };
    }

    this.loggerService.log('Payload structure matches the schema perfectly!');
    return { isValid: true };
  }

  /**
   * Formats AJV validation errors into human-readable messages
   * @returns Array of formatted error messages
   */
  private formatValidationErrors(): string[] {
    return (
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
      }) || []
    );
  }

  /**
   * Processes configured mappings to extract data cache and transaction relationship data
   * @param payload The payload to extract data from
   * @param configuredMapping The mapping configuration
   * @param endpoint The endpoint path for logging
   * @returns Object containing dataCache, transactionRelationship, and endToEndId
   */
  private processMappings(
    payload: any,
    configuredMapping: any,
    endpoint: string,
  ): { dataCache: any; transactionRelationship: any; endToEndId: string } {
    const dataCache: any = {};
    const transactionRelationship: any = {};
    let endToEndId = '';

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
      } catch (error) {
        this.loggerService.error(`Failed to process mapping data: ${String(error)}`);
      }
    } else {
      this.loggerService.log(`No mapping configured for endpoint: ${endpoint}`);
    }

    return { dataCache, transactionRelationship, endToEndId };
  }

  /**
   * Executes configured functions based on the mapping configuration
   * @param payload The payload to extract data from
   * @param configuredMapping The mapping configuration containing functions to execute
   */
  private async executeConfiguredFunctions(payload: any, configuredFunctions: any): Promise<void> {
    if (configuredFunctions) {
      try {
        for (const row of configuredFunctions) {
          // prepare params (getPayloadByPath) --> and call each function one by one
          const functionToCall = row.functionName;
          let sources = row.sources || [];

          sources = sources.map((source: string) => {
            const mapping = configuredFunctions.find((sch: any) => sch.destination === source);

            const extractedValues = mapping.sources.map((s: string) => getValueByPath(payload, s));

            const combinedValue = extractedValues.join('');
            return combinedValue;
          });

          await this.databaseOperationsService[functionToCall](...Object.values(sources));
        }
      } catch (error) {
        this.loggerService.error(`Failed to execute configured functions: ${String(error)}`);
      }
    }
  }

  /**
   * Builds the Tazama payload object
   * @param payload The original payload
   * @param transactionType The extracted transaction type
   * @param tenantId The extracted tenant ID
   * @param dataCache The processed data cache
   * @returns The formatted Tazama payload
   */
  private buildTazamaPayload(payload: any, transactionType: string, tenantId: string, dataCache: any): any {
    return {
      transaction: payload,
      TxTp: transactionType,
      TenantId: tenantId,
      dataCache,
    };
  }

  /**
   * Saves transaction data and sends notification to event director
   * @param tazamaPayload The Tazama payload to process
   * @param transactionType The transaction type
   * @param endToEndId The end-to-end ID for the transaction
   * @param transactionRelationship The transaction relationship data
   */
  private async saveTransactionDataAndNotify(
    tazamaPayload: any,
    transactionType: string,
    endToEndId: string,
    transactionRelationship: any,
  ): Promise<void> {
    try {
      await this.saveTransactionHistory(tazamaPayload, `${transactionType}_${endToEndId}`);

      await this.saveTransactionRelationship(transactionRelationship);

      await this.natsService.notifyEventDirector(tazamaPayload);
      this.loggerService.log('Notification sent to event-director');
    } catch (error) {
      this.loggerService.error(`Failed to notify event-director: ${String(error)}`);
    }
  }

  /**
   * Builds an error response object
   * @param message The error message
   * @param differences Array of validation differences
   * @param schema Optional schema object
   * @returns Formatted error response
   */
  private buildErrorResponse(message: string, differences: string[], schema?: any): any {
    return {
      isMatch: false,
      message,
      differences,
      ...(schema && { schema }),
    };
  }

  /**
   * Builds a success response object
   * @param schema The validated schema
   * @param payload The processed payload
   * @param dataCache The processed data cache
   * @returns Formatted success response
   */
  private buildSuccessResponse(schema: any, payload: any, dataCache: any): any {
    return {
      isMatch: true,
      message: 'Payload structure matches the schema perfectly!',
      schema,
      payload,
      dataCache,
      differences: [],
    };
  }

  async handleMessage(payload: { any }, endpoint: string, tenantId: string): Promise<any> {
    const [configuredSchema, configuredMapping, configuredFunctions] = await this.findSchemaAndMapping(endpoint);
    if (!configuredSchema) {
      return this.buildErrorResponse('Schema not found for the specified endpoint', ['No schema exists for this endpoint']);
    }

    const validationResult = await this.validatePayload(payload, configuredSchema, endpoint);
    if (!validationResult.isValid) {
      const errorMessage = validationResult.differences?.[0]?.includes('AJV validation error')
        ? 'Error during schemaa validation'
        : 'Payload structure does not match the schema';
      return this.buildErrorResponse(errorMessage, validationResult.differences || [], configuredSchema);
    }

    const enhancedRequest = { ...payload, TenantId: tenantId };

    const transactionType = extractTransactionType(endpoint);

    const { dataCache, transactionRelationship, endToEndId } = this.processMappings(enhancedRequest, configuredMapping, endpoint);
    await this.executeConfiguredFunctions(enhancedRequest, configuredFunctions);

    const tazamaPayload = this.buildTazamaPayload(enhancedRequest, transactionType, tenantId, dataCache);

    await this.saveTransactionDataAndNotify(tazamaPayload, transactionType, endToEndId, transactionRelationship);

    return this.buildSuccessResponse(configuredSchema, tazamaPayload, dataCache);
  }
}
