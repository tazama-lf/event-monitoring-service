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

    const maxRetries = 3;
    const retryDelayMs = 2000; // 2 seconds

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        this.logger.log(`Initializing NATS producer - Attempt ${attempt}/${maxRetries}`);

        const connected = await this.natsService.initProducer(this.logger);

        if (!connected) {
          throw new Error('Failed to initialize NATS producer - connection returned false');
        }

        this.isInitialized = true;
        this.logger.log('NATS producer initialized successfully');
        return;
      } catch (error) {
        const errorMessage = `Failed to initialize NATS (attempt ${attempt}/${maxRetries}): ${String(error)}`;

        if (attempt === maxRetries) {
          this.logger.error(`${errorMessage} - Max retries reached, giving up`);
          throw new Error(`NATS initialization failed after ${maxRetries} attempts: ${String(error)}`);
        }

        this.logger.warn(`${errorMessage} - Retrying in ${retryDelayMs}ms`);
        await this.delay(retryDelayMs);
      }
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
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
    } catch (error) {
      this.logger.error(`Failed to send message to event-director: ${String(error)}`);
      throw error;
    }
  }

  isReady(): boolean {
    return this.isInitialized;
  }
}
