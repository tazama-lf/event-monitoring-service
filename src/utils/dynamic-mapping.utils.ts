import type { LoggerService } from '@tazama-lf/frms-coe-lib';
import { getValueByPath } from './has_nested_property';

/**
 * Handles dynamic mapping logic based on datasource
 * @param mapping The mapping configuration
 * @param payload The payload to extract data from
 * @param dynamicMapping The dynamic mapping object to update
 * @param loggerService Logger service for logging
 */
export function handleDynamicMapping(mapping: any, payload: any, dynamicMapping: any, loggerService: LoggerService): void {
  // append to dynamic mapping object
  const ObjectName: string = mapping.destination.split('.')[0];
  const PropertyName: string = mapping.destination.split('.')[1];
  const nestedPropertyName: string = mapping.destination.split('.')[2];

  loggerService.log('dataModel case for dynamic mapping source: ', mapping.source[0]);
  loggerService.log('dataModel case for dynamic mapping value: ', getValueByPath(payload, mapping.source[0]));

  dynamicMapping[ObjectName] ??= {};
  if (nestedPropertyName) {
    dynamicMapping[ObjectName][PropertyName] ??= {};
    dynamicMapping[ObjectName][PropertyName][nestedPropertyName] = getValueByPath(payload, mapping.source[0]);
  } else {
    dynamicMapping[ObjectName][PropertyName] = getValueByPath(payload, mapping.source[0]);
  }

  loggerService.log('dynamicMapping object is now: ', JSON.stringify(dynamicMapping));
}
