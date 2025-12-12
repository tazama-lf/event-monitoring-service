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

  const port = configService.get<number>('port', 3002);
  const environment = configService.get<string>('nodeEnv', 'dev');
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
