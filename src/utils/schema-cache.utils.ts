import type { LoggerService } from '@tazama-lf/frms-coe-lib';
import type { SchemaData } from '../interfaces/iSchemaData';

/**
 * Parses and validates cached schema data
 * @param cachedSchema The cached schema (string or object)
 * @param endpoint The endpoint for logging
 * @param loggerService Logger service instance
 * @returns Tuple of [schema, mapping, functions, related_transaction] or null if inactive/invalid
 */
export function parseCachedSchema(cachedSchema: any, endpoint: string, loggerService: LoggerService): [any, any, any, any] | null {
  // Only parse if cachedSchema is a string
  if (typeof cachedSchema === 'string') {
    try {
      const parsedSchema = JSON.parse(cachedSchema);

      // return only if parsedSchema.publishing_status is 'active' (if present)
      if (parsedSchema.publishing_status && parsedSchema.publishing_status !== 'active') {
        loggerService.log(`Cached schema for endpoint: ${endpoint} is not active`);
        return null;
      }

      return [parsedSchema.schema, parsedSchema.mapping, parsedSchema.functions, parsedSchema.related_transaction] as [any, any, any, any];
    } catch (error) {
      loggerService.error(`Failed to parse cached schema for endpoint ${endpoint}: ${String(error)}`);
      return null;
    }
  } else if (typeof cachedSchema === 'object') {
    // If cachedSchema is already an object, use it directly
    const schemaObj = cachedSchema;
    if (schemaObj.publishing_status && schemaObj.publishing_status !== 'active') {
      loggerService.log(`Cached schema for endpoint: ${endpoint} is not active`);
      return null;
    }
    return [schemaObj.schema, schemaObj.mapping, schemaObj.functions, schemaObj.related_transaction] as [any, any, any, any];
  }

  return null;
}

/**
 * Prepares schema data for caching
 * @param record Database record containing schema data
 * @returns Formatted schema data object
 */
export function prepareSchemaForCache(record: any): SchemaData {
  return {
    schema: record.schema,
    mapping: record.mapping,
    functions: record.functions,
    publishing_status: record.publishing_status,
  };
}
