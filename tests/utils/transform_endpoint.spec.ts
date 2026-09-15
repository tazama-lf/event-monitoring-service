// SPDX-License-Identifier: Apache-2.0

import {
  isValidEndpointFormat,
  transformEndpoint,
  extractTenantIdFromEndpoint,
  normalizeEndpointSegments,
} from '../../src/utils/transform_endpoint';

describe('transform_endpoint', () => {
  describe('normalizeEndpointSegments', () => {
    it('splits an array of slash-form segments (the real router shape) as-is', () => {
      expect(normalizeEndpointSegments(['DEFAULT', 'v1', 'iso20022', 'pacs.008.001.10'])).toEqual([
        'DEFAULT',
        'v1',
        'iso20022',
        'pacs.008.001.10',
      ]);
    });

    it('splits a single comma-delimited element inside an array (the real router shape for comma form)', () => {
      expect(normalizeEndpointSegments(['DEFAULT,v1,iso20022,pacs.008.001.10'])).toEqual(['DEFAULT', 'v1', 'iso20022', 'pacs.008.001.10']);
    });

    it('accepts a bare comma-delimited string defensively', () => {
      expect(normalizeEndpointSegments('DEFAULT,v1,iso20022,pacs.008.001.10')).toEqual(['DEFAULT', 'v1', 'iso20022', 'pacs.008.001.10']);
    });

    it('accepts a bare single-segment string', () => {
      expect(normalizeEndpointSegments('onlyseg')).toEqual(['onlyseg']);
    });

    it('trims whitespace and drops empty segments', () => {
      expect(normalizeEndpointSegments([' DEFAULT ', '', 'v1'])).toEqual(['DEFAULT', 'v1']);
    });

    it('returns null for an empty array', () => {
      expect(normalizeEndpointSegments([])).toBeNull();
    });

    it('returns null for an empty string', () => {
      expect(normalizeEndpointSegments('')).toBeNull();
    });

    it('returns null for non-array/non-string values', () => {
      expect(normalizeEndpointSegments(undefined)).toBeNull();
      expect(normalizeEndpointSegments(null)).toBeNull();
      expect(normalizeEndpointSegments(42)).toBeNull();
    });
  });

  describe('isValidEndpointFormat', () => {
    it('accepts the real router shapes for both slash and comma forms', () => {
      expect(isValidEndpointFormat(['DEFAULT', 'v1', 'iso20022', 'pacs.008.001.10'])).toBe(true);
      expect(isValidEndpointFormat(['DEFAULT,v1,iso20022,pacs.008.001.10'])).toBe(true);
    });

    it('rejects an empty array/string and non-array/non-string values', () => {
      expect(isValidEndpointFormat([])).toBe(false);
      expect(isValidEndpointFormat('')).toBe(false);
      expect(isValidEndpointFormat(undefined)).toBe(false);
      expect(isValidEndpointFormat(null)).toBe(false);
    });
  });

  describe('transformEndpoint', () => {
    it('joins a slash-form array into the canonical leading-slash path', () => {
      expect(transformEndpoint(['DEFAULT', 'v1', 'iso20022', 'pacs.008.001.10'])).toBe('/DEFAULT/v1/iso20022/pacs.008.001.10');
    });

    it('joins a comma-form array (single element) into the same canonical path', () => {
      expect(transformEndpoint(['DEFAULT,v1,iso20022,pacs.008.001.10'])).toBe('/DEFAULT/v1/iso20022/pacs.008.001.10');
    });

    it('both forms produce an identical canonical path for the same logical endpoint', () => {
      const slashForm = transformEndpoint(['TAZAMA', 'v1', 'iso20022', 'pacs.002.001.12']);
      const commaForm = transformEndpoint(['TAZAMA,v1,iso20022,pacs.002.001.12']);
      expect(slashForm).toBe(commaForm);
    });

    it('throws when given no usable segments', () => {
      expect(() => transformEndpoint([])).toThrow();
      expect(() => transformEndpoint('')).toThrow();
    });
  });

  describe('extractTenantIdFromEndpoint', () => {
    it('extracts the first segment as the tenant id, for both forms', () => {
      expect(extractTenantIdFromEndpoint(['DEFAULT', 'v1', 'iso20022', 'pacs.008.001.10'])).toBe('DEFAULT');
      expect(extractTenantIdFromEndpoint(['DEFAULT,v1,iso20022,pacs.008.001.10'])).toBe('DEFAULT');
    });

    it('returns undefined when there are no usable segments', () => {
      expect(extractTenantIdFromEndpoint([])).toBeUndefined();
      expect(extractTenantIdFromEndpoint('')).toBeUndefined();
    });
  });
});
