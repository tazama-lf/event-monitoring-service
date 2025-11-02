import { Test, TestingModule } from '@nestjs/testing';
import { LoggerService } from '@tazama-lf/frms-coe-lib';
import { StartupFactory } from '@tazama-lf/frms-coe-startup-lib';
import { NatsService } from './nats.service';

jest.mock('@tazama-lf/frms-coe-startup-lib', () => ({
  StartupFactory: jest.fn().mockImplementation(() => ({
    init: jest.fn(),
    handleResponse: jest.fn(),
  })),
}));

describe('NatsService', () => {
  let service: NatsService;
  let mockLoggerService: jest.Mocked<LoggerService>;
  let mockNatsService: jest.Mocked<any>;

  beforeEach(async () => {
    mockLoggerService = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      verbose: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [NatsService, { provide: LoggerService, useValue: mockLoggerService }],
    }).compile();

    service = module.get<NatsService>(NatsService);
    mockNatsService = (service as any).natsService;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should create StartupFactory instance', () => {
      expect(StartupFactory).toHaveBeenCalledTimes(1);
    });
  });

  describe('registerConsumer', () => {
    it('should call natsService.init with correct parameters', async () => {
      const consumerStreams = ['stream1', 'stream2'];
      const producerStream = 'producer-stream';
      const messageHandler = jest.fn();

      mockNatsService.init.mockResolvedValue(undefined);

      await service.registerConsumer(consumerStreams, producerStream, messageHandler);

      expect(mockNatsService.init).toHaveBeenCalledWith(messageHandler, mockLoggerService, consumerStreams, producerStream);
      expect(mockLoggerService.log).toHaveBeenCalledWith('NATS consumer registered for: stream1, stream2');
    });

    it('should handle single consumer stream', async () => {
      const consumerStreams = ['single-stream'];
      const producerStream = 'producer-stream';
      const messageHandler = jest.fn();

      mockNatsService.init.mockResolvedValue(undefined);

      await service.registerConsumer(consumerStreams, producerStream, messageHandler);

      expect(mockNatsService.init).toHaveBeenCalledWith(messageHandler, mockLoggerService, consumerStreams, producerStream);
      expect(mockLoggerService.log).toHaveBeenCalledWith('NATS consumer registered for: single-stream');
    });

    it('should propagate errors from natsService.init', async () => {
      const consumerStreams = ['stream1'];
      const producerStream = 'producer-stream';
      const messageHandler = jest.fn();
      const error = new Error('Init failed');

      mockNatsService.init.mockRejectedValue(error);

      await expect(service.registerConsumer(consumerStreams, producerStream, messageHandler)).rejects.toThrow('Init failed');
      expect(mockLoggerService.log).not.toHaveBeenCalled();
    });
  });

  describe('notifyEventDirector', () => {
    it('should call natsService.handleResponse with payload', async () => {
      const payload = { messageId: 'test-123', data: 'test-data' };
      mockNatsService.handleResponse.mockResolvedValue(undefined);

      await service.notifyEventDirector(payload);

      expect(mockNatsService.handleResponse).toHaveBeenCalledWith(payload);
    });

    it('should handle complex payload objects', async () => {
      const complexPayload = {
        messageId: 'complex-123',
        transaction: {
          id: 'tx-456',
          amount: 100.5,
          currency: 'USD',
        },
        metadata: {
          timestamp: '2024-01-01T00:00:00Z',
          source: 'test-system',
        },
      };

      mockNatsService.handleResponse.mockResolvedValue(undefined);

      await service.notifyEventDirector(complexPayload);

      expect(mockNatsService.handleResponse).toHaveBeenCalledWith(complexPayload);
    });

    it('should propagate errors from handleResponse', async () => {
      const payload = { test: 'data' };
      const error = new Error('Handle response failed');
      mockNatsService.handleResponse.mockRejectedValue(error);

      await expect(service.notifyEventDirector(payload)).rejects.toThrow('Handle response failed');
    });

    it('should handle string errors from handleResponse', async () => {
      const payload = { test: 'data' };
      const error = 'String error message';
      mockNatsService.handleResponse.mockRejectedValue(error);

      await expect(service.notifyEventDirector(payload)).rejects.toBe(error);
    });
  });
});
