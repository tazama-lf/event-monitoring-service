// SPDX-License-Identifier: Apache-2.0

describe('APM Index Exports', () => {
  it('should export all APM components', () => {
    const apmIndex = require('./index');

    expect(apmIndex.ApmModule).toBeDefined();
    expect(apmIndex.ApmService).toBeDefined();
    expect(apmIndex.ApmInterceptor).toBeDefined();
    expect(apmIndex.ApmSpan).toBeDefined();
    expect(apmIndex.ApmInstrumented).toBeDefined();
  });

  it('should have correct exports available', () => {
    // Use dynamic import to test exports
    const { ApmModule, ApmService, ApmInterceptor, ApmSpan, ApmInstrumented } = require('./index');

    expect(typeof ApmModule).toBe('function');
    expect(typeof ApmService).toBe('function');
    expect(typeof ApmInterceptor).toBe('function');
    expect(typeof ApmSpan).toBe('function');
    expect(typeof ApmInstrumented).toBe('function');
  });
});
