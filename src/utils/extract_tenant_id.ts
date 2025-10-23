/**
 * Extracts the tenant ID from a URL path
 * @param url The URL path (e.g., '/ABL101/v1/iso20022/pacs.008')
 * @returns The tenant ID (e.g., 'pacs.008.001.10')
 */
export const extractTenantId = (url: string): string => {
  const parts = url.split('/');
  const tenantId = parts[1];

  if (!tenantId) {
    throw new Error(`Invalid URL format: Unable to extract tenant ID from '${url}'. Expected format: '/tenantId/...'`);
  }

  return tenantId;
  // index is 1 because the URL starts with a leading slash (/)
  // URL parts: [ '', 'ABL101', 'v1', 'iso20022', 'pain.001' ]
};
