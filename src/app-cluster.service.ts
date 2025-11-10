import * as cluster from 'node:cluster';
import * as os from 'node:os';
import { Injectable } from '@nestjs/common';

const numCPUs = os.cpus().length;
// const numCPUs = 2; // Limit to 2 for testing purposes

@Injectable()
export class AppClusterService {
  static clusterize(callback: () => Promise<void>): void {
    if (cluster.default.isPrimary) {
      console.log(`Master server started on ${process.pid}`);
      for (let i = 0; i < numCPUs; i++) {
        cluster.default.fork();
      }
      cluster.default.on('exit', (worker) => {
        console.log(`Worker ${worker.process.pid} died. Restarting`);
        // cluster.default.fork();
      });
    } else {
      console.log(`Cluster server started on ${process.pid}`);
      callback();
    }
  }
}
