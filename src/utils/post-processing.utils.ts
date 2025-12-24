import type { TransactionDetails } from '../interfaces/iTransactionRelationship';
import { handleThirdLevelMapping } from './third-level-mapping.utils';

/**
 * Handles post processing for both dataCache and transactionRelationship
 * @param dataCacheValue The data cache value to process
 * @param transactionRelationshipValue The transaction relationship value to process
 * @param mapping The mapping configuration
 * @param dataCache The data cache object to update
 * @param transactionRelationship The transaction relationship object to update
 * @returns The endToEndId if the destination is 'EndToEndId', otherwise empty string
 */
export function handlePostProcessing(
  dataCacheValue: string,
  transactionRelationshipValue: string,
  mapping: any,
  dataCache: any,
  transactionRelationship: TransactionDetails,
): string {
  let endToEndId = '';

  let type: string;
  let pathParts: number;
  let destination: string;

  if (typeof mapping.destination === 'string') {
    const parts = mapping.destination.split('.');
    if (parts.length < 2) {
      throw new Error(`Invalid mapping destination format: ${mapping.destination}`);
    }
    type = parts[0];
    pathParts = parts.length;
    destination = parts[1];
  } else {
    type = mapping.destination;
    pathParts = -1;
    destination = mapping.destination;
  }

  if (type === 'redis') {
    dataCacheValue += mapping.suffix ?? '';

    // Convert to appropriate type based on mapping.type field
    let finalValue: any = dataCacheValue;
    if (mapping.type === 'number') {
      const numValue = Number(dataCacheValue);
      if (!isNaN(numValue)) {
        finalValue = numValue;
      }
    }

    if (pathParts === 3) {
      handleThirdLevelMapping(mapping, finalValue, dataCache);
    } else {
      dataCache[destination] = finalValue;
    }
  } else {
    transactionRelationshipValue += mapping.suffix ?? '';

    // Convert to appropriate type for transaction details
    let finalValue: any = transactionRelationshipValue;
    if (mapping.type === 'number') {
      const numValue = Number(transactionRelationshipValue);
      if (!isNaN(numValue)) {
        finalValue = numValue;
      }
    }

    transactionRelationship[destination] = finalValue;

    if (destination === 'EndToEndId') {
      endToEndId = transactionRelationshipValue;
    }
  }

  return endToEndId;
}
