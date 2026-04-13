/**
 * Jest mock for @tazama-lf/frms-coe-startup-lib
 * This prevents import-time crashes during unit tests in CI environments
 * where the real startup library dependencies may not be available.
 */

class MockStartupFactory {
  init = jest.fn().mockResolvedValue(undefined);
  handleResponse = jest.fn().mockResolvedValue(undefined);
}

module.exports = {
  StartupFactory: MockStartupFactory,
  __esModule: true,
  default: MockStartupFactory,
};
