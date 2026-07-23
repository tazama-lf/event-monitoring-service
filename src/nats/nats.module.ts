import { Module, Global } from '@nestjs/common';
import { NatsService } from './nats.service';
import { LoggerModule } from '../logger-service/logger-service.module';

@Global()
@Module({
  imports: [LoggerModule],
  providers: [NatsService],
  exports: [NatsService],
})
export class NatsModule {}
