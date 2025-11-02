import { Injectable } from '@nestjs/common';
import { StartupFactory, type IStartupService } from '@tazama-lf/frms-coe-startup-lib';
import { LoggerService } from '@tazama-lf/frms-coe-lib';

type MessageHandler = (reqObj: unknown, handleResponse: (response: object) => Promise<void>) => Promise<void>;

@Injectable()
export class NatsService {
  private natsService: IStartupService;

  constructor(private readonly logger: LoggerService) {
    this.natsService = new StartupFactory();
  }

  async registerConsumer(consumerStreams: string[], producerStream: string, messageHandler: MessageHandler): Promise<void> {
    await this.natsService.init(messageHandler as never, this.logger, consumerStreams, producerStream);
    this.logger.log(`NATS consumer registered for: ${consumerStreams.join(', ')}`);
  }

  async notifyEventDirector(payload: object): Promise<void> {
    await this.natsService.handleResponse(payload);
  }
}
