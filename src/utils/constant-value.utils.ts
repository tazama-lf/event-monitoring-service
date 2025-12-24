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
    if (type === 'redis') {
      dataCache[destination] = mapping.constantValue;
    }
    if (type === 'transactionDetails') {
      transactionRelationship[destination] = mapping.constantValue;
    }
  }
}
