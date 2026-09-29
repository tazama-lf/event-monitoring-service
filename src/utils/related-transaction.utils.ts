import type { LoggerService, RedisService } from '@tazama-lf/frms-coe-lib';
import { getValueByPath } from './has_nested_property';
import type { DatabaseOperationsService } from '../commons';

/**
 * Namespace for DataCache entries so they cannot collide with the schema cache, which keys
 * `{tenantId}:{endpointPath}` in the same Redis keyspace.
 */
const DATA_CACHE_KEY_PREFIX = 'data-cache';

/** Builds the namespaced DataCache key. Read and write must both go through this. */
const buildDataCacheKey = (tenantId: string, endToEndId: string): string => `${DATA_CACHE_KEY_PREFIX}:${tenantId}:${endToEndId}`;

/**
 * True only for a plain object — the shape a DataCache must have. Redis can hand back an array or a
 * primitive (e.g. a value written by another service, or a stale entry in a different format);
 * spreading either into DataCache would drop the real fields or add character-indexed keys, so
 * anything else is treated as a miss and falls back to the database.
 */
const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

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
    const distributedCacheKey = buildDataCacheKey(tenantId, relatedEndToEndId);
    let cachedDataCache: any = null;
    if (redisService) {
      try {
        const cachedJson = await redisService.getJson(distributedCacheKey);
        if (cachedJson) {
          const decoded: unknown = typeof cachedJson === 'string' ? JSON.parse(cachedJson) : cachedJson;
          if (isPlainRecord(decoded)) {
            cachedDataCache = decoded;
            loggerService.log(`DataCache cache hit for related transaction at key: ${distributedCacheKey}`, logContext);
          } else {
            // An array or primitive is not a usable DataCache — treat it as a miss.
            loggerService.warn(
              `Ignoring non-object cached DataCache at key ${distributedCacheKey}; falling back to the database`,
              logContext,
            );
          }
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

interface CacheDataCacheEntryParams {
  tenantId: string;
  endToEndId: string;
  dataCache: unknown;
  redisService: RedisService;
  ttl: number;
  loggerService: LoggerService;
  logContext: string;
}

/**
 * Writes a first-leg message's DataCache to the distributed cache, keyed the same way
 * {@link processRelatedTransactionMapping} reads it back.
 *
 * Must only be called once the transaction has been persisted AND event-director notified: writing
 * earlier would leave a usable entry behind for a message whose database write or notification then
 * failed, and a later related message would rebuild from data that was never actually persisted.
 *
 * Best-effort — a Redis failure is logged and swallowed, because the database lookup remains the
 * source of truth.
 */
export async function cacheDataCacheEntry(params: CacheDataCacheEntryParams): Promise<void> {
  const { tenantId, endToEndId, dataCache, redisService, ttl, loggerService, logContext } = params;

  if (!endToEndId || !dataCache || Object.keys(dataCache).length === 0) return;

  const distributedCacheKey = buildDataCacheKey(tenantId, endToEndId);
  try {
    await redisService.setJson(distributedCacheKey, JSON.stringify(dataCache), ttl);
  } catch (error) {
    loggerService.warn(`Failed to cache DataCache at key ${distributedCacheKey}: ${String(error)}`, logContext);
  }
}
