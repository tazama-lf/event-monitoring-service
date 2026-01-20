import { getValueByPath } from './has_nested_property';
import type { TransactionDetails } from '@tazama-lf/frms-coe-lib/lib/interfaces';

/**
 * Handles split value logic for multiple destinations from single source
 * @param mapping The mapping configuration
 * @param payload The payload to extract data from
 * @param dataCache The data cache object to update
 * @param transactionRelationship The transaction relationship object to update
 * @throws Error if mapping.source is missing or malformed
 * @throws Error if mapping.destination entries are invalid
 */
export function handleSplitValue(mapping: any, payload: any, dataCache: any, transactionRelationship: TransactionDetails): void {
  // Validate mapping.source exists and has at least one entry
  if (!mapping.source || !Array.isArray(mapping.source) || mapping.source.length === 0 || !mapping.source[0]) {
    throw new Error('Invalid mapping: source must be a non-empty array with at least one valid entry');
  }

  // Get source value and ensure it's a string
  const rawSourceValue = getValueByPath(payload, mapping.source[0]);
  if (rawSourceValue === null || rawSourceValue === undefined) {
    throw new Error(`Source value not found at path: ${mapping.source[0]}`);
  }
  const sourceValue = String(rawSourceValue);

  // Split the source value
  const splitValues = sourceValue.split(mapping.delimiter);

  // Validate mapping.destination exists
  if (!mapping.destination || !Array.isArray(mapping.destination) || mapping.destination.length === 0) {
    throw new Error('Invalid mapping: destination must be a non-empty array');
  }

  for (let j = 0; j < mapping.destination.length; j++) {
    // Validate destination entry format
    const destEntry = mapping.destination[j];
    if (typeof destEntry !== 'string' || !destEntry.includes('.')) {
      throw new Error(`Invalid destination format at index ${j}: ${destEntry}. Expected format: 'type.destination'`);
    }

    const destParts = destEntry.split('.');
    if (destParts.length < 2 || !destParts[0] || !destParts[1]) {
      throw new Error(`Invalid destination format at index ${j}: ${destEntry}. Both type and destination must be non-empty`);
    }

    const destType = destParts[0];
    const dest = destParts[1];
    const stringSize = destParts.length;

    // Check if split value exists at this index
    if (j >= splitValues.length) {
      // Skip assignment if index is out of bounds
      continue;
    }

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
