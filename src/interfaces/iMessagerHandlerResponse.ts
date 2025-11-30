import type { TransactionDetails } from './iTransactionRelationship';

export interface MessageHandlerResponse {
  message: string;
  isMatch: boolean;
  transactionRelationship: TransactionDetails;
  schema: unknown;
  payload: unknown;
}
