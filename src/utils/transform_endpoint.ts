/**
 * Transforms a URL path by replacing commas with slashes and prepending a leading slash.
 * @param endpoint The URL path (e.g., 'ABL101,v1,iso20022,pain.001')
 * @returns The transformed URL path (e.g., '/ABL101/v1/iso20022/pain.001')
 */
export const transformEndpoint = (endpoint: string) => '/' + endpoint.toString().trim().replaceAll(',', '/');
