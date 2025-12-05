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
import { ApmSpan } from '../apm/apm.decorators';
import { parseString, ParserOptions } from 'xml2js';
import { returnArrayFieldsFromSchema, replaceObjectsWithArrays, createSchemaAwareNumberProcessor } from '../utils/xml2js.utils';
import { processSourceMapping } from '../utils/mapping-sources.utils';
import { randomUUID } from 'node:crypto';
import { TransactionDetails } from '../interfaces/iTransactionRelationship';
import { ErrorResponse } from '../interfaces/iErrorResponse';
import { ProcessingResult } from '../interfaces/iProcessingResult';
import { TazamaPayload } from '../interfaces/iTazamaPayload';
type FindSchemaAndMappingResult = [any, any, any] | null;

@Injectable()
export class DemsEngineService {
  private readonly ajv: Ajv;
  private readonly timeToLive: number;
  private readonly LOG_CONTEXT = DemsEngineService.name;

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

  @ApmSpan('dems-find-schema-and-mapping')
  async findSchemaAndMapping(endpoint: string): Promise<FindSchemaAndMappingResult> {
    this.loggerService.log(`Looking up schema for endpoint: ${endpoint}`);

    const cacheKey = endpoint;
    const cachedSchema = await this.redisService.getJson(cacheKey);

    if (cachedSchema) {
      this.loggerService.log(`Cache hit for endpoint: ${endpoint}`);

      // Only parse if cachedSchema is a string
      if (typeof cachedSchema === 'string') {
        try {
          const parsedSchema = JSON.parse(cachedSchema);

          // return only if parsedSchema.publishing_status is 'active' (if present)
          if (parsedSchema.publishing_status && parsedSchema.publishing_status !== 'active') {
            this.loggerService.log(`Cached schema for endpoint: ${endpoint} is not active`);
            return null;
          }

          return [parsedSchema.schema, parsedSchema.mapping, parsedSchema.functions] as [any, any, any];
        } catch (error) {
          this.loggerService.error(`Failed to parse cached schema for endpoint ${endpoint}: ${String(error)}`);
        }
      } else if (typeof cachedSchema === 'object') {
        // If cachedSchema is already an object, use it directly
        const schemaObj = cachedSchema as any;
        return [schemaObj.schema, schemaObj.mapping, schemaObj.functions] as [any, any, any];
      }
    }

    // not found in cache, query the database

    this.loggerService.log(`Cache miss for endpoint: ${endpoint}. Querying database...`);
    const result = await this.databaseService.query(
      "SELECT schema, mapping, functions, publishing_status FROM config WHERE endpoint_path = $1 and publishing_status = 'active'",
      [endpoint],
    );
    const MIN_ROWS = 0;
    const [record] = result.rows;

    if (result.rows.length > MIN_ROWS) {
      this.loggerService.log(`Found schema for endpoint: ${endpoint}`);
      const data = {
        schema: record.schema,
        mapping: record.mapping,
        functions: record.functions,
        publishing_status: record.publishing_status,
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
   * @param tenantId The tenant ID for logging
   * @returns Validation result with isValid flag and formatted errors
   */
  @ApmSpan('dems-validate-payload')
  private async validatePayload(
    payload: any,
    configuredSchema: any,
    endpoint: string,
    tenantId: string,
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

      const correlationId = randomUUID();
      await this.databaseOperationsService.saveToQuarantine(payload, endpoint, differences, tenantId, correlationId);

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
        const message = error.message ?? 'validation failed';

        // Format the error message to be more human-readable
        if (error.keyword === 'required') {
          return `${path}: Missing required property '${error.params.missingProperty}'`;
        }
        if (error.keyword === 'additionalProperties') {
          return `${path}: Unexpected property '${error.params.additionalProperty}' not defined in schema`;
        }
        if (error.keyword === 'type') {
          return `${path}: Should be a ${error.params.type}`;
        }
        return `--> ${path}: ${message}`;
      }) ?? []
    );
  }

