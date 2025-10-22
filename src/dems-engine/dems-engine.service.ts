import { Injectable, Inject } from '@nestjs/common';
import { LoggerService, RedisService } from '@tazama-lf/frms-coe-lib';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { Knex } from 'knex';
import { extractTransactionType } from '../utils/extract_message_type';
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
    this.ajv = new Ajv({ allErrors: true, logger: false });
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
      const data = {
        schema: record.schema,
        mapping: record.mapping,
        functions: record.functions,
      };
      await this.redisService.setJson(cacheKey, JSON.stringify(data), this.TIME_TO_LIVE);
      return [record.schema, record.mapping, record.functions];
    }

    this.loggerService.log(`No schema found for endpoint: ${endpoint}`);
    return null;
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
        await this.databaseOperationsService.saveToQuarantine(payload, endpoint, differences, correlationId);
      } catch (error) {
        this.loggerService.error(`Failed to save to quarantine: ${String(error)}`);
        // Continue with validation result even if quarantine save fails
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

    // new case: sum and split

    if (configuredMapping) {
      try {
        for (const mapping of configuredMapping) {
          const destination = mapping.destination.split('.')[1];
          const type = mapping.destination.split('.')[0];
          const separator = mapping.delimiter;
          const sources = mapping.source;
          const transformation = mapping.transformation;

          let DataCachevalue = mapping.prefix ? mapping.prefix : '';
          let sum = 0;
          let transactionRelationshipValue = mapping.prefix ? mapping.prefix : '';

          for (let i = 0; i < sources.length; i++) {
            if (type === 'redis') {
              const value = getValueByPath(payload, sources[i]);

              if (transformation == 'SUM') {
                const value = getValueByPath(payload, sources[i]);
                console.log('value', value);
                sum += value;
              } else {
                DataCachevalue += value;
              }

              if (i < sources.length - 1) {
                DataCachevalue += separator;
              }
            }
            if (type === 'transaction') {
              const value = getValueByPath(payload, sources[i]);
              if (transformation == 'SUM') {
                const value = getValueByPath(payload, sources[i]);
                console.log('value', value);
                sum += value;
              } else {
                transactionRelationshipValue += value;
              }

              if (i < sources.length - 1) {
                transactionRelationshipValue += separator;
              }
            }
          }

          if (type === 'redis') {
            DataCachevalue += mapping.suffix ? mapping.suffix : '';
            if (transformation == 'SUM') {
              dataCache[destination] = sum.toString();
            } else {
              dataCache[destination] = DataCachevalue;
            }
          }

          if (type === 'transaction') {
            transactionRelationshipValue += mapping.suffix ? mapping.suffix : '';
            if (transformation == 'SUM') {
              transactionRelationship[destination] = sum.toString();
            } else {
              transactionRelationship[destination] = transactionRelationshipValue;
            }

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
  private async executeConfiguredFunctions(payload: any, configuredMapping: any, configuredFunctions: any): Promise<void> {
    if (configuredFunctions) {
      try {
        for (const row of configuredFunctions) {
          // prepare params (getPayloadByPath) --> and call each function one by one
          const functionToCall = row.functionName;
          let sources = row.params || [];

          sources = sources.map((source: string) => {
            const mapping = configuredMapping.find((sch: any) => sch.destination === source);

            const extractedValues = mapping.source.map((s: string) => {
              const value = getValueByPath(payload, s);
              return value;
            });

            const combinedValue = extractedValues.join('');

            return combinedValue;
          });

          await this.databaseOperationsService[functionToCall](...Object.values(sources));
        }
      } catch (error) {
        this.loggerService.error(`Failed to execute configured functions: ${String(error)}`);
        throw error;
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
      await this.databaseOperationsService.saveTransactionHistory(tazamaPayload, `${transactionType}_${endToEndId}`);
    } catch (error) {
      this.loggerService.error(`Failed to save transaction history: ${String(error)}`);
      throw error;
    }

    try {
      await this.databaseOperationsService.saveTransactionRelationship(transactionRelationship);
      this.loggerService.log('saved transaction Relationship');
    } catch (error) {
      this.loggerService.error(`Failed to save transaction relationship: ${String(error)}`);
      throw error;
    }

    try {
      await this.natsService.notifyEventDirector(tazamaPayload);
      this.loggerService.log('Notified event-director successfully');
    } catch (error) {
      this.loggerService.error(`Failed to notify event-director: ${String(error)}`);
      throw error;
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
  private buildSuccessResponse(schema: any, payload: any, transactionRelationship: any, dataCache: any): any {
    this.loggerService.log('THE END');
    return {
      isMatch: true,
      message: 'Everything is OK!',
      TransactionRelationship: transactionRelationship,
      schema,
      payload,
      dataCache,
    };
  }

  async handleMessage(payload: { any }, endpoint: string, tenantId: string): Promise<any> {
    try {
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

      const transactionType = extractTransactionType(endpoint);
      const enhancedRequest = { ...payload, TenantId: tenantId, TxTp: transactionType };

      const { dataCache, transactionRelationship, endToEndId } = this.processMappings(enhancedRequest, configuredMapping, endpoint);

      try {
        await this.executeConfiguredFunctions(enhancedRequest, configuredMapping, configuredFunctions);
      } catch (error) {
        this.loggerService.error(`Failed to execute configured functions: ${String(error)}`);
        return this.buildErrorResponse('Error executing configured functions', [`Function execution failed: ${String(error)}`]);
      }

      const tazamaPayload = this.buildTazamaPayload(enhancedRequest, transactionType, tenantId, dataCache);

      try {
        await this.saveTransactionDataAndNotify(tazamaPayload, transactionType, endToEndId, transactionRelationship);
      } catch (error) {
        this.loggerService.error(`Failed to save transaction data or notify: ${String(error)}`);
        return this.buildErrorResponse('Error saving transaction data or sending notification', [
          `Transaction processing failed: ${String(error)}`,
        ]);
      }
      this.loggerService.log(' transaction relationship', transactionRelationship);
      this.loggerService.log('data cache', dataCache);

      return this.buildSuccessResponse(configuredSchema, tazamaPayload, transactionRelationship, dataCache);
    } catch (error) {
      this.loggerService.error(`Unexpected error in handleMessage: ${String(error)}`);
      return this.buildErrorResponse('Unexpected error occurred while processing message', [`Internal error: ${String(error)}`]);
    }
  }
}
