import { SetMetadata } from '@nestjs/common';

export const CLAIMS_KEY = 'claims';

/**
 * Decorator to specify required claims for a route
 * @param claims - Array of required claims (all must be present)
 */
export const RequireClaims = (...claims: string[]) => SetMetadata(CLAIMS_KEY, claims);

/**
 * Common Event Monitoring Service claims for convenience
 * Add roles if needed here
 */
export const EventMonitoringClaims = {
  DEMS_WRITE: 'dems:write',
  DEMS_ADMIN: 'dems:admin',
  DEFAULT_ROLES_TAZAMA_EMS: 'default-roles-tazama-ems',
} as const;

/**
 * Convenience decorators for common Event Monitoring Service roles
 */
export const RequireDemsWriteRole = () => RequireClaims(EventMonitoringClaims.DEMS_WRITE);
