import { Module } from '@nestjs/common';
import { TcsSimulationController } from './tcs-simulation.controller';
import { TcsSimulationService } from './tcs-simulation.service';
import { LoggerModule } from '../logger-service/logger-service.module';
import { KNEX_CONNECTION } from '../database/knex.provider';

@Module({
  imports: [LoggerModule],
  controllers: [TcsSimulationController],
  providers: [TcsSimulationService, KNEX_CONNECTION],
  exports: [TcsSimulationService],
})
export class TcsSimulationModule {}