  /**
   * Processes configured mappings to extract data cache and transaction relationship data
   * @param payload The payload to extract data from
   * @param configuredMapping The mapping configuration
   * @param endpoint The endpoint path for logging
   * @returns Object containing dataCache, transactionRelationship, and endToEndId
   */
  @ApmSpan('dems-process-mappings')
  // eslint-disable-next-line @typescript-eslint/require-await -- async is needed for ApmSpan decorator
  private async processMappings(
    payload: any,
    configuredMapping: any,
    endpoint: string,
  ): Promise<{ dataCache: any; transactionRelationship: TransactionDetails; endToEndId: string; dynamicMapping?: any }> {
    // static object creation logic
    const dataCache: any = {};
    const transactionRelationship: TransactionDetails = {
      source: '',
      destination: '',
      TxTp: '',
      TenantId: '',
      MsgId: '',
      CreDtTm: '',
      Amt: -1,
      Ccy: '',
      EndToEndId: '',
      lat: '',
      long: '',
      TxSts: '',
    };

    // dynamic object creation logic
    const dynamicMapping: any = {};

    let endToEndId = '';
    this.loggerService.log(`Processing mappings for endpoint: ${endpoint}`, this.LOG_CONTEXT);

    //     [
    //   {
    //     "columns": [
    //       {
    //         "name": "_key",
    //         "type": "string",
    //         "param": "car.vin",
    //         "datasource": "dataModel"
    //       },
    //       {
    //         "name": "data",
    //         "type": "jsonb",
    //         "param": "car",
    //         "datasource": "payload"
    //       }
    //     ],
    //     "tableName": "tenantid_car",
    //     "functionName": "addDataModelTable"
    //   }
    // ]

    if (configuredMapping) {
      this.loggerService.log('configuredMapping is: ', JSON.stringify(configuredMapping));
      try {
        for (const mapping of configuredMapping) {
          const sources = mapping.source;

          //usually a string but can be array in case of multiple sources(split usecase)
          let destination = typeof mapping.destination === 'string' ? mapping.destination.split('.')[1] : mapping.destination;
          const type = typeof mapping.destination === 'string' ? mapping.destination.split('.')[0] : mapping.destination;

          // case: redis.instdAmt.amt or redis.instdAmt.ccy ---> [redis,instdAmt,amt]
          // stringSize will be 3 in this case
          const stringSize = typeof mapping.destination === 'string' ? mapping.destination.split('.').length : -1;

          const separator = mapping.delimiter;

          // dynamic mapping logic based on datasource(datamodel ya payload)
          if (type !== 'redis' && type !== 'transactionDetails') {
            // append to dynamic mapping object
            const ObjectName: string = mapping.destination.split('.')[0]; // e.g., Toyota
            const PropertyName: string = mapping.destination.split('.')[1]; // e.g., model
            const nestedPropertyName: string = mapping.destination.split('.')[2]; // e.g., name (if any)

            if (mapping.datasource === 'dataModel') {
              this.loggerService.log('dataModel case for dynamic mapping source: ', mapping.source[0]);
              this.loggerService.log('dataModel case for dynamic mapping value: ', getValueByPath(payload, mapping.source[0]));

              dynamicMapping[ObjectName] ??= {};
              if (nestedPropertyName) {
                dynamicMapping[ObjectName][PropertyName] ??= {};
                dynamicMapping[ObjectName][PropertyName][nestedPropertyName] = getValueByPath(payload, mapping.source[0]);
              } else {
                dynamicMapping[ObjectName][PropertyName] = getValueByPath(payload, mapping.source[0]);
              }
            }

            this.loggerService.log('dynamicMapping object is now: ', JSON.stringify(dynamicMapping));

            continue;
          }

          //constant value injection logic
          if (mapping.constantValue) {
            if (type === 'redis') {
              dataCache[destination] = mapping.constantValue;
            }
            if (type === 'transactionDetails') {
              transactionRelationship[destination] = mapping.constantValue;
            }
            continue;
          }

          // handling multiple destinations for single source - split value usecase
          if (typeof destination !== 'string' || typeof type !== 'string') {
            const sourceValue = getValueByPath(payload, mapping.source[0]);
            const splitValues = sourceValue.split(mapping.delimiter);

            for (let j = 0; j < mapping.destination.length; j++) {
              const dest = mapping.destination[j].split('.')[1];
              const destType = mapping.destination[j].split('.')[0];

              if (destType === 'redis') {
                dataCache[dest] = splitValues[j];
              }
              if (destType === 'transactionDetails') {
                transactionRelationship[dest] = splitValues[j];
              }
            }
            continue;
          }

          let dataCacheValue = mapping.prefix ?? '';
          let transactionRelationshipValue = mapping.prefix ?? '';

          // REAL LOGIC STARTS HERE
          // Iterate through sources to build the value based on mapping - totally dynamic work
          for (let i = 0; i < sources.length; i++) {
            if (type === 'redis') {
              dataCacheValue += getValueByPath(payload, sources[i]);

              if (i < sources.length - 1) {
                dataCacheValue += separator;
              }
            }
            if (type === 'transactionDetails') {
              transactionRelationshipValue += getValueByPath(payload, sources[i]);

              if (i < sources.length - 1) {
                transactionRelationshipValue += separator;
              }
            }
          }

          // Post processing for both dataCache and transactionRelationship
          if (type === 'redis') {
            dataCacheValue += mapping.suffix ?? '';

            if (stringSize === 3) {
              destination = mapping.destination.split('.')[2];
              // Handle nested object case
              const objectName: string = mapping.destination.split('.')[1]; // instdAmt or intrBkSttlmAmt
              dataCache[objectName] ??= {};
              dataCache[objectName][destination] = dataCacheValue;
            } else {
              dataCache[destination] = dataCacheValue;
            }
          }

          if (type === 'transactionDetails') {
            transactionRelationshipValue += mapping.suffix ?? '';

            transactionRelationship[destination] = transactionRelationshipValue;

            // Fix the case sensitivity issue
            if (destination === 'EndToEndId') {
              // Changed from 'endToEndId' to 'EndToEndId'
              endToEndId = transactionRelationshipValue;
            }
          }
        }
      } catch (error) {
        this.loggerService.error(`Failed to process mapping data: ${String(error)}`);
        return {
          dataCache,
          transactionRelationship,
          endToEndId,
          dynamicMapping,
        };
      }
    } else {
      this.loggerService.log(`No mapping configured for endpoint: ${endpoint}`);
    }

    this.loggerService.log(`Completed processing mappings for endpoint: ${endpoint}`, this.LOG_CONTEXT);
    this.loggerService.log(`Transaction Relationship: ${JSON.stringify(transactionRelationship)}`, this.LOG_CONTEXT);

    return {
      dataCache,
      transactionRelationship,
      endToEndId,
      dynamicMapping,
    };
  }

