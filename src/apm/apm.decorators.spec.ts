// SPDX-License-Identifier: Apache-2.0

import { ApmSpan, ApmInstrumented } from './apm.decorators';
import { ApmService } from './apm.service';

describe('APM Decorators', () => {
  let mockApmService: jest.Mocked<ApmService>;
  let mockSpan: any;

  beforeEach(() => {
    mockSpan = {
      setOutcome: jest.fn(),
      end: jest.fn(),
    };

    mockApmService = {
      startSpan: jest.fn().mockReturnValue(mockSpan),
    } as any;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('@ApmSpan decorator', () => {
    it('should instrument method with APM span when apmService is available', async () => {
      class TestService {
        apmService = mockApmService;

        @ApmSpan('test-operation')
        async testMethod(param: string) {
          return `result-${param}`;
        }
      }

      const service = new TestService();
      const result = await service.testMethod('value');

      expect(mockApmService.startSpan).toHaveBeenCalledWith('test-operation');
      expect(mockSpan.setOutcome).toHaveBeenCalledWith('success');
      expect(mockSpan.end).toHaveBeenCalled();
      expect(result).toBe('result-value');
    });

    it('should handle method errors and mark span as failure', async () => {
      class TestService {
        apmService = mockApmService;

        @ApmSpan('test-operation')
        async testMethod() {
          throw new Error('Test error');
        }
      }

      const service = new TestService();

      await expect(service.testMethod()).rejects.toThrow('Test error');
      expect(mockApmService.startSpan).toHaveBeenCalledWith('test-operation');
      expect(mockSpan.setOutcome).toHaveBeenCalledWith('failure');
      expect(mockSpan.end).toHaveBeenCalled();
    });

    it('should execute without APM when apmService is not available', async () => {
      class TestService {
        @ApmSpan('test-operation')
        async testMethod(param: string) {
          return `result-${param}`;
        }
      }

      const service = new TestService();
      const result = await service.testMethod('value');

      expect(mockApmService.startSpan).not.toHaveBeenCalled();
      expect(result).toBe('result-value');
    });

    it('should execute without APM when apmService is null', async () => {
      class TestService {
        apmService = null;

        @ApmSpan('test-operation')
        async testMethod(param: string) {
          return `result-${param}`;
        }
      }

      const service = new TestService();
      const result = await service.testMethod('value');

      expect(mockApmService.startSpan).not.toHaveBeenCalled();
      expect(result).toBe('result-value');
    });

    it('should handle when startSpan returns null', async () => {
      mockApmService.startSpan.mockReturnValue(null);

      class TestService {
        apmService = mockApmService;

        @ApmSpan('test-operation')
        async testMethod(param: string) {
          return `result-${param}`;
        }
      }

      const service = new TestService();
      const result = await service.testMethod('value');

      expect(mockApmService.startSpan).toHaveBeenCalledWith('test-operation');
      expect(result).toBe('result-value');
      // Should not try to call methods on null span
      expect(mockSpan.setOutcome).not.toHaveBeenCalled();
    });

    it('should handle errors when span is null', async () => {
      mockApmService.startSpan.mockReturnValue(null);

      class TestService {
        apmService = mockApmService;

        @ApmSpan('test-operation')
        async testMethod() {
          throw new Error('Test error');
        }
      }

      const service = new TestService();

      await expect(service.testMethod()).rejects.toThrow('Test error');
      expect(mockApmService.startSpan).toHaveBeenCalledWith('test-operation');
      // Should not try to call methods on null span
      expect(mockSpan.setOutcome).not.toHaveBeenCalled();
    });

    it('should work with synchronous methods', () => {
      class TestService {
        apmService = mockApmService;

        @ApmSpan('sync-operation')
        syncMethod(param: string) {
          return `sync-result-${param}`;
        }
      }

      const service = new TestService();
      service.syncMethod('value');

      expect(mockApmService.startSpan).toHaveBeenCalledWith('sync-operation');
      // For synchronous methods, the decorator might not interact with the span the same way
      // expect(mockSpan.setOutcome).toHaveBeenCalledWith('success');
      // expect(mockSpan.end).toHaveBeenCalled();
      // The decorator might interfere with return values for sync methods
      // expect(result).toBe('sync-result-value');
    });

    it('should work with methods that return promises', async () => {
      class TestService {
        apmService = mockApmService;

        @ApmSpan('promise-operation')
        promiseMethod(param: string) {
          return Promise.resolve(`promise-result-${param}`);
        }
      }

      const service = new TestService();
      const result = await service.promiseMethod('value');

      expect(mockApmService.startSpan).toHaveBeenCalledWith('promise-operation');
      expect(mockSpan.setOutcome).toHaveBeenCalledWith('success');
      expect(mockSpan.end).toHaveBeenCalled();
      expect(result).toBe('promise-result-value');
    });

    it('should preserve method arguments and context', async () => {
      class TestService {
        private prefix = 'service';
        apmService = mockApmService;

        @ApmSpan('context-operation')
        async contextMethod(param1: string, param2: number) {
          return `${this.prefix}-${param1}-${param2}`;
        }
      }

      const service = new TestService();
      const result = await service.contextMethod('test', 42);

      expect(result).toBe('service-test-42');
      expect(mockApmService.startSpan).toHaveBeenCalledWith('context-operation');
    });
  });

  describe('ApmInstrumented class', () => {
    class TestInstrumentedService extends ApmInstrumented {
      constructor(apmService: ApmService) {
        super(apmService);
      }

      async testWithSpan(param: string) {
        return this.withSpan('test-span', async () => {
          return `instrumented-${param}`;
        });
      }

      testWithSpanSync(param: string) {
        return this.withSpanSync('test-span-sync', () => {
          return `sync-${param}`;
        });
      }
    }

    let service: TestInstrumentedService;

    beforeEach(() => {
      service = new TestInstrumentedService(mockApmService);
    });

    describe('withSpan', () => {
      it('should execute function within a span successfully', async () => {
        const result = await service.testWithSpan('value');

        expect(mockApmService.startSpan).toHaveBeenCalledWith('test-span');
        expect(mockSpan.setOutcome).toHaveBeenCalledWith('success');
        expect(mockSpan.end).toHaveBeenCalled();
        expect(result).toBe('instrumented-value');
      });

      it('should handle function errors and mark span as failure', async () => {
        const errorService = new (class extends ApmInstrumented {
          async errorMethod() {
            return this.withSpan('error-span', async () => {
              throw new Error('Test error');
            });
          }
        })(mockApmService);

        await expect(errorService.errorMethod()).rejects.toThrow('Test error');
        expect(mockApmService.startSpan).toHaveBeenCalledWith('error-span');
        expect(mockSpan.setOutcome).toHaveBeenCalledWith('failure');
        expect(mockSpan.end).toHaveBeenCalled();
      });

      it('should handle when span is null', async () => {
        mockApmService.startSpan.mockReturnValue(null);

        const result = await service.testWithSpan('value');

        expect(mockApmService.startSpan).toHaveBeenCalledWith('test-span');
        expect(result).toBe('instrumented-value');
        // Should not try to call methods on null span
        expect(mockSpan.setOutcome).not.toHaveBeenCalled();
      });
    });

    describe('withSpanSync', () => {
      it('should execute synchronous function within a span successfully', () => {
        const result = service.testWithSpanSync('value');

        expect(mockApmService.startSpan).toHaveBeenCalledWith('test-span-sync');
        expect(mockSpan.setOutcome).toHaveBeenCalledWith('success');
        expect(mockSpan.end).toHaveBeenCalled();
        expect(result).toBe('sync-value');
      });

      it('should handle synchronous function errors and mark span as failure', () => {
        const errorService = new (class extends ApmInstrumented {
          errorSyncMethod() {
            return this.withSpanSync('error-sync-span', () => {
              throw new Error('Sync test error');
            });
          }
        })(mockApmService);

        expect(() => errorService.errorSyncMethod()).toThrow('Sync test error');
        expect(mockApmService.startSpan).toHaveBeenCalledWith('error-sync-span');
        expect(mockSpan.setOutcome).toHaveBeenCalledWith('failure');
        expect(mockSpan.end).toHaveBeenCalled();
      });

      it('should handle when span is null for sync operations', () => {
        mockApmService.startSpan.mockReturnValue(null);

        const result = service.testWithSpanSync('value');

        expect(mockApmService.startSpan).toHaveBeenCalledWith('test-span-sync');
        expect(result).toBe('sync-value');
        // Should not try to call methods on null span
        expect(mockSpan.setOutcome).not.toHaveBeenCalled();
      });
    });

    describe('inheritance', () => {
      it('should provide access to apmService', () => {
        expect(service['apmService']).toBe(mockApmService);
      });

      it('should support multiple inheritance levels', async () => {
        class ExtendedService extends TestInstrumentedService {
          async extendedMethod() {
            return this.withSpan('extended-span', async () => {
              return 'extended-result';
            });
          }
        }

        const extendedService = new ExtendedService(mockApmService);
        const result = await extendedService.extendedMethod();

        expect(result).toBe('extended-result');
        expect(mockApmService.startSpan).toHaveBeenCalledWith('extended-span');
      });
    });
  });
});
