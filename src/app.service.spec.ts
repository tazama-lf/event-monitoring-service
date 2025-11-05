import { Test, TestingModule } from '@nestjs/testing';
import { AppService } from './app.service';

describe('AppService', () => {
  let service: AppService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AppService],
    }).compile();

    service = module.get<AppService>(AppService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Service Initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should be an instance of AppService', () => {
      expect(service).toBeInstanceOf(AppService);
    });
  });

  describe('handleHealthCheck', () => {
    it('should return { status: "UP" }', () => {
      const result = service.handleHealthCheck();
      expect(result).toEqual({ status: 'UP' });
    });

    it('should return object type', () => {
      const result = service.handleHealthCheck();
      expect(typeof result).toBe('object');
    });
  });
});
