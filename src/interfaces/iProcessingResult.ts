import type { CacheData } from './iCacheData';
import type { TazamaPayload } from './iTazamaPayload';
import type { TransactionDetails, TrackedFields } from '@tazama-lf/frms-coe-lib/lib/interfaces';

export interface ProcessingResult {
  success: boolean;
  configuredSchema: any;
  tazamaPayload: TazamaPayload;
  dynamicMapping?: any;
  transactionRelationship: TransactionDetails;
  DataCache: CacheData;
  transactionType: string;
  endToEndId: string;
  trackedFields: TrackedFields;
}
