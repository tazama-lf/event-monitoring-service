import { getValueByPath } from './has_nested_property';
import type { TransactionDetails } from '../interfaces/iTransactionRelationship';

/**
 * Handles split value logic for multiple destinations from single source
 * @param mapping The mapping configuration
 * @param payload The payload to extract data from
 * @param dataCache The data cache object to update
 * @param transactionRelationship The transaction relationship object to update
 */
export function handleSplitValue(mapping: any, payload: any, dataCache: any, transactionRelationship: TransactionDetails): void {
  const sourceValue = getValueByPath(payload, mapping.source[0]);
  const splitValues = sourceValue.split(mapping.delimiter);

  for (let j = 0; j < mapping.destination.length; j++) {
    const destParts = mapping.destination[j].split('.');
    const destType = destParts[0];
    const dest = destParts[1];
    const stringSize = destParts.length;

    // Convert to appropriate type based on mapping.type field
    let finalValue: any = splitValues[j];
    if (mapping.type === 'number') {
      const numValue = Number(splitValues[j]);
      if (!isNaN(numValue)) {
        finalValue = numValue;
      }
    }

    if (destType === 'redis') {
      if (stringSize === 3) {
        // Handle nested object case
        const objectName = destParts[1];
        const nestedDest = destParts[2];
        dataCache[objectName] ??= {};
        dataCache[objectName][nestedDest] = finalValue;
      } else {
        dataCache[dest] = finalValue;
      }
    }
    if (destType === 'transactionDetails') {
      transactionRelationship[dest] = finalValue;
    }
  }
}
