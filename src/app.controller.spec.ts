import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let controller: AppController;
  let service: AppService;

  const mockAppService = {
    handleHealthCheck: jest.fn().mockReturnValue({ status: 'UP' }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        {
          provide: AppService,
          useValue: mockAppService,
        },
      ],
    }).compile();

    controller = module.get<AppController>(AppController);
    service = module.get<AppService>(AppService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Basic Functionality', () => {
    it('should be defined', () => {
      expect(controller).toBeDefined();
    });

    it('should return { status: "UP" } from handleHealthCheck', () => {
      const result = controller.handleHealthCheck();

      expect(result).toEqual('UP');
      expect(service.handleHealthCheck).toHaveBeenCalled();
    });

    it('should delegate to AppService for handleHealthCheck', () => {
      controller.handleHealthCheck();
      expect(service.handleHealthCheck).toHaveBeenCalled();
    });
  });
});
