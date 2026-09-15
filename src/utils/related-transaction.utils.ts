import type { LoggerService, RedisService } from '@tazama-lf/frms-coe-lib';
import { getValueByPath } from './has_nested_property';
import type { DatabaseOperationsService } from '../commons';

interface Mapping {
  source: string[] | string;
  delimiter?: string;
  destination: string | string[];
  transformation?: string;
  type?: string;
}

interface ProcessRelatedTransactionParams {
  relatedMapping: any;
  relatedTransaction: string;
  configuredMapping: any;
  enhancedRequest: any;
  tenantId: string;
  loggerService: LoggerService;
  logContext: string;
  databaseOperationsService: DatabaseOperationsService;
  processMappings: (payload: any, mapping: any, endpoint: string, relatedTransactionBoolean: boolean) => Promise<{ dataCache: any }>;
  /** Optional: when omitted, always falls back to the database lookup. */
  redisService?: RedisService;
}

interface ProcessRelatedTransactionResult {
  relatedTransactionBoolean: boolean;
  enhancedRequest: any;
}

export async function processRelatedTransactionMapping(params: ProcessRelatedTransactionParams): Promise<ProcessRelatedTransactionResult> {
  const {
    relatedMapping,
    relatedTransaction,
    configuredMapping,
    enhancedRequest,
    tenantId,
    loggerService,
    logContext,
    databaseOperationsService,
    processMappings,
    redisService,
  } = params;

  let relatedPayload: any = null;
  let relatedTransactionBoolean = false;

  if (relatedMapping) {
    loggerService.log('Processing related transaction mapping for related transaction: ', relatedTransaction, logContext);

    const endToEndMapping = configuredMapping.find((mapping: Mapping) => mapping.destination === 'transactionDetails.EndToEndId');
    const relatedPayloadPath = Array.isArray(endToEndMapping?.source) ? endToEndMapping?.source[0] : endToEndMapping?.source;

    loggerService.log('relatedPayloadPath is : ', relatedPayloadPath);

    const relatedEndToEndId = getValueByPath(enhancedRequest, relatedPayloadPath);
    relatedTransactionBoolean = true;

    // Check Redis first for a cached DataCache before falling back to the database lookup + remap.
    const distributedCacheKey = `${tenantId}:${relatedEndToEndId}`;
    let cachedDataCache: any = null;
    if (redisService) {
      try {
        const cachedJson = await redisService.getJson(distributedCacheKey);
        if (cachedJson) {
          cachedDataCache = typeof cachedJson === 'string' ? JSON.parse(cachedJson) : cachedJson;
          loggerService.log(`DataCache cache hit for related transaction at key: ${distributedCacheKey}`, logContext);
        }
      } catch (error) {
        // Corrupt/unparseable cache entry — treat exactly like a miss, fall back to the database.
        loggerService.warn(`Failed to read/parse cached DataCache at key ${distributedCacheKey}: ${String(error)}`, logContext);
      }
    }

    if (cachedDataCache) {
      enhancedRequest.DataCache = { ...enhancedRequest.DataCache, ...cachedDataCache };
    } else {
      loggerService.log(`DataCache cache miss for related transaction at key: ${distributedCacheKey}. Querying database...`, logContext);

      let tableName: string;
      const firstPart = relatedTransaction.split('/')[4];
      if (firstPart.includes('.')) {
        tableName = firstPart.split('.')[0] + firstPart.split('.')[1];
      } else {
        tableName = firstPart;
      }

      relatedPayload = await databaseOperationsService.getTransaction(relatedEndToEndId, tenantId, tableName);
      const responseFromRelatedProcessMappings = await processMappings(relatedPayload, relatedMapping, relatedTransaction, false);

      enhancedRequest.DataCache = { ...enhancedRequest.DataCache, ...responseFromRelatedProcessMappings.dataCache };
    }
  } else {
    loggerService.log('No related transaction mapping found, skipping related transaction processing', logContext);
  }

  return {
    relatedTransactionBoolean,
    enhancedRequest,
  };
}
