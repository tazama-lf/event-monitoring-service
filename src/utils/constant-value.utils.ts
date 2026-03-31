/**
 * Handles constant value injection for mappings
 * @param mapping The mapping configuration containing constantValue
 * @param dataCache The data cache object to update
 * @param transactionRelationship The transaction relationship object to update
 * @param type The destination type ('redis' or 'transactionDetails')
 * @param destination The destination field name
 */
export function handleConstantValue(mapping: any, dataCache: any, transactionRelationship: any, type: string, destination: string): void {
  if (mapping.constantValue) {
    const stringSize = typeof mapping.destination === 'string' ? mapping.destination.split('.').length : -1;

    // Convert to appropriate type based on mapping.type field
    let finalValue: any = mapping.constantValue;
    if (mapping.type === 'number') {
      const numValue = Number(mapping.constantValue);
      if (!isNaN(numValue)) {
        finalValue = numValue;
      }
    }

    if (type === 'redis') {
      if (stringSize === 3) {
        // Handle nested object case
        const objectName: string = mapping.destination.split('.')[1];
        const nestedDest: string = mapping.destination.split('.')[2];
        dataCache[objectName] ??= {};
        dataCache[objectName][nestedDest] = finalValue;
      } else {
        dataCache[destination] = finalValue;
      }
    }
    if (type === 'transactionDetails') {
      transactionRelationship[destination] = finalValue;
    }
  }
}
