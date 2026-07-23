import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { Request } from 'express';
import { DemsEngineController } from '../../src/dems-engine/dems-engine.controller';
import { DemsEngineService } from '../../src/dems-engine/dems-engine.service';
import { LoggerService } from '@tazama-lf/frms-coe-lib';
import { TazamaAuthGuard } from '../../src/auth/tazama-auth.guard';
import { AuthenticatedUser } from '../../src/auth/auth.types';
import { MessageHandlerResponse } from '../../src/interfaces/iMessagerHandlerResponse';

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
    get: jest.fn().mockImplementation((headerName: string) => {
      if (headerName.toLowerCase() === 'content-type') {
        return 'application/json';
      }
      return undefined;
    }),
  };

  const mockSuccessResult = {
    success: true,
    configuredSchema: { type: 'object', properties: { name: { type: 'string' } } },
    transactionType: 'test.transaction',
    endToEndId: 'end-to-end-123',
    tazamaPayload: {
      transaction: { name: 'John' },
      TxTp: 'test.transaction',
      DataCache: { cached: 'data' },
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
    DataCache: {
      endpointPath: '/test/endpoint/path',
      schema: { type: 'object' },
      mapping: { test: 'mapping' },
      functions: { test: 'function' },
      related_transaction: '',
      publishing_status: 'active',
      tenant_id: 'test-tenant',
    },
    publishing_status: 'active',
    trackedFields: {
      CreDtTm: '2024-01-01T00:00:00Z',
      MsgId: 'msg-123',
      EndToEndId: 'end-to-end-123',
      dbtrAcctId: 'debtor-account-123',
      cdtrAcctId: 'creditor-account-123',
      TenantId: 'test-tenant',
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
    const validEndpoint = 'test-tenant,endpoint,path';
    const validPayload = { name: 'John Doe', age: 30 };

    it('should successfully process valid JSON request', async () => {
      mockDemsEngineService.handleMessage.mockResolvedValue(mockSuccessResult);
      mockDemsEngineService.saveTransactionDataAndNotify.mockResolvedValue(undefined);

      const result = await controller.messageHandler(validEndpoint, validPayload, mockUser, mockRequest as Request);

      expect(mockDemsEngineService.handleMessage).toHaveBeenCalledWith(
        validPayload,
        '/test-tenant/endpoint/path',
        mockUser.token.tenantId,
        false,
      );
      expect(mockDemsEngineService.saveTransactionDataAndNotify).toHaveBeenCalled();
      expect(result.isMatch).toBe(true);
      expect(result.message).toBe('Everything is OK!');
    });

    it('should handle XML content type', async () => {
      const xmlRequest: Partial<Request> = {
        headers: { 'content-type': 'application/xml' },
        get: jest.fn().mockImplementation((headerName: string) => {
          if (headerName.toLowerCase() === 'content-type') {
            return 'application/xml';
          }
          return undefined;
        }),
      };
      mockDemsEngineService.handleMessage.mockResolvedValue(mockSuccessResult);
      mockDemsEngineService.saveTransactionDataAndNotify.mockResolvedValue(undefined);

      await controller.messageHandler(validEndpoint, validPayload, mockUser, xmlRequest as Request);

      expect(mockDemsEngineService.handleMessage).toHaveBeenCalledWith(
        validPayload,
        '/test-tenant/endpoint/path',
        mockUser.token.tenantId,
        true,
      );
    });

    it('should throw BadRequestException for invalid endpoint format', async () => {
      await expect(controller.messageHandler('', validPayload, mockUser, mockRequest as Request)).rejects.toThrow(BadRequestException);
      await expect(controller.messageHandler('no-commas', validPayload, mockUser, mockRequest as Request)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when validation fails', async () => {
      mockDemsEngineService.handleMessage.mockResolvedValue(mockErrorResult);

      await expect(controller.messageHandler(validEndpoint, validPayload, mockUser, mockRequest as Request)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockDemsEngineService.saveTransactionDataAndNotify).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when save fails', async () => {
      mockDemsEngineService.handleMessage.mockResolvedValue(mockSuccessResult);
      mockDemsEngineService.saveTransactionDataAndNotify.mockRejectedValue(new Error('Save failed'));

      await expect(controller.messageHandler(validEndpoint, validPayload, mockUser, mockRequest as Request)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when tenant ID mismatch', async () => {
      const mismatchedEndpoint = 'different-tenant,endpoint,path';

      await expect(controller.messageHandler(mismatchedEndpoint, validPayload, mockUser, mockRequest as Request)).rejects.toThrow(
        BadRequestException,
      );

      expect(mockLoggerService.error).toHaveBeenCalledWith(expect.stringContaining('Tenant ID mismatch'), 'DemsEngineController');
      expect(mockDemsEngineService.handleMessage).not.toHaveBeenCalled();
    });
  });
});
