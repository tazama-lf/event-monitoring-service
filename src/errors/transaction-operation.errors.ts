/**
 * Custom error classes for transaction operations
 * These errors provide typed error handling with specific error codes
 * for different failure scenarios in the transaction processing pipeline
 */

export enum TransactionErrorCode {
  SAVE_HISTORY_FAILED = 'SAVE_HISTORY_FAILED',
  SAVE_RELATIONSHIP_FAILED = 'SAVE_RELATIONSHIP_FAILED',
  NOTIFY_EVENT_DIRECTOR_FAILED = 'NOTIFY_EVENT_DIRECTOR_FAILED',
  UNKNOWN_OPERATION_FAILED = 'UNKNOWN_OPERATION_FAILED',
}

/**
 * Base error class for transaction operations
 */
export class TransactionOperationError extends Error {
  public readonly code: TransactionErrorCode;
  public readonly originalError: unknown;

  constructor(message: string, code: TransactionErrorCode, originalError: unknown) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.originalError = originalError;

    // Maintains proper stack trace for where our error was thrown (only available on V8)

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Ensure code doesn't break on non-V8 environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Error thrown when saving transaction history fails
 */
export class SaveTransactionHistoryError extends TransactionOperationError {
  constructor(originalError: unknown, key?: string) {
    const message = key ? `Failed to save transaction history for key: ${key}` : 'Failed to save transaction history';
    super(message, TransactionErrorCode.SAVE_HISTORY_FAILED, originalError);
  }
}

/**
 * Error thrown when saving transaction relationship fails
 */
export class SaveTransactionRelationshipError extends TransactionOperationError {
  constructor(originalError: unknown, relationship?: string) {
    const message = relationship ? `Failed to save transaction relationship: ${relationship}` : 'Failed to save transaction relationship';
    super(message, TransactionErrorCode.SAVE_RELATIONSHIP_FAILED, originalError);
  }
}

/**
 * Error thrown when notifying event director fails
 */
export class NotifyEventDirectorError extends TransactionOperationError {
  constructor(originalError: unknown) {
    super('Failed to notify event-director', TransactionErrorCode.NOTIFY_EVENT_DIRECTOR_FAILED, originalError);
  }
}
