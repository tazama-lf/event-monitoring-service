// SPDX-License-Identifier: Apache-2.0

import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseService } from './database.service';
import databaseConfig from '../config/database.config';
import { LoggerModule } from '../logger-service/logger-service.module';

@Global()
@Module({
  imports: [LoggerModule, ConfigModule.forFeature(databaseConfig)],
  providers: [DatabaseService],
  exports: [DatabaseService],
})
export class DatabaseModule {}
