import type { TransactionDetails } from '@tazama-lf/frms-coe-lib/lib/interfaces';
import type { ProcessingResult } from './iProcessingResult';

export interface MessageHandlerResponse {
  message: string;
  isMatch: boolean;
  transactionRelationship: TransactionDetails;
  dynamicMapping?: unknown;
  schema: unknown;
  payload: unknown;
  trackedFields: ProcessingResult['trackedFields'];
}
