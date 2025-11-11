import { config } from 'dotenv';

import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { ApmInterceptor } from './apm/apm.interceptor';
import { ApmService } from './apm/apm.service';
// import { AppClusterService } from './app-cluster.service';
import * as express from 'express';
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

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = configService.get<number>('port', 3002);
  try {
    await app.listen(port);
    console.log(`Application is running on: http://localhost:${port}`);
  } catch (error) {
    console.error('Failed to start the application:', error);
    process.exit(ERROR_EXIT_CODE);
  }
}

bootstrap();
// bootstrap().catch((error: unknown) => {
//   const errorMessage = error instanceof Error ? error.message : String(error);
//   process.stderr.write(`Application failed to start: ${errorMessage}\n`);
//   process.exit(ERROR_EXIT_CODE);
// });

// Use clustering to run multiple instances
// AppClusterService.clusterize(bootstrap);
