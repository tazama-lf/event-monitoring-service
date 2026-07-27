import { SetMetadata } from '@nestjs/common';

export const CLAIMS_KEY = 'claims';

/**
 * Decorator to specify required claims for a route
 * @param claims - Array of required claims (all must be present)
 */
export const RequireClaims = (...claims: string[]): ReturnType<typeof SetMetadata> => SetMetadata(CLAIMS_KEY, claims);

/**
 * Common Event Monitoring Service claims for convenience
 * Add roles if needed here
 */
export const EventMonitoringClaims = Object.freeze({
  DEMS_WRITE: 'dems:write',
  APPROVER: 'approver',
} as const);

/**
 * Convenience decorators for common Event Monitoring Service roles
 */
export const RequireDemsWriteRole = (): ReturnType<typeof SetMetadata> => RequireClaims(EventMonitoringClaims.DEMS_WRITE);

export const RequireActivationRole = (): ReturnType<typeof SetMetadata> => RequireClaims(EventMonitoringClaims.APPROVER);
