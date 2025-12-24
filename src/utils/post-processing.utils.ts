import type { TransactionDetails } from '../interfaces/iTransactionRelationship';

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

  const type = typeof mapping.destination === 'string' ? mapping.destination.split('.')[0] : mapping.destination;
  const stringSize = typeof mapping.destination === 'string' ? mapping.destination.split('.').length : -1;
  let destination = typeof mapping.destination === 'string' ? mapping.destination.split('.')[1] : mapping.destination;

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

    if (stringSize === 3) {
      destination = mapping.destination.split('.')[2];
      // Handle nested object case
      const objectName: string = mapping.destination.split('.')[1]; // instdAmt or intrBkSttlmAmt
      dataCache[objectName] ??= {};
      dataCache[objectName][destination] = finalValue;
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
