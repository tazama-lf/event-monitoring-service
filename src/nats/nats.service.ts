import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { StartupFactory, type IStartupService } from '@tazama-lf/frms-coe-startup-lib';
import { LoggerService } from '@tazama-lf/frms-coe-lib';

@Injectable()
export class NatsService implements OnModuleInit, OnModuleDestroy {
  private natsService: IStartupService;
  private isInitialized = false;

  constructor(private readonly logger: LoggerService) {
    this.natsService = new StartupFactory();
  }

  // nats ka producer initialize hota hai idhr
  async onModuleInit(): Promise<void> {
    if (this.isInitialized) {
      this.logger.warn('NATS service already initialized');
      return;
    }

    try {
      const connected = await this.natsService.initProducer(this.logger);

      if (!connected) {
        throw new Error('Failed to initialize NATS producer');
      }

      this.isInitialized = true;
      this.logger.log('NATS producer initialized successfully');
    } catch (error) {
      this.logger.error(`Failed to initialize NATS: ${String(error)}`);
      throw error;
    }
  }

  onModuleDestroy(): void {
    this.isInitialized = false;
    this.logger.log('NATS service destroyed');
  }

  async notifyEventDirector(payload: unknown): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('NATS service not initialized');
    }

    try {
      await this.natsService.handleResponse(payload as object);
      this.logger.log('Message sent to event-director');
    } catch (error) {
      this.logger.error(`Failed to send message to event-director: ${String(error)}`);
      throw error;
    }
  }

  isReady(): boolean {
    return this.isInitialized;
  }
}
