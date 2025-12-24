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
    const dest = mapping.destination[j].split('.')[1];
    const destType = mapping.destination[j].split('.')[0];

    if (destType === 'redis') {
      dataCache[dest] = splitValues[j];
    }
    if (destType === 'transactionDetails') {
      transactionRelationship[dest] = splitValues[j];
    }
  }
}
