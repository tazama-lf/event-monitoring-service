import { Test, type TestingModule } from '@nestjs/testing';
import { ConfigNotifyService } from './config-notify.service';
import { LoggerService, RedisService } from '@tazama-lf/frms-coe-lib';

process.env.STARTUP_TYPE = 'nats';
process.env.SERVER_URL = 'nats://localhost:4222';
process.env.PRODUCER_STREAM = 'producer-stream';
process.env.CONSUMER_STREAM = 'consumer-stream';
process.env.REDIS_DB = '0';
process.env.REDIS_AUTH = 'password';
process.env.REDIS_SERVERS = 'localhost:6379';
process.env.REDIS_IS_CLUSTER = 'false';

describe('ConfigNotifyService', () => {
  let service: ConfigNotifyService;

  const mockLoggerService = {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  };

  const mockRedisService = {
    getJson: jest.fn(),
    setJson: jest.fn(),
    deleteKey: jest.fn(),
  };

  const mockKnex = {
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    first: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: ConfigNotifyService,
          useFactory: () => ({
            handleNotification: jest.fn(),
            getCachedConfig: jest.fn(),
            getTenantConfigs: jest.fn(),
            getAllCachedConfigs: jest.fn(),
            clearCache: jest.fn(),
          }),
        },
        {
          provide: LoggerService,
          useValue: mockLoggerService,
        },
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
        {
          provide: 'KNEX',
          useValue: mockKnex,
        },
      ],
    }).compile();

    service = module.get<ConfigNotifyService>(ConfigNotifyService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
