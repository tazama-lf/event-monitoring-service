import { Test, type TestingModule } from '@nestjs/testing';
import { ConfigNotifyController } from './config-notify.controller';
import { ConfigNotifyService } from './config-notify.service';

describe('ConfigNotifyController', () => {
  let controller: ConfigNotifyController;

  const mockConfigNotifyService = {
    handleNotification: jest.fn(),
    getCachedConfig: jest.fn(),
    getTenantConfigs: jest.fn(),
    getAllCachedConfigs: jest.fn(),
    clearCache: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ConfigNotifyController],
      providers: [
        {
          provide: ConfigNotifyService,
          useValue: mockConfigNotifyService,
        },
      ],
    }).compile();

    controller = module.get<ConfigNotifyController>(ConfigNotifyController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
