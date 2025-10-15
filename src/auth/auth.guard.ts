import { CanActivate, ExecutionContext, Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

// Custom decorator for public endpoints
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => Reflector.createDecorator<boolean>({ key: IS_PUBLIC_KEY });

// Auth service interface
export interface IAuthService {
  validateTokenAndClaims(token: string, claims: string[]): Record<string, boolean>;
}

@Injectable()
export class AuthService implements IAuthService {
  private readonly logger = new Logger(AuthService.name);

  validateTokenAndClaims(token: string, claims: string[]): Record<string, boolean> {
    try {
      // This would integrate with @tazama-lf/auth-lib for real JWT validation
      // For now, implementing basic validation structure
      if (!token) {
        throw new UnauthorizedException('No token provided');
      }

      // TODO: Replace with actual JWT validation using @tazama-lf/auth-lib
      // const validated = validateTokenAndClaims(token, claims);

      const result: Record<string, boolean> = {};
      claims.forEach((claim) => {
        // Mock validation - replace with actual validation logic
        result[claim] = true;
      });

      return result;
    } catch (error) {
      this.logger.error('Token validation failed:', error);
      throw new UnauthorizedException('Invalid token');
    }
  }
}

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly authService: AuthService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    // Check if endpoint is marked as public
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()]);

    if (isPublic) {
      return true;
    }

    // Check if authentication is enabled
    const isAuthenticated = this.configService.get<boolean>('AUTHENTICATED', true);
    if (!isAuthenticated) {
      this.logger.debug('Authentication disabled');
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const claims = ['dems:write']; // Default claim for DEMS operations

    return this.validateRequest(request, claims);
  }

  private validateRequest(request: Request, claims: string[]): boolean {
    const logContext = 'AuthGuard.validateRequest';

    try {
      const authHeader = request.headers.authorization;

      if (!authHeader?.startsWith('Bearer ')) {
        this.logger.warn('Missing or invalid authorization header', logContext);
        throw new UnauthorizedException('Missing or invalid authorization header');
      }

      const token = authHeader.split(' ')[1];
      if (!token) {
        this.logger.warn('Missing token in authorization header', logContext);
        throw new UnauthorizedException('Missing token');
      }

      // Validate token and claims
      const validationResult = this.authService.validateTokenAndClaims(token, claims);

      // Check if all required claims are valid
      const allClaimsValid = claims.every((claim) => validationResult[claim] === true);

      if (!allClaimsValid) {
        this.logger.warn(`Invalid claims for token. Required: ${claims.join(', ')}`, logContext);
        throw new UnauthorizedException('Insufficient permissions');
      }

      this.logger.debug('Authentication successful', logContext);
      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      this.logger.error('Authentication error:', error, logContext);
      throw new UnauthorizedException('Authentication failed');
    }
  }
}