  /**
   * Executes configured functions based on the mapping configuration
   * @param payload The payload to extract data from
   * @param configuredMapping The mapping configuration containing functions to execute
   */
  @ApmSpan('dems-execute-configured-functions')
  private async executeConfiguredFunctions(
    payload: any,
    configuredMapping: any,
    configuredFunctions: any,
    transactionRelationship: TransactionDetails,
  ): Promise<void> {
    let containsSaveTransactionRelationship = false;
    this.loggerService.error(
      `starting to execute configured functions based on mapping configuration ${JSON.stringify(transactionRelationship)}`,
      this.LOG_CONTEXT,
    );

    if (configuredFunctions) {
      for (const row of configuredFunctions) {
        // prepare params (getPayloadByPath) --> and call each function one by one
        const functionToCall = row.functionName;
        let sources = row.params ?? [];

        if (functionToCall === 'saveTransactionDetails') {
          containsSaveTransactionRelationship = true;
          continue;
        }

        if (functionToCall === 'addDataModelTable') {
          // dynamically build the table name using TenantId and param from mapping
          const tenantId = getValueByPath(payload, 'TenantId');
          const tableNameParam = row.tableName.split('_')[1]; // e.g., 'car' from 'tenantid_car'
          const tableName = `${tenantId.toLowerCase()}_${tableNameParam.toLowerCase()}`;

          this.loggerService.log(`Dynamically constructed table name: ${tableName} for function: ${functionToCall}`);

          continue;
        }

        sources = processSourceMapping(sources, configuredMapping, payload);

        try {
          await this.databaseOperationsService[functionToCall](...Object.values(sources));
        } catch (error) {
          const errorMessage = `Function '${functionToCall}' failed: ${String(error)}`;
          this.loggerService.error(errorMessage, '', this.LOG_CONTEXT);
          throw new Error(errorMessage, { cause: error });
        }
      }
    }

    this.loggerService.error('aik step pehle bas - Executing configured function: saveTransactionRelationship', this.LOG_CONTEXT);
    this.loggerService.error(`Transaction Relationship to save: ${JSON.stringify(transactionRelationship)}`, this.LOG_CONTEXT);

    if (containsSaveTransactionRelationship) {
      try {
        await this.databaseOperationsService.saveTransactionRelationship(transactionRelationship);
      } catch (error) {
        const errorMessage = `Function 'saveTransactionDetails' failed: ${String(error)}`;
        this.loggerService.error(errorMessage, '', this.LOG_CONTEXT);
        throw new Error(errorMessage, { cause: error });
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
    this.loggerService.log(`Building Tazama payload for transaction type: ${transactionType}, tenant: ${tenantId}`, this.LOG_CONTEXT);
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
   * @param TransactionDetails The transaction relationship data
   */
  @ApmSpan('dems-save-transaction-and-notify')
  async saveTransactionDataAndNotify(tazamaPayload: TazamaPayload, transactionType: string, endToEndId: string): Promise<void> {
    try {
      await Promise.all([
        this.databaseOperationsService.saveTransactionHistory(tazamaPayload, `${transactionType}_${endToEndId}`),
        // this.databaseOperationsService.saveTransactionRelationship(transactionRelationship),
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

      this.loggerService.error(errorMessage, '', this.LOG_CONTEXT);
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
    this.loggerService.warn(`Building error response: ${message}`, this.LOG_CONTEXT);
    return {
      isMatch: false,
      message,
      differences,
      ...(schema && { schema }),
    };
  }

  @ApmSpan('dems-handle-message')
  async handleMessage(payload: any, endpoint: string, tenantId: string, isPayloadXml: boolean): Promise<ErrorResponse | ProcessingResult> {
    let transformedPayload: any; //contains the XML --> JSON converted payload

    if (isPayloadXml) {
      const schemaResult = await this.findSchemaAndMapping(endpoint);
      if (!schemaResult) {
        return this.buildErrorResponse('Schema not found for the specified endpoint', ['No schema exists for this endpoint']);
      }

      const [configuredSchema] = schemaResult;
      const { stringFields } = returnArrayFieldsFromSchema(configuredSchema);

      const options: ParserOptions = {
        explicitArray: false, // Don't wrap single values in arrays
        ignoreAttrs: false, // Include attributes
        mergeAttrs: true, // Merge attributes with element content
        explicitRoot: true, // Don't include root wrapper
        explicitChildren: true,
        normalize: true,
        valueProcessors: [createSchemaAwareNumberProcessor(stringFields)], // Use custom processor
      };

      // eslint-disable-next-line promise/avoid-new -- we need to wrap xml2js parseString in a promise
      transformedPayload = await new Promise((resolve, reject) => {
        parseString(payload, options, (err, result) => {
          if (err) {
            reject(err);
          } else {
            resolve(result);
          }
        });
      });
    }

    try {
      // refer to /docs/helpers for example schema and mapping configuration
      const result = await this.findSchemaAndMapping(endpoint);
      if (!result) {
        return this.buildErrorResponse('Schema not found for the specified endpoint', ['No schema exists for this endpoint']);
      }

      const [configuredSchema, configuredMapping, configuredFunctions] = result;

      if (isPayloadXml) {
        // below are all the array fields and string fields in the schema for XML case
        const { arrayFields } = returnArrayFieldsFromSchema(configuredSchema);

        // Convert the transformed payload to ensure array fields are properly formatted
        // Note: We don't need string conversion here anymore since the parser handles it
        payload = replaceObjectsWithArrays(transformedPayload, arrayFields, [], this.loggerService);
      }

      const validationResult = await this.validatePayload(payload, configuredSchema, endpoint, tenantId);
      if (!validationResult.isValid) {
        const MIN_DIFFERENCES_INDEX = 0;
        const errorMessage = validationResult.differences?.[MIN_DIFFERENCES_INDEX]?.includes('AJV validation error')
          ? 'Error during schemaa validation'
          : 'Payload structure does not match the schema';
        return this.buildErrorResponse(errorMessage, validationResult.differences ?? [], configuredSchema);
      }

      const transactionType = extractTransactionType(endpoint);

      // this is required as per event-director payload structure
      const enhancedRequest = { ...payload, TenantId: tenantId, TxTp: transactionType };

      // refer to /docs/helpers for example mapping configuration
      const responseFromProcessMappings = await this.processMappings(enhancedRequest, configuredMapping, endpoint);
      this.loggerService.log(`response from process mapping dikhao: ${JSON.stringify(responseFromProcessMappings)}`, this.LOG_CONTEXT);
      const { dataCache, transactionRelationship, endToEndId } = responseFromProcessMappings;
      this.loggerService.log('Successfully processed mappings for ED. all ok');
      this.loggerService.log(
        `at handle message seeing transactionRRelationship: ${JSON.stringify(transactionRelationship)}`,
        this.LOG_CONTEXT,
      );

      try {
        // refer to /docs/helpers for example functions configuration
        await this.executeConfiguredFunctions(enhancedRequest, configuredMapping, configuredFunctions, transactionRelationship);
      } catch (error) {
        return this.buildErrorResponse('the configured functions', [`Function execution failed: ${String(error)}`]);
      }

      const tazamaPayload = this.buildTazamaPayload(enhancedRequest, transactionType, tenantId, dataCache);
      this.loggerService.log('Successfully built Tazama payload for ED. all ok');

      return {
        success: true,
        configuredSchema,
        tazamaPayload,
        transactionRelationship,
        dataCache,
        transactionType,
        endToEndId,
        dynamicMapping: responseFromProcessMappings.dynamicMapping,
      };
    } catch (error) {
      this.loggerService.error(`Unexpected error in handleMessage: ${String(error)}`);
      return this.buildErrorResponse('Unexpected error occurred while processing message', [`Internal error: ${String(error)}`]);
    }
  }
}
