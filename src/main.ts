import { config } from 'dotenv';

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
config();

const DEFAULT_PORT = 3000;
const ERROR_EXIT_CODE = 1;

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.listen(DEFAULT_PORT);
}
bootstrap().catch((error: unknown) => {
  const errorMessage = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Application failed to start: ${errorMessage}\n`);
  process.exit(ERROR_EXIT_CODE);
});
