import type { ErrorResponse } from '../interfaces/iErrorResponse';
import type { TazamaPayload } from '../interfaces/iTazamaPayload';

/**
 * Builds the Tazama payload object
 * @param payload The original payload
 * @param transactionType The extracted transaction type
 * @param dataCache The processed data cache
 * @returns The formatted Tazama payload
 */
export function buildTazamaPayload(payload: any, transactionType: string, dataCache: any): TazamaPayload {
  return {
    transaction: payload,
    TxTp: transactionType,
    DataCache: dataCache,
  };
}

/**
 * Builds an error response object
 * @param message The error message
 * @param differences Array of validation differences
 * @param schema Optional schema object
 * @returns Formatted error response
 */
export function buildErrorResponse(message: string, differences: string[], schema?: any): ErrorResponse {
  return {
    isMatch: false,
    message,
    differences,
    ...(schema && { schema }),
  };
}
