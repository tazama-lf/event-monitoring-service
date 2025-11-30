import type { CacheData } from './iCacheData';
import type { TazamaPayload } from './iTazamaPayload';
import type { TransactionDetails } from './iTransactionRelationship';

export interface ProcessingResult {
  success: boolean;
  configuredSchema: any;
  tazamaPayload: TazamaPayload;
  transactionRelationship: TransactionDetails;
  dataCache: CacheData;
  transactionType: string;
  endToEndId: string;
}
