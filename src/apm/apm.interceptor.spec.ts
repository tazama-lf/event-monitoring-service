// SPDX-License-Identifier: Apache-2.0

import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { ApmInterceptor } from './apm.interceptor';
import { ApmService } from './apm.service';
import { of, throwError } from 'rxjs';
import apm from 'elastic-apm-node';

// Mock elastic-apm-node
jest.mock('elastic-apm-node', () => ({
  captureError: jest.fn(),
}));

describe('ApmInterceptor', () => {
  let interceptor: ApmInterceptor;
  let apmService: ApmService;
  let mockTransaction: any;
  let mockExecutionContext: ExecutionContext;
  let mockCallHandler: jest.Mocked<CallHandler>;
  let mockRequest: any;
  let mockResponse: any;

  beforeEach(async () => {
    // Create mock objects
    mockTransaction = {
      id: 'transaction-123',
      result: '',
      addLabels: jest.fn(),
      setOutcome: jest.fn(),
      end: jest.fn(),
    };

    mockRequest = {
      method: 'GET',
      url: '/api/users',
      route: { path: '/api/users/:id' },
      get: jest.fn().mockReturnValue('Mozilla/5.0'),
    };

    mockResponse = {
      statusCode: 200,
    };

    mockExecutionContext = {
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue(mockRequest),
        getResponse: jest.fn().mockReturnValue(mockResponse),
      }),
    } as any;

    mockCallHandler = {
      handle: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApmInterceptor,
        {
          provide: ApmService,
          useValue: {
            startTransaction: jest.fn().mockReturnValue(mockTransaction),
          },
        },
      ],
    }).compile();

    interceptor = module.get<ApmInterceptor>(ApmInterceptor);
    apmService = module.get<ApmService>(ApmService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    // Reset the apm mock
    (apm.captureError as jest.Mock).mockClear();
  });

  it('should be defined', () => {
    expect(interceptor).toBeDefined();
  });

  describe('intercept', () => {
    it('should create transaction with correct name for route with path', (done) => {
      mockCallHandler.handle.mockReturnValue(of('success'));

      interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe({
        next: (result) => {
          expect(apmService.startTransaction).toHaveBeenCalledWith('GET /api/users/:id');
          expect(result).toBe('success');
          done();
        },
      });
    });

    it('should create transaction with URL when route path is not available', (done) => {
      mockRequest.route = null;
      mockCallHandler.handle.mockReturnValue(of('success'));

      interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe({
        next: (result) => {
          expect(apmService.startTransaction).toHaveBeenCalledWith('GET /api/users');
          expect(result).toBe('success');
          done();
        },
      });
    });

    it('should add labels to transaction', (done) => {
      mockCallHandler.handle.mockReturnValue(of('success'));

      interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe({
        complete: () => {
          expect(mockTransaction.addLabels).toHaveBeenCalledWith({
            'http.method': 'GET',
            'http.url': '/api/users',
            'user.agent': 'Mozilla/5.0',
          });
          done();
        },
      });
    });

    it('should handle missing user agent', (done) => {
      mockRequest.get.mockReturnValue(undefined);
      mockCallHandler.handle.mockReturnValue(of('success'));

      interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe({
        complete: () => {
          expect(mockTransaction.addLabels).toHaveBeenCalledWith({
            'http.method': 'GET',
            'http.url': '/api/users',
            'user.agent': 'unknown',
          });
          done();
        },
      });
    });

    it('should set transaction result to success and end transaction on success', (done) => {
      mockCallHandler.handle.mockReturnValue(of('success'));

      interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe({
        complete: () => {
          expect(mockTransaction.result).toBe('success');
          expect(mockTransaction.setOutcome).toHaveBeenCalledWith('success');
          expect(mockTransaction.addLabels).toHaveBeenCalledWith({
            'http.status_code': 200,
          });
          expect(mockTransaction.end).toHaveBeenCalled();
          done();
        },
      });
    });

    it('should handle errors and capture them in APM', (done) => {
      const error = new Error('Test error');
      mockCallHandler.handle.mockReturnValue(throwError(() => error));
      mockResponse.statusCode = 500;

      interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe({
        error: (err) => {
          expect(err).toBe(error);
          expect(apm.captureError).toHaveBeenCalledWith(error);
          expect(mockTransaction.result).toBe('error');
          expect(mockTransaction.setOutcome).toHaveBeenCalledWith('failure');
          expect(mockTransaction.addLabels).toHaveBeenCalledWith({
            'error.type': 'Error',
            'error.message': 'Test error',
            'http.status_code': 500,
          });
          expect(mockTransaction.end).toHaveBeenCalled();
          done();
        },
      });
    });

    it('should handle custom error types', (done) => {
      // Create fresh mocks for this test
      const freshTransaction = {
        id: 'transaction-456',
        result: '',
        addLabels: jest.fn(),
        setOutcome: jest.fn(),
        end: jest.fn(),
      } as any;

      jest.spyOn(apmService, 'startTransaction').mockReturnValue(freshTransaction);

      class CustomError extends Error {
        constructor(message: string) {
          super(message);
          this.name = 'CustomError';
        }
      }

      const error = new CustomError('Custom error message');
      mockResponse.statusCode = 500;
      mockCallHandler.handle.mockReturnValue(throwError(() => error));

      interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe({
        error: (err) => {
          expect(err).toBe(error);
          // Check that addLabels was called with error information (second call)
          expect(freshTransaction.addLabels).toHaveBeenCalledWith({
            'error.type': 'CustomError',
            'error.message': 'Custom error message',
            'http.status_code': 500,
          });
          done();
        },
      });
    });

    it('should use default status code 500 when response status is not set', (done) => {
      mockResponse.statusCode = undefined;
      const error = new Error('Test error');
      mockCallHandler.handle.mockReturnValue(throwError(() => error));

      interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe({
        error: () => {
          expect(mockTransaction.addLabels).toHaveBeenCalledWith({
            'error.type': 'Error',
            'error.message': 'Test error',
            'http.status_code': 500,
          });
          done();
        },
      });
    });

    it('should handle when APM service returns null transaction', (done) => {
      jest.spyOn(apmService, 'startTransaction').mockReturnValue(null);
      mockCallHandler.handle.mockReturnValue(of('success'));

      interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe({
        next: (result) => {
          expect(result).toBe('success');
          // Should not try to call methods on null transaction
          expect(mockTransaction.addLabels).not.toHaveBeenCalled();
          done();
        },
      });
    });

    it('should handle error when transaction is null', (done) => {
      jest.spyOn(apmService, 'startTransaction').mockReturnValue(null);
      const error = new Error('Test error');
      mockCallHandler.handle.mockReturnValue(throwError(() => error));

      interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe({
        error: (err) => {
          expect(err).toBe(error);
          // When transaction is null, apm.captureError is not called (current behavior)
          expect(apm.captureError).not.toHaveBeenCalled();
          // Should not try to call methods on null transaction
          expect(mockTransaction.addLabels).not.toHaveBeenCalled();
          done();
        },
      });
    });

    it('should handle different HTTP methods', (done) => {
      const methods = ['POST', 'PUT', 'DELETE', 'PATCH'];
      let completedCount = 0;

      methods.forEach((method) => {
        mockRequest.method = method;
        mockCallHandler.handle.mockReturnValue(of('success'));

        interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe({
          complete: () => {
            completedCount++;
            if (completedCount === methods.length) {
              expect(apmService.startTransaction).toHaveBeenCalledWith(`${method} /api/users/:id`);
              done();
            }
          },
        });
      });
    });

    it('should handle different response status codes', (done) => {
      const statusCodes = [200, 201, 404, 500];
      let completedCount = 0;

      statusCodes.forEach((statusCode) => {
        mockResponse.statusCode = statusCode;
        mockCallHandler.handle.mockReturnValue(of('success'));

        interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe({
          complete: () => {
            completedCount++;
            if (completedCount === statusCodes.length) {
              expect(mockTransaction.addLabels).toHaveBeenCalledWith({
                'http.status_code': statusCode,
              });
              done();
            }
          },
        });
      });
    });
  });
});
