/**
 * Normalizes the raw `*endpoint` wildcard param captured for `POST /dems-engine/*endpoint` into an
 * ordered list of path segments, regardless of the shape the router handed us or which delimiter the
 * caller used — see issue #84.
 *
 * The UI/DB advertise the endpoint_path in slash-delimited form (e.g.
 * `/TAZAMA/v1/iso20022/pacs.008.001.10`), while the legacy/back-compat encoding is comma-delimited
 * (e.g. `TAZAMA,v1,iso20022,pacs.008.001.10`). On this NestJS (`@nestjs/core`) + Express 5
 * (`path-to-regexp` v8) combination, `@Param('endpoint')` always resolves to an ARRAY of segments —
 * verified against a real HTTP request through the actual routing layer (not a direct unit-level
 * controller call, which bypasses route matching entirely and can't observe this):
 *   - slash form  `/DEFAULT/v1/iso20022/pacs.008.001.10` -> `["DEFAULT","v1","iso20022","pacs.008.001.10"]`
 *   - comma form  `/DEFAULT,v1,iso20022,pacs.008.001.10` -> `["DEFAULT,v1,iso20022,pacs.008.001.10"]` (one element)
 * A bare comma-delimited *string* is also accepted defensively, in case a future framework version
 * changes that normalization. See `tests/dems-engine/dems-engine.endpoint-routing.spec.ts` for a
 * regression test asserting the real router-level shape.
 *
 * @param endpoint The raw `@Param('endpoint')` value (array of segments, or a comma-delimited string)
 * @returns The ordered, non-empty, trimmed path segments, or `null` if nothing usable was captured
 */
export function normalizeEndpointSegments(endpoint: unknown): string[] | null {
  let rawSegments: unknown[];

  if (Array.isArray(endpoint)) {
    rawSegments = endpoint;
  } else if (typeof endpoint === 'string') {
    rawSegments = [endpoint];
  } else {
    return null;
  }

  const segments = rawSegments
    .filter((segment): segment is string => typeof segment === 'string')
    // each captured segment may itself be comma-delimited (the legacy encoding collapses the whole
    // path into a single wildcard segment)
    .flatMap((segment) => segment.split(','))
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);

  return segments.length > 0 ? segments : null;
}

/**
 * Validates the raw `*endpoint` wildcard param: true if it normalizes to at least one non-empty
 * path segment (see {@link normalizeEndpointSegments}).
 */
export const isValidEndpointFormat = (endpoint: unknown): boolean => normalizeEndpointSegments(endpoint) !== null;

/**
 * Transforms the raw `*endpoint` wildcard param into the canonical, leading-slash, slash-delimited
 * endpoint_path (e.g. `/DEFAULT/v1/iso20022/pacs.008.001.10`), matching the format stored in
 * `tcs_config.endpoint_path` and shown in the UI — regardless of whether the caller used the
 * slash-delimited or comma-delimited form.
 *
 * @param endpoint The raw `@Param('endpoint')` value (array of segments, or a comma-delimited string)
 * @returns The canonical slash-delimited path
 * @throws {Error} if `endpoint` doesn't normalize to any usable segments — callers should validate
 * with {@link isValidEndpointFormat} first
 */
export function transformEndpoint(endpoint: unknown): string {
  const segments = normalizeEndpointSegments(endpoint);
  if (!segments) {
    throw new Error('Cannot transform an endpoint with no usable path segments');
  }
  return '/' + segments.join('/');
}

/**
 * Extracts the tenant id (first path segment) from the raw `*endpoint` wildcard param, for comparing
 * against the JWT's tenantId — works for both the slash-delimited and comma-delimited forms.
 *
 * @param endpoint The raw `@Param('endpoint')` value (array of segments, or a comma-delimited string)
 * @returns The tenant id segment, or `undefined` if `endpoint` has no usable segments
 */
export function extractTenantIdFromEndpoint(endpoint: unknown): string | undefined {
  return normalizeEndpointSegments(endpoint)?.[0];
}
