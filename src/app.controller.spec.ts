import { AppController } from './app.controller';
import { AppService } from './app.service';
import { NatsService } from './nats/nats.service';

describe('AppController', () => {
  let controller: AppController;
  let mockAppService: Partial<AppService>;
  let mockNatsService: Partial<NatsService>;

  beforeEach(() => {
    mockAppService = {
      getHello: jest.fn().mockReturnValue('hello world'),
    };

    mockNatsService = {
      isReady: jest.fn().mockReturnValue(true),
    };

    controller = new AppController(mockAppService as AppService, mockNatsService as NatsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return hello from AppService', () => {
    const result = controller.getHello();
    expect(result).toBe('hello world');
    expect(mockAppService.getHello).toHaveBeenCalledTimes(1);
  });
});
