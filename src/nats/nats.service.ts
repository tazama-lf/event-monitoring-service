import { Injectable } from '@nestjs/common';
import { LoggerService } from '@tazama-lf/frms-coe-lib';
import { NotifyEventDirectorError } from '../errors/transaction-operation.errors';

type MessageHandler = (reqObj: unknown) => Promise<void>;

interface StartupServiceLike {
  init: (handler: (message: unknown) => Promise<void>, logger: LoggerService, consumerStreams: string[]) => Promise<unknown>;
  handleResponse: (payload: object) => Promise<void>;
}

@Injectable()
export class NatsService {
  private natsService: StartupServiceLike | null = null;
  private readonly LOG_CONTEXT = NatsService.name;

  constructor(private readonly logger: LoggerService) {}

  private async getNatsService(): Promise<StartupServiceLike> {
    if (!this.natsService) {
      const { StartupFactory } = await import('@tazama-lf/frms-coe-startup-lib');
      this.natsService = new StartupFactory();
    }
    return this.natsService;
  }

  async registerConsumer(consumerStreams: string[], messageHandler: MessageHandler): Promise<void> {
    const service = await this.getNatsService();

    const adaptedHandler = async (message: unknown): Promise<void> => {
      await messageHandler(message);
    };

    await service.init(adaptedHandler, this.logger, consumerStreams);
    this.logger.log(`NATS consumer registered for: ${consumerStreams.join(', ')}`, this.LOG_CONTEXT);
  }

  async notifyEventDirector(payload: object): Promise<void> {
    try {
      const service = await this.getNatsService();
      await service.handleResponse(payload);
    } catch (error) {
      this.logger.error(`Failed to notify event director: ${String(error)}`, this.LOG_CONTEXT);
      throw new NotifyEventDirectorError(error);
    }
  }
}
