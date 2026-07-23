import type { LoggerService } from '@tazama-lf/frms-coe-lib';
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
  } = params;

  let relatedPayload: any = null;
  let relatedTransactionBoolean = false;

  if (relatedMapping) {
    loggerService.log('Processing related transaction mapping for related transaction: ', relatedTransaction, logContext);

    const endToEndMapping = configuredMapping.find((mapping: Mapping) => mapping.destination === 'transactionDetails.EndToEndId');
    const relatedPayloadPath = Array.isArray(endToEndMapping?.source) ? endToEndMapping?.source[0] : endToEndMapping?.source;

    loggerService.log('relatedPayloadPath is : ', relatedPayloadPath);

    const relatedEndToEndId = getValueByPath(enhancedRequest, relatedPayloadPath);

    let tableName: string;
    const firstPart = relatedTransaction.split('/')[4];
    if (firstPart.includes('.')) {
      tableName = firstPart.split('.')[0] + firstPart.split('.')[1];
    } else {
      tableName = firstPart;
    }

    relatedPayload = await databaseOperationsService.getTransaction(relatedEndToEndId, tenantId, tableName);
    relatedTransactionBoolean = true;
    const responseFromRelatedProcessMappings = await processMappings(relatedPayload, relatedMapping, relatedTransaction, false);

    enhancedRequest.DataCache = { ...enhancedRequest.DataCache, ...responseFromRelatedProcessMappings.dataCache };
  } else {
    loggerService.log('No related transaction mapping found, skipping related transaction processing', logContext);
  }

  return {
    relatedTransactionBoolean,
    enhancedRequest,
  };
}
