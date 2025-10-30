import { LoggerService } from '@tazama-lf/frms-coe-lib';

/**
 * Utility functions for XML2JS processing and schema-based transformations
 */

/**
 * Analyzes a JSON schema to extract field paths that should be arrays or strings
 * @param schema The JSON schema to analyze
 * @returns Object containing arrays of field paths for arrays and strings
 */
export async function returnArrayFieldsFromSchema(schema: any): Promise<{ arrayFields: string[]; stringFields: string[] }> {
  const arrayFields: string[] = [];
  const stringFields: string[] = [];

  const traverseSchema = (obj: any, path: string = '') => {
    if (!obj || typeof obj !== 'object') {
      return;
    }

    // Check if current object has properties
    if (obj.properties) {
      for (const [key, value] of Object.entries(obj.properties)) {
        const currentPath = path ? `${path}.${key}` : key;
        const property = value as any;

        // Check if this property is an array
        if (property.type === 'array') {
          arrayFields.push(currentPath);
        }

        // Check if this property is a string
        if (property.type === 'string') {
          stringFields.push(currentPath);
        }

        // Recursively check nested objects
        if (property.type === 'object' && property.properties) {
          traverseSchema(property, currentPath);
        }

        // Handle array items that might contain objects
        if (property.type === 'array' && property.items) {
          if (property.items.type === 'object' && property.items.properties) {
            traverseSchema(property.items, currentPath);
          }
        }

        // Handle anyOf, oneOf, allOf schemas
        if (property.anyOf || property.oneOf || property.allOf) {
          const schemaVariants = property.anyOf || property.oneOf || property.allOf;
          schemaVariants.forEach((variant: any) => {
            if (variant.type === 'object' && variant.properties) {
              traverseSchema(variant, currentPath);
            }
          });
        }
      }
    }

    // Handle root level anyOf, oneOf, allOf
    if (obj.anyOf || obj.oneOf || obj.allOf) {
      const schemaVariants = obj.anyOf || obj.oneOf || obj.allOf;
      schemaVariants.forEach((variant: any) => {
        if (variant.properties) {
          traverseSchema(variant, path);
        }
      });
    }
  };

  traverseSchema(schema);
  return { arrayFields, stringFields };
}

/**
 * Replaces objects with arrays for fields that are marked as arrays in the schema
 * and converts numbers back to strings for fields that should be strings
 * @param payload The payload to modify
 * @param arrayFields Array of dot-notation paths that should be arrays
 * @param stringFields Array of dot-notation paths that should be strings
 * @param loggerService Optional logger service for logging conversions
 * @returns Modified payload with objects converted to arrays and numbers converted to strings where needed
 */
export function replaceObjectsWithArrays(payload: any, arrayFields: string[], stringFields: string[], loggerService?: LoggerService): any {
  // Create a deep copy to avoid mutating the original payload
  const modifiedPayload = JSON.parse(JSON.stringify(payload));

  // Handle array conversions
  arrayFields.forEach((fieldPath) => {
    convertObjectToArrayAtPath(modifiedPayload, fieldPath, loggerService);
  });

  // Handle number to string conversions
  stringFields.forEach((fieldPath) => {
    convertNumberToStringAtPath(modifiedPayload, fieldPath, loggerService);
  });

  return modifiedPayload;
}

/**
 * Converts a number to a string at a specific dot-notation path
 * @param obj The object to modify
 * @param path The dot-notation path to the field
 * @param loggerService Optional logger service for logging conversions
 */
export function convertNumberToStringAtPath(obj: any, path: string, loggerService?: LoggerService): void {
  const pathParts = path.split('.');
  let current = obj;

  // Navigate to the parent of the target field
  for (let i = 0; i < pathParts.length - 1; i++) {
    if (current && typeof current === 'object' && current[pathParts[i]]) {
      current = current[pathParts[i]];
    } else {
      // Path doesn't exist in the payload, skip this conversion
      return;
    }
  }

  const targetFieldName = pathParts[pathParts.length - 1];

  // Check if the target field exists and is a number
  if (current && current[targetFieldName] !== undefined && typeof current[targetFieldName] === 'number') {
    // Convert the number to a string
    current[targetFieldName] = String(current[targetFieldName]);

    if (loggerService) {
      loggerService.log(`Converted field '${path}' from number to string: ${current[targetFieldName]}`);
    }
  }
}

/**
 * Converts an object to an array at a specific dot-notation path
 * @param obj The object to modify
 * @param path The dot-notation path to the field
 * @param loggerService Optional logger service for logging conversions
 */
export function convertObjectToArrayAtPath(obj: any, path: string, loggerService?: LoggerService): void {
  const pathParts = path.split('.');
  let current = obj;

  // Navigate to the parent of the target field
  for (let i = 0; i < pathParts.length - 1; i++) {
    if (current && typeof current === 'object' && current[pathParts[i]]) {
      current = current[pathParts[i]];
    } else {
      // Path doesn't exist in the payload, skip this conversion
      return;
    }
  }

  const targetFieldName = pathParts[pathParts.length - 1];

  // Check if the target field exists and is an object (not already an array)
  if (current?.[targetFieldName] && typeof current[targetFieldName] === 'object' && !Array.isArray(current[targetFieldName])) {
    // Convert the object to an array containing that object
    current[targetFieldName] = [current[targetFieldName]];

    if (loggerService) {
      loggerService.log(`Converted field '${path}' from object to array`);
    }
  }
}

/**
 * Custom value processor that only converts to numbers if the field is not a string in the schema
 * @param stringFields Array of dot-notation paths that should remain as strings
 * @returns A function that processes values based on schema types
 */
export function createSchemaAwareNumberProcessor(stringFields: string[]) {
  return (value: any, name: string, path?: string) => {
    // Build the full path for the current field
    const fullPath = path ? `${path}.${name}` : name;

    // If this field is marked as a string in the schema, don't convert to number
    if (stringFields.some((stringField) => stringField.endsWith(name) || stringField === fullPath)) {
      return value; // Keep as string
    }

    // Otherwise, apply number parsing
    if (typeof value === 'string' && !isNaN(Number(value)) && value.trim() !== '') {
      return Number(value);
    }

    return value;
  };
}
