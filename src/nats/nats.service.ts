import { Injectable } from '@nestjs/common';
import { StartupFactory, type IStartupService } from '@tazama-lf/frms-coe-startup-lib';
import { LoggerService } from '@tazama-lf/frms-coe-lib';
import { NotifyEventDirectorError } from '../errors/transaction-operation.errors';

type MessageHandler = (reqObj: unknown) => Promise<void>;

@Injectable()
export class NatsService {
  private readonly natsService: IStartupService;
  private readonly LOG_CONTEXT = NatsService.name;

  constructor(private readonly logger: LoggerService) {
    this.natsService = new StartupFactory();
  }

  async registerConsumer(consumerStreams: string[], messageHandler: MessageHandler): Promise<void> {
    // Create an adapter that matches the expected signature
    const adaptedHandler = async (message: any): Promise<void> => {
      await messageHandler(message);
    };
    await this.natsService.init(adaptedHandler, this.logger, consumerStreams);
    this.logger.log(`NATS consumer registered for: ${consumerStreams.join(', ')}`, this.LOG_CONTEXT);
  }

  async notifyEventDirector(payload: object): Promise<void> {
    try {
      await this.natsService.handleResponse(payload);
    } catch (error) {
      this.logger.error(`Failed to notify event director: ${String(error)}`, this.LOG_CONTEXT);
      throw new NotifyEventDirectorError(error);
    }
  }
}
