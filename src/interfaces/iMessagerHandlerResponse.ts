import type { TransactionDetails } from './iTransactionRelationship';

export interface MessageHandlerResponse {
  message: string;
  isMatch: boolean;
  transactionRelationship: TransactionDetails;
  dynamicMapping?: unknown;
  schema: unknown;
  payload: unknown;
}
