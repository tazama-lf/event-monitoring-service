import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerService, RedisService } from '@tazama-lf/frms-coe-lib';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { extractTransactionType } from '../utils/extract_message_type';
import { NatsService } from '../nats/nats.service';
import { getValueByPath } from '../utils/has_nested_property';
import { DatabaseOperationsService } from '../commons';
import { DatabaseService } from '../database/database.service';

interface ErrorResponse {
  isMatch: false;
  message: string;
  differences: string[];
  schema?: any;
}

interface SuccessResponse {
  isMatch: true;
  message: string;
  transactionRelationship: any;
  schema: any;
  payload: any;
  dataCache: any;
}

interface TazamaPayload {
  transaction: any;
  TxTp: string;
  dataCache: any;
}

type FindSchemaAndMappingResult = [any, any, any] | null;

@Injectable()
export class DemsEngineService {
  private readonly ajv: Ajv;
  private readonly timeToLive: number;

  constructor(
    private readonly loggerService: LoggerService,
    private readonly redisService: RedisService,
    private readonly natsService: NatsService,
    private readonly databaseOperationsService: DatabaseOperationsService,
    private readonly configService: ConfigService,
    private readonly databaseService: DatabaseService,
  ) {
    this.ajv = new Ajv({ allErrors: true, logger: false });
    addFormats(this.ajv);
    this.timeToLive = this.configService.get<number>('cache.timeToLive', 3600);
  }

  async findSchemaAndMapping(endpoint: string): Promise<FindSchemaAndMappingResult> {
    this.loggerService.log(`Looking up schema for endpoint: ${endpoint}`);

    const cacheKey = `${endpoint}`;
    const cachedSchema = await this.redisService.getJson(cacheKey);

    if (cachedSchema) {
      this.loggerService.log(`Cache hit for endpoint: ${endpoint}`);

      // Only parse if cachedSchema is a string
      if (typeof cachedSchema === 'string') {
        try {
          const parsedSchema = JSON.parse(cachedSchema);
          return [parsedSchema.schema, parsedSchema.mapping, parsedSchema.functions] as [any, any, any];
        } catch (error) {
          this.loggerService.error(`Failed to parse cached schema for endpoint ${endpoint}: ${String(error)}`);
          // Continue to database query if parsing fails
        }
      } else if (typeof cachedSchema === 'object' && cachedSchema !== null) {
        // If cachedSchema is already an object, use it directly
        const schemaObj = cachedSchema as any;
        return [schemaObj.schema, schemaObj.mapping, schemaObj.functions] as [any, any, any];
      }
    }

    // not found in cache, query the database

    this.loggerService.log(`Cache miss for endpoint: ${endpoint}. Querying database...`);
    const result = await this.databaseService.query('SELECT schema, mapping, functions FROM config WHERE endpoint_path = $1', [endpoint]);
    const record = result.rows[0];

    if (record) {
      this.loggerService.log(`Found schema for endpoint: ${endpoint}`);
      const data = {
        schema: record.schema,
        mapping: record.mapping,
        functions: record.functions,
      };
      await this.redisService.setJson(cacheKey, JSON.stringify(data), this.timeToLive);
      return [record.schema, record.mapping, record.functions] as [any, any, any];
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
      const differences: string[] = this.formatValidationErrors();
      this.loggerService.warn('Schema validation errors:');
      differences.forEach((difference, index) => {
        this.loggerService.warn(`  ${index + 1}. ${difference}`);
      });

      const correlationId = crypto.randomUUID();

      await this.databaseOperationsService.saveToQuarantine(payload, endpoint, differences, correlationId);

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

          let dataCacheValue = mapping.prefix ? mapping.prefix : '';
          let sum = 0;
          let transactionRelationshipValue = mapping.prefix ? mapping.prefix : '';

          for (let i = 0; i < sources.length; i++) {
            if (type === 'redis') {
              const value = getValueByPath<string>(payload, sources[i]);

              if (transformation == 'SUM') {
                const value: number = getValueByPath<number>(payload, sources[i]);
                console.log('value', value);
                sum += value;
              } else {
                dataCacheValue += value;
              }

              if (i < sources.length - 1) {
                dataCacheValue += separator;
              }
            }
            if (type === 'transaction') {
              const value = getValueByPath<string>(payload, sources[i]);
              if (transformation == 'SUM') {
                const value = getValueByPath<number>(payload, sources[i]);
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
            dataCacheValue += mapping.suffix ? mapping.suffix : '';
            if (transformation == 'SUM') {
              dataCache[destination] = sum.toString();
            } else {
              dataCache[destination] = dataCacheValue;
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
  private buildTazamaPayload(payload: any, transactionType: string, tenantId: string, dataCache: any): TazamaPayload {
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
    tazamaPayload: TazamaPayload,
    transactionType: string,
    endToEndId: string,
    transactionRelationship: any,
  ): Promise<void> {
    try {
      await Promise.all([
        this.databaseOperationsService.saveTransactionHistory(tazamaPayload, `${transactionType}_${endToEndId}`),
        this.databaseOperationsService.saveTransactionRelationship(transactionRelationship),
        this.natsService.notifyEventDirector(tazamaPayload),
      ]);

      this.loggerService.log('Successfully saved transaction history, transaction relationship, and notified event-director');
    } catch (error) {
      // Determine which operation failed for better error reporting
      let errorMessage = 'Failed to complete transaction operations';

      if (String(error).includes('saveTransactionHistory') || String(error).includes('transaction history')) {
        errorMessage = `Failed to save transaction history: ${String(error)}`;
      } else if (String(error).includes('saveTransactionRelationship') || String(error).includes('transaction relationship')) {
        errorMessage = `Failed to save transaction relationship: ${String(error)}`;
      } else if (String(error).includes('notifyEventDirector') || String(error).includes('event-director')) {
        errorMessage = `Failed to notify event-director: ${String(error)}`;
      } else {
        errorMessage = `Failed to complete transaction operations: ${String(error)}`;
      }

      this.loggerService.error(errorMessage);
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
  private buildErrorResponse(message: string, differences: string[], schema?: any): ErrorResponse {
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
  private buildSuccessResponse(schema: any, payload: any, transactionRelationship: any, dataCache: any): SuccessResponse {
    this.loggerService.log('THE END');
    return {
      isMatch: true,
      message: 'Everything is OK!',
      transactionRelationship,
      schema,
      payload,
      dataCache,
    };
  }

  async handleMessage(payload: { any }, endpoint: string, tenantId: string): Promise<any> {
    try {
      const result = await this.findSchemaAndMapping(endpoint);
      if (!result) {
        return this.buildErrorResponse('Schema not found for the specified endpoint', ['No schema exists for this endpoint']);
      }

      const [configuredSchema, configuredMapping, configuredFunctions] = result;

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
