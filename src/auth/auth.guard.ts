import { CanActivate, ExecutionContext, Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { validateTokenAndClaims } from '@tazama-lf/auth-lib';
import type { Request } from 'express';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => Reflector.createDecorator<boolean>({ key: IS_PUBLIC_KEY });

export interface IAuthService {
  validateTokenAndClaims(token: string, claims: string[]): Record<string, boolean>;
}

@Injectable()
export class AuthService implements IAuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(private readonly configService: ConfigService) {}

  validateTokenAndClaims(token: string, claims: string[]): Record<string, boolean> {
    try {
      if (!token) {
        throw new UnauthorizedException('No token provided');
      }

      const validated = validateTokenAndClaims(token, claims);

      if (!validated) {
        this.logger.warn('Token validation failed - validateTokenAndClaims returned false');
        throw new UnauthorizedException('Invalid token or insufficient claims');
      }

      // Use the actual validation results instead of blindly setting all to true
      const result = validated as Record<string, boolean>;

      // Verify that all requested claims are actually valid
      const invalidClaims = claims.filter((claim) => !result[claim]);
      if (invalidClaims.length > 0) {
        this.logger.warn(`Token missing required claims: ${invalidClaims.join(', ')}`);
        throw new UnauthorizedException(`Missing required claims: ${invalidClaims.join(', ')}`);
      }

      const validClaims = claims.filter((claim) => result[claim]);
      this.logger.debug(`Token validation successful for claims: ${validClaims.join(', ')}`);
      return result;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      this.logger.error('Token validation error:', error);
      throw new UnauthorizedException('Token validation failed');
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
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()]);

    if (isPublic) {
      this.logger.debug('Public endpoint accessed, skipping authentication');
      return true;
    }

    const isAuthenticated = this.configService.get<boolean>('AUTHENTICATED', true);
    if (!isAuthenticated) {
      this.logger.debug('Authentication disabled via configuration');
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();

    const defaultClaims = ['dems:read'];
    const configuredClaims = this.configService.get<string>('REQUIRED_CLAIMS');
    const claims = configuredClaims ? configuredClaims.split(',').map((c) => c.trim()) : defaultClaims;

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

      const validationResult = this.authService.validateTokenAndClaims(token, claims);

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
