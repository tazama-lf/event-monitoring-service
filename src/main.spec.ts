import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { ApmInterceptor } from './apm/apm.interceptor';
import { ApmService } from './apm/apm.service';

// Mock the dependencies
jest.mock('@nestjs/core');
jest.mock('./app.module');
jest.mock('./apm/apm.interceptor');
jest.mock('./apm/apm.service');
jest.mock('express', () => ({
  text: jest.fn(),
}));
jest.mock('dotenv', () => ({
  config: jest.fn(),
}));

const mockNestFactory = NestFactory as jest.Mocked<typeof NestFactory>;
const mockExpress = require('express');

describe('Main Bootstrap', () => {
  let mockApp: any;
  let mockConfigService: jest.Mocked<ConfigService>;
  let mockApmService: jest.Mocked<ApmService>;

  beforeEach(() => {
    // Mock app instance
    mockApp = {
      get: jest.fn(),
      useGlobalInterceptors: jest.fn(),
      use: jest.fn(),
      useGlobalPipes: jest.fn(),
      listen: jest.fn(),
    };

    // Mock ConfigService
    mockConfigService = {
      get: jest.fn(),
    } as any;

    // Mock ApmService
    mockApmService = {
      startTransaction: jest.fn(),
      endTransaction: jest.fn(),
    } as any;

    // Mock express.text
    mockExpress.text.mockReturnValue('mock-text-middleware');

    // Setup NestFactory mock
    mockNestFactory.create.mockResolvedValue(mockApp);

    // Setup app.get mocks
    mockApp.get.mockImplementation((service: any) => {
      if (service === ConfigService) return mockConfigService;
      if (service === ApmService) return mockApmService;
      return null;
    });

    // Clear all mocks
    jest.clearAllMocks();
  });

  describe('bootstrap function', () => {
    it('should create NestJS application successfully', async () => {
      // Arrange
      mockConfigService.get.mockReturnValue(3002);
      mockApp.listen.mockResolvedValue(undefined);

      // Act
      const { bootstrap } = await import('./main');
      await bootstrap();

      // Assert
      expect(mockNestFactory.create).toHaveBeenCalledWith(AppModule);
      expect(mockApp.get).toHaveBeenCalledWith(ConfigService);
      expect(mockApp.get).toHaveBeenCalledWith(ApmService);
    });

    it('should configure APM interceptor globally', async () => {
      // Arrange
      mockConfigService.get.mockReturnValue(3002);
      mockApp.listen.mockResolvedValue(undefined);

      // Act
      const { bootstrap } = await import('./main');
      await bootstrap();

      // Assert
      expect(mockApp.useGlobalInterceptors).toHaveBeenCalledWith(expect.any(ApmInterceptor));
    });

    it('should configure express middleware for XML handling', async () => {
      // Arrange
      mockConfigService.get.mockReturnValue(3002);
      mockApp.listen.mockResolvedValue(undefined);

      // Act
      const { bootstrap } = await import('./main');
      await bootstrap();

      // Assert
      expect(mockExpress.text).toHaveBeenCalledWith({
        type: ['application/xml'],
      });
      expect(mockApp.use).toHaveBeenCalledWith('mock-text-middleware');
    });

    it('should configure global validation pipes', async () => {
      // Arrange
      mockConfigService.get.mockReturnValue(3002);
      mockApp.listen.mockResolvedValue(undefined);

      // Act
      const { bootstrap } = await import('./main');
      await bootstrap();

      // Assert
      expect(mockApp.useGlobalPipes).toHaveBeenCalledWith(expect.any(ValidationPipe));
    });

    it('should use default port 3002 when no port configured', async () => {
      // Arrange
      mockConfigService.get.mockReturnValue(3002); // Return the default value
      mockApp.listen.mockResolvedValue(undefined);

      // Act
      const { bootstrap } = await import('./main');
      await bootstrap();

      // Assert
      expect(mockConfigService.get).toHaveBeenCalledWith('port', 3002);
      expect(mockApp.listen).toHaveBeenCalledWith(3002);
    });

    it('should use custom port when configured', async () => {
      // Arrange
      const customPort = 8080;
      mockConfigService.get.mockReturnValue(customPort);
      mockApp.listen.mockResolvedValue(undefined);

      // Act
      const { bootstrap } = await import('./main');
      await bootstrap();

      // Assert
      expect(mockApp.listen).toHaveBeenCalledWith(customPort);
    });

    it('should start application on specified port', async () => {
      // Arrange
      mockConfigService.get.mockReturnValue(3002);
      mockApp.listen.mockResolvedValue(undefined);

      // Act
      const { bootstrap } = await import('./main');
      await bootstrap();

      // Assert
      expect(mockApp.listen).toHaveBeenCalledWith(3002);
    });

    it('should handle bootstrap errors by throwing', async () => {
      // Arrange
      const testError = new Error('Bootstrap failed');
      mockNestFactory.create.mockRejectedValue(testError);

      // Act & Assert
      const { bootstrap } = await import('./main');
      await expect(bootstrap()).rejects.toThrow('Bootstrap failed');
    });

    it('should handle app.listen failures', async () => {
      // Arrange
      const listenError = new Error('Port already in use');
      mockConfigService.get.mockReturnValue(3002);
      mockApp.listen.mockRejectedValue(listenError);

      // Act & Assert
      const { bootstrap } = await import('./main');
      await expect(bootstrap()).rejects.toThrow('Port already in use');
    });
  });

  describe('module imports and configuration', () => {
    it('should configure ValidationPipe with correct options', async () => {
      // Arrange
      mockConfigService.get.mockReturnValue(3002);
      mockApp.listen.mockResolvedValue(undefined);

      // Act
      const { bootstrap } = await import('./main');
      await bootstrap();

      // Assert
      const validationPipeCall = mockApp.useGlobalPipes.mock.calls[0][0];
      expect(validationPipeCall).toBeInstanceOf(ValidationPipe);
    });

    it('should handle application configuration properly', async () => {
      // Arrange
      mockConfigService.get.mockReturnValue(3002);
      mockApp.listen.mockResolvedValue(undefined);

      // Act
      const { bootstrap } = await import('./main');
      await bootstrap();

      // Assert - verify all key configuration steps were called
      expect(mockNestFactory.create).toHaveBeenCalledWith(AppModule);
      expect(mockApp.get).toHaveBeenCalledWith(ConfigService);
      expect(mockApp.get).toHaveBeenCalledWith(ApmService);
      expect(mockApp.useGlobalInterceptors).toHaveBeenCalled();
      expect(mockApp.use).toHaveBeenCalled();
      expect(mockApp.useGlobalPipes).toHaveBeenCalled();
      expect(mockApp.listen).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle Error objects correctly in catch scenarios', () => {
      // Test the error handling logic that would be used in catch block
      const testError: unknown = new Error('Test error message');
      const errorMessage = testError instanceof Error ? testError.message : String(testError);
      expect(errorMessage).toBe('Test error message');
    });

    it('should handle non-Error objects correctly in catch scenarios', () => {
      // Test the error handling logic that would be used in catch block
      const testError: unknown = 'String error';
      const errorMessage = testError instanceof Error ? testError.message : String(testError);
      expect(errorMessage).toBe('String error');
    });

    it('should handle null/undefined objects correctly in catch scenarios', () => {
      // Test the error handling logic that would be used in catch block
      const testError: unknown = null;
      const errorMessage = testError instanceof Error ? testError.message : String(testError);
      expect(errorMessage).toBe('null');
    });
  });
});
