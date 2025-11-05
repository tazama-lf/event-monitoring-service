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
});
