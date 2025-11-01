import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from './app.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppModule', () => {
  let app: TestingModule;

  beforeEach(async () => {
    app = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
      imports: [],
    }).compile();
  });

  describe('Module Compilation', () => {
    it('should compile successfully', () => {
      expect(app).toBeDefined();
    });

    it('should be an instance of TestingModule', () => {
      expect(app).toBeInstanceOf(TestingModule);
    });
  });

  describe('Controller Registration', () => {
    it('should register AppController', () => {
      const controller = app.get<AppController>(AppController);
      expect(controller).toBeDefined();
      expect(controller).toBeInstanceOf(AppController);
    });

    it('should resolve AppController with dependencies', () => {
      const controller = app.get<AppController>(AppController);
      expect(controller.getHello()).toBe('Hello World!');
    });
  });

  describe('Service Registration', () => {
    it('should register AppService', () => {
      const service = app.get<AppService>(AppService);
      expect(service).toBeDefined();
      expect(service).toBeInstanceOf(AppService);
    });

    it('should provide AppService functionality', () => {
      const service = app.get<AppService>(AppService);
      expect(service.getHello()).toBe('Hello World!');
    });
  });

  describe('Dependency Injection', () => {
    it('should resolve all dependencies correctly', () => {
      const controller = app.get<AppController>(AppController);
      const service = app.get<AppService>(AppService);

      expect(controller).toBeDefined();
      expect(service).toBeDefined();
    });

    it('should maintain singleton pattern for services', () => {
      const service1 = app.get<AppService>(AppService);
      const service2 = app.get<AppService>(AppService);

      expect(service1).toBe(service2);
    });
  });

  describe('Module Structure', () => {
    it('should have proper module metadata', () => {
      const moduleMetadata = Reflect.getMetadata('imports', AppModule);
      expect(moduleMetadata).toBeDefined();
      expect(Array.isArray(moduleMetadata)).toBe(true);
    });

    it('should have controllers metadata', () => {
      const controllersMetadata = Reflect.getMetadata('controllers', AppModule);
      expect(controllersMetadata).toBeDefined();
      expect(Array.isArray(controllersMetadata)).toBe(true);
    });

    it('should have providers metadata', () => {
      const providersMetadata = Reflect.getMetadata('providers', AppModule);
      expect(providersMetadata).toBeDefined();
      expect(Array.isArray(providersMetadata)).toBe(true);
    });
  });

  describe('Type Safety', () => {
    it('should maintain proper TypeScript types', () => {
      const controller = app.get<AppController>(AppController);
      const service = app.get<AppService>(AppService);

      expect(controller).toBeInstanceOf(AppController);
      expect(service).toBeInstanceOf(AppService);
    });

    it('should enforce type constraints', () => {
      expect(() => {
        app.get<AppService>(AppService);
      }).not.toThrow();
    });
  });
});
