import * as cluster from 'node:cluster';
import * as os from 'node:os';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

/**
 * Service for managing Node.js clustering with NestJS configuration.
 *
 * This service reads the MAX_CPU environment variable to determine the maximum
 * number of worker processes to spawn. The actual number of workers will be
 * the minimum of MAX_CPU and the actual CPU count available on the system.
 *
 * Environment Variables:
 * - MAX_CPU: Maximum number of CPU cores/workers to use (defaults to 1)
 *
 *
 * @example
 * // In .env file
 * MAX_CPU=4
 *
 * // This will create maximum 4 workers, or fewer if system has less than 4 CPUs
 */
@Injectable()
export class AppClusterService {
  constructor(private readonly configService: ConfigService) {}

  /**
   * Static method to initialize clustering with proper configuration
   * This method creates a temporary NestJS app to access configuration
   */
  static async clusterize(callback: () => Promise<void>): Promise<void> {
    // Create temporary app to access configuration
    const tempApp = await NestFactory.create(AppModule, { logger: false });
    const configService = tempApp.get(ConfigService);

    const maxCpu = configService.get<number>('maxCpu', os.cpus().length);
    const numCPUs = Math.min(maxCpu, os.cpus().length);

    await tempApp.close();

    // If MAX_CPU is 1, run as single process without clustering
    if (numCPUs <= 1) {
      console.log(`Running in single process mode (maxCpu: ${maxCpu})`);
      await callback();
      return;
    }

    // Only use clustering for MAX_CPU > 1
    if (cluster.default.isPrimary) {
      console.log(`Master server started on ${process.pid} with ${numCPUs} workers (maxCpu: ${maxCpu})`);
      for (let i = 0; i < numCPUs; i++) {
        cluster.default.fork();
      }
      cluster.default.on('exit', (worker) => {
        console.log(`Worker ${worker.process.pid} died. Restarting`);
        // cluster.default.fork();
      });
    } else {
      console.log(`Cluster worker started on ${process.pid}`);
      await callback();
    }
  }

  /**
   * Instance method for clustering (when ConfigService is already available)
   */
  async clusterizeInstance(callback: () => Promise<void>): Promise<void> {
    const maxCpu = this.configService.get<number>('maxCpu', os.cpus().length);
    const numCPUs = Math.min(maxCpu, os.cpus().length);

    // If MAX_CPU is 1, run as single process without clustering
    if (numCPUs <= 1) {
      console.log(`Running in single process mode (maxCpu: ${maxCpu})`);
      await callback();
      return;
    }

    // Only use clustering for MAX_CPU > 1
    if (cluster.default.isPrimary) {
      console.log(`Master server started on ${process.pid} with ${numCPUs} workers (maxCpu: ${maxCpu})`);
      for (let i = 0; i < numCPUs; i++) {
        cluster.default.fork();
      }
      cluster.default.on('exit', (worker) => {
        console.log(`Worker ${worker.process.pid} died. Restarting`);
        // cluster.default.fork();
      });
    } else {
      console.log(`Cluster worker started on ${process.pid}`);
      await callback();
    }
  }
}
