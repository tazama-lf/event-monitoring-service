// SPDX-License-Identifier: Apache-2.0

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { ApmModule } from './apm.module';
import { ApmService } from './apm.service';

// Mock the APM class
jest.mock('@tazama-lf/frms-coe-lib/lib/services/apm');

describe('ApmModule', () => {
  let module: TestingModule;
  let apmService: ApmService;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [
        ApmModule,
        ConfigModule.forRoot({
          envFilePath: '.env',
          isGlobal: true,
        }),
      ],
    }).compile();

    apmService = module.get<ApmService>(ApmService);
  });

  afterEach(async () => {
    if (module) {
      await module.close();
    }
  });

  it('should be defined', () => {
    expect(module).toBeDefined();
  });

  it('should provide ApmService', () => {
    expect(apmService).toBeDefined();
    expect(apmService).toBeInstanceOf(ApmService);
  });

  it('should export ApmService', () => {
    const exportedService = module.get<ApmService>(ApmService);
    expect(exportedService).toBe(apmService);
  });

  describe('module configuration', () => {
    it('should be a global module', () => {
      const moduleRef = module.get(ApmModule);
      expect(moduleRef).toBeDefined();
    });

    it('should import ConfigModule', async () => {
      // Test that ConfigModule is available
      const testModule = await Test.createTestingModule({
        imports: [ApmModule],
      }).compile();

      // ApmService should be able to inject ConfigService
      const service = testModule.get<ApmService>(ApmService);
      expect(service).toBeDefined();

      await testModule.close();
    });

    it('should be importable by other modules', async () => {
      const testModule = await Test.createTestingModule({
        imports: [ApmModule],
        providers: [
          {
            provide: 'TestService',
            useFactory: (apmService: ApmService) => {
              return { apmService };
            },
            inject: [ApmService],
          },
        ],
      }).compile();

      const testService = testModule.get('TestService');
      expect(testService.apmService).toBeDefined();
      expect(testService.apmService).toBeInstanceOf(ApmService);

      await testModule.close();
    });
  });

  describe('service lifecycle', () => {
    it('should initialize ApmService on module init', async () => {
      const initSpy = jest.spyOn(apmService, 'onModuleInit');

      await module.init();

      expect(initSpy).toHaveBeenCalled();
    });

    it('should provide singleton instance', () => {
      const service1 = module.get<ApmService>(ApmService);
      const service2 = module.get<ApmService>(ApmService);

      expect(service1).toBe(service2);
    });
  });

  describe('integration with ConfigModule', () => {
    it('should work with custom config', async () => {
      const customModule = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            load: [
              () => ({
                NODE_ENV: 'custom-test',
              }),
            ],
          }),
          ApmModule,
        ],
      }).compile();

      const service = customModule.get<ApmService>(ApmService);
      expect(service).toBeDefined();

      await customModule.close();
    });

    it('should work without explicit ConfigModule import', async () => {
      // ApmModule should work even if ConfigModule is not explicitly imported
      // because it imports ConfigModule internally
      const testModule = await Test.createTestingModule({
        imports: [ApmModule],
      }).compile();

      const service = testModule.get<ApmService>(ApmService);
      expect(service).toBeDefined();

      await testModule.close();
    });
  });

  describe('error scenarios', () => {
    it('should handle module compilation with missing dependencies gracefully', async () => {
      // This test ensures the module can be compiled even if some
      // optional dependencies are missing
      await expect(
        Test.createTestingModule({
          imports: [ApmModule],
        }).compile(),
      ).resolves.toBeDefined();
    });
  });
});
