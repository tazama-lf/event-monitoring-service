import * as cluster from 'node:cluster';
import * as os from 'node:os';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { LoggerService } from '@tazama-lf/frms-coe-lib';
import { AppModule } from './app.module';

/**
 * Service for managing Node.js clustering with NestJS configuration.
 *
 * This service reads the MAX_CPU environment variable to determine the maximum
 * number of worker processes to spawn. The actual number of workers will be
 * the minimum of MAX_CPU and the actual CPU count available on the system.
 *
 * Clustering is automatically enabled based on NODE_ENV:
 * - NODE_ENV=production: Clustering enabled (if MAX_CPU > 1)
 * - NODE_ENV=development (or other): Single instance mode
 *
 * Environment Variables:
 * - NODE_ENV: Determines clustering behavior (production = clustered)
 * - MAX_CPU: Maximum number of CPU cores/workers to use (defaults to 1)
 *
 *
 * @example
 * // In .env file
 * NODE_ENV=production
 * MAX_CPU=4
 *
 * // This will create maximum 4 workers, or fewer if system has less than 4 CPUs
 */
@Injectable()
export class AppClusterService {
  private readonly LOG_CONTEXT = AppClusterService.name;

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
  ) {}

  /**
   * Static method to initialize clustering with proper configuration
   * This method creates a temporary NestJS app to access configuration
   */
  static async clusterize(callback: () => Promise<void>): Promise<void> {
    // Create temporary app to access configuration
    const tempApp = await NestFactory.create(AppModule, { logger: false });
    const configService = tempApp.get(ConfigService);
    const loggerService = tempApp.get(LoggerService);

    const maxCpu = configService.get<number>('maxCpu', os.cpus().length);
    const numCPUs = Math.min(maxCpu, os.cpus().length);

    await tempApp.close();

    // If MAX_CPU is 1, run as single process without clustering
    if (numCPUs <= 1) {
      await callback();
      return;
    }

    if (cluster.default.isPrimary) {
      loggerService.log(`Master server started on ${process.pid} with ${numCPUs} workers (maxCpu: ${maxCpu})`, 'AppClusterService');
      for (let i = 0; i < numCPUs; i++) {
        cluster.default.fork();
      }
      cluster.default.on('exit', (worker) => {
        loggerService.log(`Worker ${worker.process.pid} died. Restarting`, 'AppClusterService');
        // cluster.default.fork();
      });
    } else {
      loggerService.log(`Cluster worker started on ${process.pid}`, 'AppClusterService');
      await callback();
    }
  }
}
