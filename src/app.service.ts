import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  private readonly appStatus = 'UP';

  handleHealthCheck(): { status: string } {
    return { status: this.appStatus };
  }
}
