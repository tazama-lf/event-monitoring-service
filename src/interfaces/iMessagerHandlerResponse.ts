import type { TransactionDetails } from '@tazama-lf/frms-coe-lib/lib/interfaces';

export interface MessageHandlerResponse {
  message: string;
  isMatch: boolean;
  transactionRelationship: TransactionDetails;
  dynamicMapping?: unknown;
  schema: unknown;
  payload: unknown;
}
