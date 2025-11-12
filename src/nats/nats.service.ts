import { Injectable } from '@nestjs/common';
import { StartupFactory, type IStartupService } from '@tazama-lf/frms-coe-startup-lib';
import { LoggerService } from '@tazama-lf/frms-coe-lib';

type MessageHandler = (reqObj: unknown) => Promise<void>;

@Injectable()
export class NatsService {
  private natsService: IStartupService;

  constructor(private readonly logger: LoggerService) {
    this.natsService = new StartupFactory();
  }

  async registerConsumer(consumerStreams: string[], messageHandler: MessageHandler): Promise<void> {
    // Create an adapter that matches the expected signature
    const adaptedHandler = (message: any) => messageHandler(message);
    await this.natsService.init(adaptedHandler, this.logger, consumerStreams);
    this.logger.log(`NATS consumer registered for: ${consumerStreams.join(', ')}`);
  }

  async notifyEventDirector(payload: object): Promise<void> {
    await this.natsService.handleResponse(payload);
  }
}
