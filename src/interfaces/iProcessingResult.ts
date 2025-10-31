import { CacheData } from './iCacheData';
import { TazamaPayload } from './iTazamaPayload';
import { TransactionDetails } from './iTransactionRelationship';

export interface ProcessingResult {
  success: boolean;
  configuredSchema: any;
  tazamaPayload: TazamaPayload;
  transactionRelationship: TransactionDetails;
  dataCache: CacheData;
  transactionType: string;
  endToEndId: string;
}
