/**
 * Transforms a URL path by replacing commas with slashes and prepending a leading slash.
 * @param endpoint The URL path (e.g., 'ABL101,v1,iso20022,pain.001')
 * @returns The transformed URL path (e.g., '/ABL101/v1/iso20022/pain.001')
 */
export const transformEndpoint = (endpoint: string): string => '/' + endpoint.trim().replaceAll(',', '/');

const MIN_ENDPOINT_LENGTH = 0;
export const isValidEndpointFormat = (endpoint: unknown): endpoint is string =>
  typeof endpoint === 'string' && endpoint.length > MIN_ENDPOINT_LENGTH && endpoint.includes(',');
