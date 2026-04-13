import { config } from 'dotenv';

import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { ApmInterceptor } from './apm/apm.interceptor';
import { ApmService } from './apm/apm.service';
import { AppClusterService } from './app-cluster.service';
import * as express from 'express';
import { LoggerService } from '@tazama-lf/frms-coe-lib';
config();

const ERROR_EXIT_CODE = 1;

export async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  // Configure CORS origins from environment variable
  const corsOriginsConfig = configService.get('CORS_ORIGINS') ?? process.env.CORS_ORIGINS;
  if (!corsOriginsConfig) {
    throw new Error('CORS_ORIGINS environment variable is not set');
  }

  let corsOrigins: string[];
  try {
    // parsing as JSON array first, then fall back to comma-separated
    corsOrigins = corsOriginsConfig.startsWith('[')
      ? JSON.parse(corsOriginsConfig)
      : corsOriginsConfig.split(',').map((origin) => origin.trim());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse CORS_ORIGINS: ${message}`, { cause: error });
  }

  app.enableCors({
    origin: corsOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
    credentials: true,
  });

  // Initialize APM interceptor for global transaction monitoring
  const apmService = app.get(ApmService);
  app.useGlobalInterceptors(new ApmInterceptor(apmService));

  // Configure middleware to handle raw XML bodies
  app.use(
    express.text({
      type: ['application/xml'],
    }),
  );

  const logger = app.get(LoggerService);
  app.useLogger(logger);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = configService.get('port', 3002);
  const environment = configService.get('nodeEnv', 'dev');
  const processId = process.pid;
  try {
    await app.listen(port);

    logger.log(
      `Application is UP | environment: ${environment === 'dev' ? 'development' : 'uat server'}`,
      `port ${port}`,
      `process ID ${processId}`,
    );
  } catch (error) {
    logger.error('Failed to start the application:', error);
    process.exit(ERROR_EXIT_CODE);
  }
}

const isProduction = process.env.NODE_ENV === 'production';

if (isProduction) {
  // use clustering for better performance
  AppClusterService.clusterize(bootstrap).catch((error: unknown) => {
    const errorMessage = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Application failed to start: ${errorMessage}\n`);
    process.exit(ERROR_EXIT_CODE);
  });
} else {
  // use single instance for easier debugging
  bootstrap().catch((error: unknown) => {
    const errorMessage = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Application failed to start: ${errorMessage}\n`);
    process.exit(ERROR_EXIT_CODE);
  });
}
