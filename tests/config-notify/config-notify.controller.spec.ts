import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ConfigNotifyController } from '../../src/config-notify/config-notify.controller';
import { ConfigNotifyService } from '../../src/config-notify/config-notify.service';
import { TazamaAuthGuard } from '../../src/auth/tazama-auth.guard';
import { PublishingStatus } from '../../src/enums/publishingStatus.enum';
import { UpdateCacheDto } from '../../src/config-notify/update-cache.dto';

describe('ConfigNotifyController', () => {
  let controller: ConfigNotifyController;
  let mockService: jest.Mocked<ConfigNotifyService>;

  beforeEach(async () => {
    mockService = {
      updateCache: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ConfigNotifyController],
      providers: [{ provide: ConfigNotifyService, useValue: mockService }],
    })
      .overrideGuard(TazamaAuthGuard)
      .useValue({ canActivate: jest.fn(() => true) })
      .compile();

    controller = module.get<ConfigNotifyController>(ConfigNotifyController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  describe('PATCH /config-notify/:id', () => {
    const makeBody = (status: PublishingStatus): UpdateCacheDto => {
      const dto = new UpdateCacheDto();
      dto.publishing_status = status;
      return dto;
    };

    it('should call service.updateCache with the parsed id and publishing_status', async () => {
      mockService.updateCache.mockResolvedValue(undefined);

      const result = await controller.updateCache(1, makeBody(PublishingStatus.ACTIVE));

      expect(mockService.updateCache).toHaveBeenCalledWith(1, PublishingStatus.ACTIVE);
      expect(result).toEqual({ message: 'Cache updated successfully for config ID: 1' });
    });

    it('should work for inactive publishing_status', async () => {
      mockService.updateCache.mockResolvedValue(undefined);

      const result = await controller.updateCache(42, makeBody(PublishingStatus.INACTIVE));

      expect(mockService.updateCache).toHaveBeenCalledWith(42, PublishingStatus.INACTIVE);
      expect(result).toEqual({ message: 'Cache updated successfully for config ID: 42' });
    });

    it('should propagate NotFoundException from the service', async () => {
      mockService.updateCache.mockRejectedValue(new NotFoundException('Config not found for ID: 99'));

      await expect(controller.updateCache(99, makeBody(PublishingStatus.ACTIVE))).rejects.toThrow(
        new NotFoundException('Config not found for ID: 99'),
      );
    });

    it('should propagate unexpected service errors', async () => {
      mockService.updateCache.mockRejectedValue(new Error('Unexpected DB failure'));

      await expect(controller.updateCache(1, makeBody(PublishingStatus.ACTIVE))).rejects.toThrow('Unexpected DB failure');
    });
  });
});
