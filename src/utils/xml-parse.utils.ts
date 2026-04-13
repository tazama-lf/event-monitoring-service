/**
 * XML parsing utilities for DEMS engine
 */
import { parseString, type ParserOptions } from 'xml2js';

/**
 * Parse XML payload with optional schema-based XML declaration
 * @param payload - XML string to parse
 * @param configuredSchema - Schema to determine if XML declaration is needed
 * @param options - xml2js parsing options
 * @returns Promise<any> - Parsed XML object
 */
export async function parseXmlPayload(
  payload: string,
  configuredSchema?: any,
  options: ParserOptions = {
    trim: true,
    normalize: true,
    explicitArray: false,
    mergeAttrs: true,
  },
): Promise<any> {
  // eslint-disable-next-line promise/avoid-new -- xml2js parseString requires callback-based API
  return await new Promise((resolve, reject) => {
    parseString(payload, options, (err, result) => {
      if (err) {
        reject(err);
      } else if (configuredSchema?.properties?.['?xml']) {
        const xmlWithDeclaration = {
          '?xml': {
            version: '1.0',
            encoding: 'UTF-8',
          },
          ...result,
        };
        resolve(xmlWithDeclaration);
      } else {
        resolve(result);
      }
    });
  });
}
