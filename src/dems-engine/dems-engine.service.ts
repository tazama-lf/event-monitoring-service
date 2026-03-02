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
import { handleConstantValue } from '../utils/constant-value.utils';
import { handleDynamicMapping } from '../utils/dynamic-mapping.utils';
import { handleSplitValue } from '../utils/split-value.utils';
import { handlePostProcessing } from '../utils/post-processing.utils';
import { handleConcatenation } from '../utils/concatenation.utils';
import { randomUUID } from 'node:crypto';
import type { TransactionDetails } from '@tazama-lf/frms-coe-lib/lib/interfaces';
import { ErrorResponse } from '../interfaces/iErrorResponse';
import { ProcessingResult } from '../interfaces/iProcessingResult';
import { TazamaPayload } from '../interfaces/iTazamaPayload';
import { formatValidationErrors } from '../utils/validation.utils';
import { buildTazamaPayload, buildErrorResponse } from '../utils/payload-builder.utils';
import { parseCachedSchema, prepareSchemaForCache } from '../utils/schema-cache.utils';
import { SaveTransactionHistoryError, NotifyEventDirectorError, TransactionOperationError } from '../errors/transaction-operation.errors';
import type { trackedFields } from '@tazama-lf/frms-coe-lib';

type FindSchemaAndMappingResult = [any, any, any, any] | null;

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
    // latest change here is: it also fetches relatedTransaction now
    this.loggerService.log(`Looking up schema for endpoint: ${endpoint}`);

    const cacheKey = endpoint;
    const cachedSchema = await this.redisService.getJson(cacheKey);

    if (cachedSchema) {
      this.loggerService.log(`Cache hit for endpoint: ${endpoint}`);
      const parsedResult = parseCachedSchema(cachedSchema, endpoint, this.loggerService);
      if (parsedResult) {
        return parsedResult;
      }
    }

    // not found in cache, query the database
    this.loggerService.log(`Cache miss for endpoint: ${endpoint}. Querying database...`);
    const result = await this.databaseService.query(
      "SELECT schema, mapping, functions, related_transaction, publishing_status FROM tcs_config WHERE endpoint_path = $1 and publishing_status = 'active'",
      [endpoint],
    );
    const [record] = result.rows;
    if (result.rows.length) {
      this.loggerService.log(`Found schema for endpoint: ${endpoint}`);
      const data = prepareSchemaForCache(record);
      await this.redisService.setJson(cacheKey, JSON.stringify(data), this.timeToLive);

      return [record.schema, record.mapping, record.functions, record.related_transaction] as [any, any, any, any];
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
      const differences: string[] = formatValidationErrors(this.ajv.errors);
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
    relatedTransactionBoolean: boolean, //this line has been added because pacs002 main 2 baar chalega processMApping
  ): Promise<{
    dataCache: any;
    transactionRelationship: TransactionDetails;
    endToEndId: string;
    dynamicMapping?: any;
    trackedFields: ProcessingResult['trackedFields'];
  }> {
    // static object creation logic
    const dataCache: any = {};
    const transactionRelationship: TransactionDetails = {
      source: '',
      destination: '',
      TxTp: '',
      TenantId: '',
      MsgId: '',
      CreDtTm: '',
      Amt: 0,
      Ccy: '',
      EndToEndId: '',
      lat: '',
      long: '',
      TxSts: '',
    };

    const dynamicMapping: any = {};
    if (relatedTransactionBoolean) {
      // console.log('relatedTransactionBoolean is : ', relatedTransactionBoolean);
    }

    // Track specific fields for database storage
    const trackedFields: trackedFields = {
      CreDtTm: '',
      MsgId: '',
      EndToEndId: '',
      dbtrAcctId: '',
      cdtrAcctId: '',
      TenantId: '',
    };

    let endToEndId = '';
    this.loggerService.log(`Processing mappings for endpoint: ${endpoint}`, this.LOG_CONTEXT);

    if (configuredMapping) {
      this.loggerService.log('configuredMapping is: ', JSON.stringify(configuredMapping));
      try {
        for (const mapping of configuredMapping) {
          const logthis = mapping.destination.split('.')[1];
          this.loggerService.log(`Processing mapping: ${JSON.stringify(logthis)}`, this.LOG_CONTEXT);
          const sources = mapping.source;
          const separator = mapping.delimiter;

          //usually a string but can be array in case of multiple sources(split usecase)
          const destination = typeof mapping.destination === 'string' ? mapping.destination.split('.')[1] : mapping.destination;
          const type = typeof mapping.destination === 'string' ? mapping.destination.split('.')[0] : mapping.destination;

          // handling multiple destinations for single source - split value usecase
          if (typeof destination !== 'string' || typeof type !== 'string') {
            handleSplitValue(mapping, payload, dataCache, transactionRelationship);
            continue;
          }

          // dynamic mapping logic based on datasource(datamodel ya payload)
          if (type !== 'redis' && type !== 'transactionDetails') {
            handleDynamicMapping(mapping, payload, dynamicMapping, this.loggerService);
            continue;
          }

          //constant value injection logic
          if (mapping.constantValue) {
            handleConstantValue(mapping, dataCache, transactionRelationship, type, destination);
            continue;
          }

          let dataCacheValue = mapping.prefix ?? '';
          let transactionRelationshipValue = mapping.prefix ?? '';

          // concatenation logic for multiple sources
          const concatenationResult = handleConcatenation(sources, payload, type, mapping.prefix ?? '', separator);
          dataCacheValue = concatenationResult.dataCacheValue;
          transactionRelationshipValue = concatenationResult.transactionRelationshipValue;

          // Post processing for both dataCache and transactionRelationship
          const postProcessingEndToEndId = handlePostProcessing(
            dataCacheValue,
            transactionRelationshipValue,
            mapping,
            dataCache,
            transactionRelationship,
            relatedTransactionBoolean,
          );
          if (postProcessingEndToEndId) {
            endToEndId = postProcessingEndToEndId;
          }
        }
      } catch (error) {
        this.loggerService.error(`Failed to process mapping data: ${String(error)}`);
        return {
          dataCache,
          transactionRelationship,
          endToEndId,
          dynamicMapping,
          trackedFields,
        };
      }
    } else {
      this.loggerService.log(`No mapping configured for endpoint: ${endpoint}`);
    }

    this.loggerService.log(`Completed processing mappings for endpoint: ${endpoint}`, this.LOG_CONTEXT);
    this.loggerService.log(`Transaction Relationship: ${JSON.stringify(transactionRelationship)}`, this.LOG_CONTEXT);

    // simple extraction
    trackedFields.CreDtTm = transactionRelationship.CreDtTm;
    trackedFields.MsgId = transactionRelationship.MsgId;
    trackedFields.EndToEndId = transactionRelationship.EndToEndId;
    trackedFields.dbtrAcctId = dataCache.dbtrAcctId ?? null;
    trackedFields.cdtrAcctId = dataCache.cdtrAcctId ?? null;
    trackedFields.TenantId = transactionRelationship.TenantId;

    this.loggerService.log(`Tracked fields: ${JSON.stringify(trackedFields)}`, this.LOG_CONTEXT);

    return {
      dataCache,
      transactionRelationship,
      endToEndId,
      dynamicMapping,
      trackedFields,
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
    dynamicMapping: any,
    trackedFields: trackedFields,
  ): Promise<void> {
    let containsSaveTransactionRelationship = false;
    this.loggerService.log(
      `starting to execute configured functions based on mapping configuration ${JSON.stringify(transactionRelationship)}`,
      this.LOG_CONTEXT,
    );

    if (configuredFunctions) {
      for (const row of configuredFunctions) {
        // prepare params (getPayloadByPath) --> and call each function one by one
        const functionToCall = row.functionName;
        this.loggerService.log(`function to call is : ${functionToCall}`);
        let sources = row.params ?? [];

        const ALLOWED_DB_FUNCTIONS = [
          'addAccount',
          'addEntity',
          'addAccountHolder',
          'saveTransactionHistory',
          'addDataModelTable',
          'saveTransactionDetails',
        ];
        if (!ALLOWED_DB_FUNCTIONS.includes(functionToCall)) {
          throw new Error(`Function '${functionToCall}' is not in the allowed functions list`);
        }

        if (functionToCall === 'saveTransactionDetails') {
          containsSaveTransactionRelationship = true;
          continue;
        }

        if (functionToCall === 'addDataModelTable') {
          // dynamically build the table name using TenantId and param from mapping
          if (!row.columns || !Array.isArray(row.columns) || row.columns.length < 2) {
            throw new Error('Invalid configuration for addDataModelTable: columns must have at least 2 entries');
          }

          const { tableName } = row;

          if (!tableName || typeof tableName !== 'string') {
            throw new Error(`Invalid table name configuration for addDataModelTable: ${tableName}`);
          }

          this.loggerService.log(`table name: ${tableName} for function: ${functionToCall} `);
          this.loggerService.log(`params are : ${JSON.stringify(row)}`);

          // access the value from dynamicMapping object
          const primaryKeyValue = getValueByPath(dynamicMapping, row.columns[0].param);

          let dataValue;
          // access the value conditionally from dynamicMapping or payload based on datasource
          if (row.columns[1].datasource === 'dataModel') {
            dataValue = getValueByPath(dynamicMapping, row.columns[1].param);
          } else {
            dataValue = getValueByPath(payload, row.columns[1].param);
          }

          this.loggerService.log(`the primary key value is : ${primaryKeyValue} and data value is : ${JSON.stringify(dataValue)}`);

          // async addDataModelTable(tableName: string, primaryKey: string, data: any)
          await this.databaseOperationsService[functionToCall](tableName, primaryKeyValue, dataValue);
          continue;
        }

        if (functionToCall === 'saveTransactionHistory') {
          this.loggerService.log(`the tracked fields are ${JSON.stringify(trackedFields)}`, this.LOG_CONTEXT);

          await this.databaseOperationsService[functionToCall](...Object.values(sources), trackedFields);
          continue;
        }

        // process only when it exists.
        if (configuredMapping?.length > 0) {
          sources = processSourceMapping(sources, configuredMapping, payload);
        }

        try {
          await this.databaseOperationsService[functionToCall](...Object.values(sources));
        } catch (error) {
          const errorMessage = `Function '${functionToCall}' failed: ${String(error)}`;
          this.loggerService.error(errorMessage, '', this.LOG_CONTEXT);
          throw new Error(errorMessage, { cause: error });
        }
      }
    }

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
   * Saves transaction data and sends notification to event director
   * @param tazamaPayload The Tazama payload to process
   * @param transactionType The transaction type
   * @param endToEndId The end-to-end ID for the transaction
   * @param TransactionDetails The transaction relationship data
   */
  @ApmSpan('dems-save-transaction-and-notify')
  async saveTransactionDataAndNotify(
    tazamaPayload: TazamaPayload,
    transactionType: string,
    endToEndId: string,
    trackedFields?: trackedFields,
  ): Promise<void> {
    // using Promise.allSettled, instead of promise.all, to execute operations and capture individual results
    const results = await Promise.allSettled([
      this.databaseOperationsService.saveTransactionHistory(tazamaPayload, `${transactionType}_${endToEndId}`, trackedFields),
      this.natsService.notifyEventDirector(tazamaPayload),
    ]);

    // Check for failures and categorize them by index and error type
    const failures: string[] = [];

    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        const error = result.reason;

        // Use instanceof checks for reliable error categorization
        if (error instanceof SaveTransactionHistoryError) {
          failures.push(`Failed to save transaction history: ${error.message}`);
          this.loggerService.error(error.message, String(error.originalError), this.LOG_CONTEXT);
        } else if (error instanceof NotifyEventDirectorError) {
          failures.push(`Failed to notify event-director: ${error.message}`);
          this.loggerService.error(error.message, String(error.originalError), this.LOG_CONTEXT);
        } else if (error instanceof TransactionOperationError) {
          // Catch any other typed transaction errors
          failures.push(`Operation failed: ${error.message}`);
          this.loggerService.error(error.message, String(error.originalError), this.LOG_CONTEXT);
        } else {
          // Fallback for unexpected error types - use index to identify operation
          const operationName = index === 0 ? 'save transaction history' : 'notify event-director';
          failures.push(`Failed to ${operationName}: ${String(error)}`);
          this.loggerService.error(`Unexpected error in ${operationName}`, String(error), this.LOG_CONTEXT);
        }
      }
    });

    // If any operations failed, throw an error with all failure details
    if (failures.length > 0) {
      const errorMessage = failures.join('; ');
      throw new Error(errorMessage);
    }

    this.loggerService.log('Successfully saved transaction history and notified event-director');
  }

  @ApmSpan('dems-handle-message')
  async handleMessage(payload: any, endpoint: string, tenantId: string, isPayloadXml: boolean): Promise<ErrorResponse | ProcessingResult> {
    let transformedPayload: any; //contains the XML --> JSON converted payload

    try {
      // refer to /docs/helpers for example schema and mapping configuration
      const result = await this.findSchemaAndMapping(endpoint);
      if (!result) {
        this.loggerService.warn('Building error response: Schema not found for the specified endpoint', this.LOG_CONTEXT);
        return buildErrorResponse('Schema not found for the specified endpoint', ['No schema exists for this endpoint']);
      }

      const [configuredSchema, configuredMapping, configuredFunctions, relatedTransaction] = result;

      this.loggerService.log(`Schema and mapping retrieved for endpoint: ${endpoint}`, this.LOG_CONTEXT);
      this.loggerService.log(`Related transaction: ${JSON.stringify(relatedTransaction)}`, this.LOG_CONTEXT);

      if (isPayloadXml) {
        const { stringFields, arrayFields } = returnArrayFieldsFromSchema(configuredSchema);

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

        // Convert the transformed payload to ensure array fields are properly formatted
        // Note: We don't need string conversion here anymore since the parser handles it
        payload = replaceObjectsWithArrays(transformedPayload, arrayFields, [], this.loggerService);
      }

      const validationResult = await this.validatePayload(payload, configuredSchema, endpoint, tenantId);
      if (!validationResult.isValid) {
        const MIN_DIFFERENCES_INDEX = 0;
        const errorMessage = validationResult.differences?.[MIN_DIFFERENCES_INDEX]?.includes('AJV validation error')
          ? 'Error during schema validation'
          : 'Payload structure does not match the schema';
        this.loggerService.warn(`Building error response: ${errorMessage}`, this.LOG_CONTEXT);
        return buildErrorResponse(errorMessage, validationResult.differences ?? [], configuredSchema);
      }

      const transactionType = extractTransactionType(endpoint);

      // this is required as per event-director payload structure
      const enhancedRequest = { ...payload, TenantId: tenantId, TxTp: transactionType };

      // we need payload of relatedTransaction for both dataCache and transactionRelationship, so doing transformation once and reusing it in both places
      // console.log('relatedTransaction is : ', relatedTransaction);

      const relatedResult = relatedTransaction ? await this.findSchemaAndMapping(relatedTransaction) : null;
      const [, relatedMapping, ,] = relatedResult ?? [];
      // console.log('relatedMapping is : ', relatedMapping);
      // console.log('enhancedRequest before related transaction mapping is : ', relatedMapping);

      // in case of pacs002, the first processMapping will give the DataCache
      // second processMapping will give the transactionRelation and all others
      // so we will have to tell the second processMapping, somehow, that we have already built the dataCache and it needs to only build the transactionRelationship and other details. we can do this by passing a flag or by checking if the dataCache is empty or not. for now, we will check if the dataCache is empty or not.

      let relatedTransactionBoolean = false;
      let relatedPayload: any = null;

      // Only process related transaction if we have a related mapping configuration
      if (relatedMapping) {
        this.loggerService.log('Processing related transaction mapping for related transaction: ', relatedTransaction);
        const relatedPayloadPath = 'FIToFIPmtSts.TxInfAndSts.OrgnlEndToEndId'; //transactionDetails.endtoendit traverse
        // console.log('fetching end to end id')
        const relatedEndToEndId = getValueByPath(enhancedRequest, relatedPayloadPath);
        // console.log('end to end id is ', relatedEndToEndId)
        relatedPayload = await this.databaseOperationsService.getPacs008ByEndToEndId(relatedEndToEndId, tenantId);
        this.loggerService.log('Related payload fetched from database: ', relatedPayload);

        // console.log('related payload is ', relatedPayload)
        relatedTransactionBoolean = true;

        const responseFromRelatedProcessMappings = await this.processMappings(relatedPayload, relatedMapping, relatedTransaction, false);
        this.loggerService.log('before merging related transaction mapping, enhancedRequest is : ', enhancedRequest);

        enhancedRequest.DataCache = { ...enhancedRequest.DataCache, ...responseFromRelatedProcessMappings.dataCache };
        this.loggerService.log('enhancedRequest after merging related transaction mapping is : ', enhancedRequest);
      }

      // refer to /docs/helpers for example mapping configuration
      const responseFromProcessMappings = await this.processMappings(
        enhancedRequest,
        configuredMapping,
        endpoint,
        relatedTransactionBoolean,
      );
      const { dataCache, transactionRelationship, endToEndId, dynamicMapping, trackedFields } = responseFromProcessMappings;

      this.loggerService.log('Successfully processed mappings for ED. all ok');
      this.loggerService.log(`transactionRelationship: ${JSON.stringify(transactionRelationship)}`, this.LOG_CONTEXT);
      this.loggerService.log(`dataCache: ${JSON.stringify(dataCache)}`, this.LOG_CONTEXT);
      this.loggerService.log(`trackedFields: ${JSON.stringify(trackedFields)}`, this.LOG_CONTEXT);

      try {
        // refer to /docs/helpers for example functions configuration
        await this.executeConfiguredFunctions(
          enhancedRequest,
          configuredMapping,
          configuredFunctions,
          transactionRelationship,
          dynamicMapping,
          trackedFields,
        );
      } catch (error) {
        this.loggerService.warn('Building error response: function execution failed', this.LOG_CONTEXT);
        return buildErrorResponse('function execution failed', [String(error)]);
      }

      this.loggerService.log(`Building Tazama payload for transaction type: ${transactionType}, tenant: ${tenantId}`, this.LOG_CONTEXT);
      let tazamaPayload;
      if (relatedMapping) {
        tazamaPayload = buildTazamaPayload(enhancedRequest, transactionType, enhancedRequest.DataCache);
      } else {
        tazamaPayload = buildTazamaPayload(enhancedRequest, transactionType, dataCache);
      }
      this.loggerService.log('Successfully built Tazama payload for ED. all ok');

      return {
        success: true,
        configuredSchema,
        tazamaPayload,
        transactionRelationship,
        DataCache: relatedTransactionBoolean ? enhancedRequest.DataCache : dataCache,
        transactionType,
        endToEndId,
        dynamicMapping: responseFromProcessMappings.dynamicMapping,
        trackedFields,
      };
    } catch (error) {
      this.loggerService.error(`Unexpected error in handleMessage: ${String(error)}`);
      this.loggerService.warn('Building error response: Unexpected error occurred while processing message', this.LOG_CONTEXT);
      return buildErrorResponse('Unexpected error occurred while processing message', [`Internal error: ${String(error)}`]);
    }
  }
}
