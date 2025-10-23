import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { NatsService } from './nats/nats.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly natsService: NatsService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('/health/nats')
  getNatsHealth(): { status: string } {
    const connected = 'connected';
    const disconnected = 'disconnected';
    return {
      status: this.natsService.isReady() ? connected : disconnected,
    };
  }
}
