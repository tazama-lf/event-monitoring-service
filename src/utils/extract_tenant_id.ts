/**
 * Extracts the tenant ID from a URL path
 * @param url The URL path (e.g., '/v1/evaluate/iso20022/pacs.008.001.10')
 * @returns The tenant ID (e.g., 'pacs.008.001.10')
 */
export const extractTenantId = (url: string): string => {
  const parts = url.split('/');
  const tenantId = parts[0];

  return tenantId || 'unknown';
};
