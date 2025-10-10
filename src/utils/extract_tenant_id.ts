/**
 * Extracts the tenant ID from a URL path
 * @param url The URL path (e.g., '/v1/evaluate/iso20022/pacs.008.001.10')
 * @returns The tenant ID (e.g., 'pacs.008.001.10')
 */
export const extractTenantId = (url: string): string => {
  const parts = url.split('/');
  console.log('URL parts:', parts);
  const tenantId = parts[1];

  return tenantId || 'unknown';
  // index is 1 because the URL starts with a leading slash (/)
  // URL parts: [ '', 'ABL101', 'v1', 'iso20022', 'pain.001' ]
};
