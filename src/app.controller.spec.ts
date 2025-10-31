import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let controller: AppController;
  let mockAppService: Partial<AppService>;

  beforeEach(() => {
    mockAppService = {
      getHello: jest.fn().mockReturnValue('hello world'),
    };

    controller = new AppController(mockAppService as AppService);
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
