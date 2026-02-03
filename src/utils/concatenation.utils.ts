import { getValueByPath } from './has_nested_property';

/**
 * Handles concatenation of source values for mapping
 * @param sources Array of source paths to extract values from
 * @param payload The payload to extract data from
 * @param type The destination type ('redis' or 'transactionDetails')
 * @param prefix The prefix to add before the concatenated value
 * @param separator The delimiter to use between concatenated values
 * @returns Object containing dataCacheValue and transactionRelationshipValue
 */
export function handleConcatenation(
  sources: string[],
  payload: any,
  type: string,
  prefix: string,
  separator: string,
): { dataCacheValue: string; transactionRelationshipValue: string } {
  let dataCacheValue = prefix;
  let transactionRelationshipValue = prefix;

  // Iterate through sources to build the value based on mapping - totally dynamic work
  for (let i = 0; i < sources.length; i++) {
    if (type === 'redis') {
      dataCacheValue += getValueByPath(payload, sources[i]);

      if (i < sources.length - 1) {
        dataCacheValue += separator;
      }
    } else {
      transactionRelationshipValue += getValueByPath(payload, sources[i]);

      if (i < sources.length - 1) {
        transactionRelationshipValue += separator;
      }
    }
  }

  return { dataCacheValue, transactionRelationshipValue };
}
