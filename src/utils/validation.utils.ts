import type { ErrorObject } from 'ajv';

/**
 * Formats AJV validation errors into human-readable messages
 * @param errors Array of AJV error objects
 * @returns Array of formatted error messages
 */
export function formatValidationErrors(errors: ErrorObject[] | null | undefined): string[] {
  return (
    errors?.map((error) => {
      const path = error.instancePath || 'root';
      const message = error.message ?? 'validation failed';

      // Format the error message to be more human-readable
      if (error.keyword === 'required') {
        return `${path}: Missing required property '${error.params.missingProperty}'`;
      }
      if (error.keyword === 'additionalProperties') {
        return `${path}: Unexpected property '${error.params.additionalProperty}' not defined in schema`;
      }
      if (error.keyword === 'type') {
        return `${path}: Should be a ${error.params.type}`;
      }
      return `--> ${path}: ${message}`;
    }) ?? []
  );
}
