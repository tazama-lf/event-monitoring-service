import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { Request } from 'express';
import { DemsEngineController } from './dems-engine.controller';
import { DemsEngineService } from './dems-engine.service';
import { LoggerService } from '@tazama-lf/frms-coe-lib';
import { TazamaAuthGuard } from '../auth/tazama-auth.guard';
import { AuthenticatedUser } from '../auth/auth.types';
import { MessageHandlerResponse } from '../interfaces/iMessagerHandlerResponse';

describe('DemsEngineController', () => {
  let controller: DemsEngineController;
  let mockDemsEngineService: jest.Mocked<DemsEngineService>;
  let mockLoggerService: jest.Mocked<LoggerService>;

  const mockUser: AuthenticatedUser = {
    token: {
      clientId: 'test-client',
      tenantId: 'test-tenant',
      sub: 'user-123',
      exp: 1234567890,
      iat: 1234567890,
      roles: ['dems.write'],
      sid: 'session-123',
      iss: 'test-issuer',
      tokenString: 'mock-token-string',
      claims: [],
    },
    validated: { isValid: true, errors: [] } as any,
    validClaims: ['dems.write'],
  };

  const mockRequest: Partial<Request> = {
    headers: {
      'content-type': 'application/json',
    },
  };

  const mockSuccessResult = {
    success: true,
    configuredSchema: { type: 'object', properties: { name: { type: 'string' } } },
    transactionType: 'test.transaction',
    endToEndId: 'end-to-end-123',
    tazamaPayload: {
      transaction: { name: 'John' },
      TxTp: 'test.transaction',
      dataCache: { cached: 'data' },
    },
    transactionRelationship: {
      source: 'test-source',
      destination: 'test-destination',
      TxTp: 'test.transaction',
      TenantId: 'test-tenant',
      MsgId: 'msg-123',
      CreDtTm: '2024-01-01T00:00:00Z',
      EndToEndId: 'end-to-end-123',
    },
    dataCache: {
      endpointPath: '/test/endpoint/path',
      schema: { type: 'object' },
      mapping: { test: 'mapping' },
      functions: { test: 'function' },
    },
  };

  const mockErrorResult = {
    isMatch: false,
    message: 'Validation failed',
    differences: ['Field is required'],
    schema: { type: 'object' },
  };

  beforeEach(async () => {
    mockDemsEngineService = {
      handleMessage: jest.fn(),
      saveTransactionDataAndNotify: jest.fn(),
    } as any;

    mockLoggerService = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      verbose: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DemsEngineController],
      providers: [
        { provide: DemsEngineService, useValue: mockDemsEngineService },
        { provide: LoggerService, useValue: mockLoggerService },
      ],
    })
      .overrideGuard(TazamaAuthGuard)
      .useValue({ canActivate: jest.fn(() => true) })
      .compile();

    controller = module.get<DemsEngineController>(DemsEngineController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should be defined', () => {
      expect(controller).toBeDefined();
    });
  });

  describe('messageHandler', () => {
    const validEndpoint = 'test,endpoint,path';
    const validPayload = { name: 'John Doe', age: 30 };

    it('should successfully process valid request', async () => {
      mockDemsEngineService.handleMessage.mockResolvedValue(mockSuccessResult);
      mockDemsEngineService.saveTransactionDataAndNotify.mockResolvedValue(undefined);

      const result = await controller.messageHandler(validEndpoint, validPayload, mockUser, mockRequest as Request);

      expect(mockLoggerService.log).toHaveBeenCalledWith(
        `Processing request for clientId: ${mockUser.token.clientId}, tenantId: ${mockUser.token.tenantId}, endpoint: /test/endpoint/path`,
      );
      expect(mockDemsEngineService.handleMessage).toHaveBeenCalledWith(validPayload, '/test/endpoint/path', mockUser.token.tenantId, false);
      expect(mockDemsEngineService.saveTransactionDataAndNotify).toHaveBeenCalledWith(
        mockSuccessResult.tazamaPayload,
        mockSuccessResult.transactionType,
        mockSuccessResult.endToEndId,
      );
      expect(result).toEqual({
        message: 'Everything is OK!',
        isMatch: true,
        transactionRelationship: mockSuccessResult.transactionRelationship,
        schema: mockSuccessResult.configuredSchema,
        payload: mockSuccessResult.tazamaPayload,
      });
    });

    it('should handle XML content type correctly', async () => {
      const xmlRequest: Partial<Request> = {
        headers: { 'content-type': 'application/xml' },
      };
      mockDemsEngineService.handleMessage.mockResolvedValue(mockSuccessResult);
      mockDemsEngineService.saveTransactionDataAndNotify.mockResolvedValue(undefined);

      await controller.messageHandler(validEndpoint, validPayload, mockUser, xmlRequest as Request);

      expect(mockDemsEngineService.handleMessage).toHaveBeenCalledWith(validPayload, '/test/endpoint/path', mockUser.token.tenantId, true);
    });

    it('should throw BadRequestException for invalid endpoint format', async () => {
      const invalidEndpoint = '';

      await expect(controller.messageHandler(invalidEndpoint, validPayload, mockUser, mockRequest as Request)).rejects.toThrow(
        BadRequestException,
      );

      expect(mockDemsEngineService.handleMessage).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException for endpoint without commas', async () => {
      const invalidEndpoint = 'testendpoint';

      await expect(controller.messageHandler(invalidEndpoint, validPayload, mockUser, mockRequest as Request)).rejects.toThrow(
        new BadRequestException({
          message: 'Invalid endpoint format. Endpoint must be a non-empty string containing commas.',
        }),
      );
    });

    it('should throw BadRequestException when handleMessage returns error result', async () => {
      mockDemsEngineService.handleMessage.mockResolvedValue(mockErrorResult);

      await expect(controller.messageHandler(validEndpoint, validPayload, mockUser, mockRequest as Request)).rejects.toThrow(
        new BadRequestException({
          message: mockErrorResult.message,
          differences: mockErrorResult.differences,
          schema: mockErrorResult.schema,
        }),
      );

      expect(mockLoggerService.log).toHaveBeenCalledWith(`Problem is: ${mockErrorResult.message}`);
      expect(mockDemsEngineService.saveTransactionDataAndNotify).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when saveTransactionDataAndNotify fails', async () => {
      const saveError = new Error('Database connection failed');
      mockDemsEngineService.handleMessage.mockResolvedValue(mockSuccessResult);
      mockDemsEngineService.saveTransactionDataAndNotify.mockRejectedValue(saveError);

      await expect(controller.messageHandler(validEndpoint, validPayload, mockUser, mockRequest as Request)).rejects.toThrow(
        new BadRequestException({
          message: 'Error saving transaction data or sending notification',
          differences: ['Transaction processing failed: Database connection failed'],
        }),
      );

      expect(mockLoggerService.error).toHaveBeenCalledWith('Failed to save transaction data or notify: Error: Database connection failed');
    });

    it('should log transaction relationship and data cache on success', async () => {
      mockDemsEngineService.handleMessage.mockResolvedValue(mockSuccessResult);
      mockDemsEngineService.saveTransactionDataAndNotify.mockResolvedValue(undefined);

      await controller.messageHandler(validEndpoint, validPayload, mockUser, mockRequest as Request);

      expect(mockLoggerService.log).toHaveBeenCalledWith('Dems Engine Controller - Result:', JSON.stringify(mockSuccessResult));
      expect(mockLoggerService.log).toHaveBeenCalledWith(
        ' transaction relationship',
        JSON.stringify(mockSuccessResult.transactionRelationship),
      );
      expect(mockLoggerService.log).toHaveBeenCalledWith('data cache', JSON.stringify(mockSuccessResult.dataCache));
    });

    it('should handle complex endpoint transformation', async () => {
      const complexEndpoint = 'api,v1,transactions,create';
      mockDemsEngineService.handleMessage.mockResolvedValue(mockSuccessResult);
      mockDemsEngineService.saveTransactionDataAndNotify.mockResolvedValue(undefined);

      await controller.messageHandler(complexEndpoint, validPayload, mockUser, mockRequest as Request);

      expect(mockDemsEngineService.handleMessage).toHaveBeenCalledWith(
        validPayload,
        '/api/v1/transactions/create',
        mockUser.token.tenantId,
        false,
      );
    });

    it('should handle different user tenants', async () => {
      const differentUser: AuthenticatedUser = {
        ...mockUser,
        token: {
          ...mockUser.token,
          clientId: 'different-client',
          tenantId: 'different-tenant',
        },
      };
      mockDemsEngineService.handleMessage.mockResolvedValue(mockSuccessResult);
      mockDemsEngineService.saveTransactionDataAndNotify.mockResolvedValue(undefined);

      await controller.messageHandler(validEndpoint, validPayload, differentUser, mockRequest as Request);

      expect(mockLoggerService.log).toHaveBeenCalledWith(
        'Processing request for clientId: different-client, tenantId: different-tenant, endpoint: /test/endpoint/path',
      );
      expect(mockDemsEngineService.handleMessage).toHaveBeenCalledWith(validPayload, '/test/endpoint/path', 'different-tenant', false);
    });

    it('should handle various payload types', async () => {
      const payloads = [
        { simple: 'object' },
        { nested: { data: { value: 123 } } },
        { array: [1, 2, 3] },
        { mixed: { string: 'text', number: 42, boolean: true, array: ['a', 'b'] } },
        null,
        undefined,
        'string payload',
        123,
        [],
      ];

      mockDemsEngineService.handleMessage.mockResolvedValue(mockSuccessResult);
      mockDemsEngineService.saveTransactionDataAndNotify.mockResolvedValue(undefined);

      for (const payload of payloads) {
        await controller.messageHandler(validEndpoint, payload, mockUser, mockRequest as Request);

        expect(mockDemsEngineService.handleMessage).toHaveBeenCalledWith(payload, '/test/endpoint/path', mockUser.token.tenantId, false);
      }
    });

    it('should handle content type variations', async () => {
      const contentTypes = [
        { 'content-type': 'application/json' },
        { 'content-type': 'application/xml' },
        { 'content-type': 'text/xml' },
        { 'content-type': 'application/json; charset=utf-8' },
        { 'Content-Type': 'application/XML' },
        {},
      ];

      mockDemsEngineService.handleMessage.mockResolvedValue(mockSuccessResult);
      mockDemsEngineService.saveTransactionDataAndNotify.mockResolvedValue(undefined);

      for (const headers of contentTypes) {
        const request: Partial<Request> = { headers };
        await controller.messageHandler(validEndpoint, validPayload, mockUser, request as Request);

        const expectedIsXml = headers['content-type'] === 'application/xml' || headers['Content-Type'] === 'application/XML';
        expect(mockDemsEngineService.handleMessage).toHaveBeenCalledWith(
          validPayload,
          '/test/endpoint/path',
          mockUser.token.tenantId,
          expectedIsXml,
        );
      }
    });

    it('should handle error result without schema', async () => {
      const errorResultNoSchema = {
        isMatch: false,
        message: 'Processing error',
        differences: ['Error occurred'],
      };
      mockDemsEngineService.handleMessage.mockResolvedValue(errorResultNoSchema);

      await expect(controller.messageHandler(validEndpoint, validPayload, mockUser, mockRequest as Request)).rejects.toThrow(
        new BadRequestException({
          message: 'Processing error',
          differences: ['Error occurred'],
          schema: undefined,
        }),
      );
    });

    it('should handle saveTransactionDataAndNotify with different error types', async () => {
      const errors = [
        new Error('Network timeout'),
        new TypeError('Invalid argument type'),
        'String error',
        { message: 'Object error' },
        null,
        undefined,
      ];

      mockDemsEngineService.handleMessage.mockResolvedValue(mockSuccessResult);

      for (const error of errors) {
        mockDemsEngineService.saveTransactionDataAndNotify.mockRejectedValue(error);

        await expect(controller.messageHandler(validEndpoint, validPayload, mockUser, mockRequest as Request)).rejects.toThrow(
          BadRequestException,
        );

        // eslint-disable-next-line @typescript-eslint/no-base-to-string
        expect(mockLoggerService.error).toHaveBeenCalledWith(`Failed to save transaction data or notify: ${String(error)}`);
      }
    });

    it('should validate endpoint format edge cases', async () => {
      const invalidEndpoints = [
        '',
        ' ',
        'no-commas',
        'spaces in endpoint',
        'special!@#$%^&*()characters',
        ',',
        'start,',
        ',end',
        'double,,comma',
      ];

      for (const endpoint of invalidEndpoints) {
        if (endpoint === 'double,,comma' || endpoint.includes(',')) {
          mockDemsEngineService.handleMessage.mockResolvedValue(mockSuccessResult);
          mockDemsEngineService.saveTransactionDataAndNotify.mockResolvedValue(undefined);

          await controller.messageHandler(endpoint, validPayload, mockUser, mockRequest as Request);
        } else {
          await expect(controller.messageHandler(endpoint, validPayload, mockUser, mockRequest as Request)).rejects.toThrow(
            BadRequestException,
          );
        }
      }
    });

    it('should handle success result without optional fields', async () => {
      const minimalSuccessResult = {
        success: true,
        configuredSchema: {},
        transactionType: 'minimal.tx',
        endToEndId: 'minimal-id',
        tazamaPayload: {
          transaction: {},
          TxTp: 'minimal.tx',
          dataCache: {},
        },
        transactionRelationship: {
          source: '',
          destination: '',
          TxTp: 'minimal.tx',
          TenantId: 'test-tenant',
          MsgId: 'minimal-msg',
          CreDtTm: '2024-01-01T00:00:00Z',
          EndToEndId: 'minimal-id',
        },
        dataCache: {
          endpointPath: '/test/endpoint/path',
          schema: {},
          mapping: {},
          functions: {},
        },
      };

      mockDemsEngineService.handleMessage.mockResolvedValue(minimalSuccessResult);
      mockDemsEngineService.saveTransactionDataAndNotify.mockResolvedValue(undefined);

      const result = await controller.messageHandler(validEndpoint, validPayload, mockUser, mockRequest as Request);

      expect(result).toEqual({
        message: 'Everything is OK!',
        isMatch: true,
        transactionRelationship: {
          source: '',
          destination: '',
          TxTp: 'minimal.tx',
          TenantId: 'test-tenant',
          MsgId: 'minimal-msg',
          CreDtTm: '2024-01-01T00:00:00Z',
          EndToEndId: 'minimal-id',
        },
        schema: {},
        payload: {
          transaction: {},
          TxTp: 'minimal.tx',
          dataCache: {},
        },
      });
    });

    it('should maintain proper call order', async () => {
      mockDemsEngineService.handleMessage.mockResolvedValue(mockSuccessResult);
      mockDemsEngineService.saveTransactionDataAndNotify.mockResolvedValue(undefined);

      await controller.messageHandler(validEndpoint, validPayload, mockUser, mockRequest as Request);

      const logCalls = mockLoggerService.log.mock.calls;
      expect(logCalls[0][0]).toContain('Processing request for clientId');
      expect(logCalls[1][0]).toBe('Dems Engine Controller - Result:');
      expect(logCalls[2][0]).toBe(' transaction relationship');
      expect(logCalls[3][0]).toBe('data cache');
    });

    it('should preserve original payload in service calls', async () => {
      const originalPayload = { immutable: { nested: { data: 'test' } } };
      mockDemsEngineService.handleMessage.mockResolvedValue(mockSuccessResult);
      mockDemsEngineService.saveTransactionDataAndNotify.mockResolvedValue(undefined);

      await controller.messageHandler(validEndpoint, originalPayload, mockUser, mockRequest as Request);

      expect(mockDemsEngineService.handleMessage).toHaveBeenCalledWith(
        originalPayload,
        '/test/endpoint/path',
        mockUser.token.tenantId,
        false,
      );
      expect(originalPayload).toEqual({ immutable: { nested: { data: 'test' } } });
    });
  });

  describe('Return Type Validation', () => {
    it('should return correct MessageHandlerResponse structure', async () => {
      mockDemsEngineService.handleMessage.mockResolvedValue(mockSuccessResult);
      mockDemsEngineService.saveTransactionDataAndNotify.mockResolvedValue(undefined);

      const result: MessageHandlerResponse = await controller.messageHandler(
        'test,endpoint',
        { test: 'data' },
        mockUser,
        mockRequest as Request,
      );

      expect(result).toHaveProperty('message');
      expect(result).toHaveProperty('isMatch');
      expect(result).toHaveProperty('transactionRelationship');
      expect(result).toHaveProperty('schema');
      expect(result).toHaveProperty('payload');
      expect(typeof result.message).toBe('string');
      expect(typeof result.isMatch).toBe('boolean');
    });
  });

  describe('Guard Integration', () => {
    it('should have TazamaAuthGuard applied', () => {
      const guards = Reflect.getMetadata('__guards__', DemsEngineController);
      expect(guards).toBeDefined();
    });

    it('should have RequireDemsWriteRole decorator applied', () => {
      const claims = Reflect.getMetadata('claims', controller.messageHandler);
      expect(claims).toBeDefined();
      expect(claims).toContain('dems:write');
    });
  });

  describe('Error Logging', () => {
    it('should log all relevant information during error scenarios', async () => {
      const errorResult = {
        isMatch: false,
        message: 'Detailed validation error',
        differences: ['Missing field: name', 'Invalid type: age'],
        schema: { type: 'object', required: ['name'] },
      };
      mockDemsEngineService.handleMessage.mockResolvedValue(errorResult);

      await expect(controller.messageHandler('test,endpoint', { invalid: 'payload' }, mockUser, mockRequest as Request)).rejects.toThrow(
        BadRequestException,
      );

      expect(mockLoggerService.log).toHaveBeenCalledWith(
        'Processing request for clientId: test-client, tenantId: test-tenant, endpoint: /test/endpoint',
      );
      expect(mockLoggerService.log).toHaveBeenCalledWith('Dems Engine Controller - Result:', JSON.stringify(errorResult));
      expect(mockLoggerService.log).toHaveBeenCalledWith(`Problem is: ${errorResult.message}`);
    });
  });
});
