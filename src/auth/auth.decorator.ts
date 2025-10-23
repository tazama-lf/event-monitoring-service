import { SetMetadata } from '@nestjs/common';

export const CLAIMS_KEY = 'claims';
export const IS_PUBLIC_KEY = 'isPublic';
export const ANY_CLAIMS_KEY = 'anyClaims'; // New key for "any of these claims" logic

/**
 * Decorator to specify required claims for a route
 * @param claims - Array of required claims (all must be present)
 */
export const RequireClaims = (...claims: string[]) => SetMetadata(CLAIMS_KEY, claims);

/**
 * Decorator to specify claims where ANY of them can satisfy the requirement
 * @param claims - Array of claims (user needs at least one)
 */
export const RequireAnyClaims = (...claims: string[]) => SetMetadata(ANY_CLAIMS_KEY, claims);

/**
 * Decorator to mark a route as public (no authentication required)
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/**
 * Decorator to specify a single claim requirement
 * @param claim - Single required claim
 */
export const RequireClaim = (claim: string) => SetMetadata(CLAIMS_KEY, [claim]);

/**
 * Common Event Monitoring Service claims for convenience
 */
export const EventMonitoringClaims = {
  DEMS_WRITE: 'dems:write',
  DEMS_READ: 'dems:read',
  DEMS_ADMIN: 'dems:admin',
  DEFAULT_ROLES_TAZAMA_EMS: 'default-roles-tazama-ems',
  OFFLINE_ACCESS: 'offline_access',
  UMA_AUTHORIZATION: 'uma_authorization',
} as const;

/**
 * Convenience decorators for common Event Monitoring Service roles
 */
export const RequireDemsWriteRole = () => RequireClaims(EventMonitoringClaims.DEMS_WRITE);
export const RequireDemsReadRole = () => RequireClaims(EventMonitoringClaims.DEMS_READ);
export const RequireDemsAdminRole = () => RequireClaims(EventMonitoringClaims.DEMS_ADMIN);
