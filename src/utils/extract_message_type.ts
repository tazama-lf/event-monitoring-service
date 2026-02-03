/**
 * Extracts the transaction type from a URL path
 * @param url The URL path (e.g., '/v1/evaluate/iso20022/pacs.008.001.10')
 * @returns The transaction type (e.g., 'pacs.008.001.10')
 */
export const extractTransactionType = (url: string): string => {
  const parts = url.split('/');
  const transactionType = parts[parts.length - 1]; // Get the last part

  return transactionType || 'unknown';
};
